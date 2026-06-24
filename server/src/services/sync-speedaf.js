const pool = require('../config/db');
const speedaf = require('./speedaf');

let timer = null;
let isRunning = false;

async function syncActiveShipments() {
  if (isRunning) return;
  isRunning = true;

  try {
    // Find Speedaf shipments still in transit — status not terminal
    const [rows] = await pool.query(
      "SELECT sr.gig_tracking AS waybill FROM shipping_records sr WHERE sr.delivery_method = 'speedaf' AND sr.status IN ('pending','in_transit','returning') AND sr.gig_tracking != ''"
    );

    if (rows.length === 0) {
      console.log('[Speedaf Sync] No active shipments to sync');
      return;
    }

    console.log(`[Speedaf Sync] Syncing ${rows.length} active shipment(s)...`);
    let updated = 0;

    for (const row of rows) {
      try {
        const result = await speedaf.trackQuery(row.waybill);
        const tracks = result.data || [];
        if (tracks.length === 0) continue;

        // Insert tracking events
        const { upsertShipment, insertTrackingEvents } = require('../routes/speedaf');
        // We can't require routes here (circular). Do inline.
        for (const t of tracks) {
          const eventTime = t.time || t.scanTime || '';
          const statusCode = String(t.action || t.scanStatus || '');
          if (!eventTime) continue;
          try {
            await pool.query(
              `INSERT IGNORE INTO speedaf_tracking_events (waybill, event_time, location, status_code, status_description, operator_name)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [row.waybill, eventTime, t.location || '', statusCode, (t.actionName || t.description || ''), (t.operatorName || '')]
            );
          } catch {}
        }

        // Update status
        const last = tracks[tracks.length - 1];
        const code = String(last.action || last.scanStatus || '');
        const STATUS_MAP = { '10': 'pending', '1': 'in_transit', '2': 'in_transit', '3': 'in_transit', '4': 'in_transit', '5': 'delivered', '-710': 'returning', '730': 'returned', '-10': 'cancelled' };
        const newStatus = STATUS_MAP[code];
        const desc = (last.actionName || last.description || '') + (last.location ? ' - ' + last.location : '');

        if (newStatus) {
          await pool.query(
            "UPDATE shipping_records SET status = ?, status_since = NOW(), updated_at = NOW(), updated_by = 'SpeedafSync' WHERE gig_tracking = ?",
            [newStatus, row.waybill]
          );
        }

        // Update shipment cache
        await pool.query(
          `INSERT INTO speedaf_shipments (waybill, current_status, current_status_desc, tracking_raw, last_synced_at)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE current_status = VALUES(current_status), current_status_desc = VALUES(current_status_desc), tracking_raw = VALUES(tracking_raw), last_synced_at = NOW()`,
          [row.waybill, newStatus || code, desc, JSON.stringify(tracks)]
        );

        updated++;
      } catch (e) {
        console.error(`[Speedaf Sync] Error syncing ${row.waybill}:`, e.message);
      }

      // Rate limit: 500ms between API calls
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[Speedaf Sync] Done — ${updated}/${rows.length} updated`);
  } catch (err) {
    console.error('[Speedaf Sync] Error:', err.message);
  } finally {
    isRunning = false;
  }
}

function getNigeriaHour() {
  // Nigeria is UTC+1
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  return { hour: (utcH + 1) % 24, minute: utcM };
}

function getInitialDelay() {
  const { hour, minute } = getNigeriaHour();
  const nowMinutes = hour * 60 + minute;
  const startMinutes = 9 * 60;  // 09:00
  const endMinutes = 23 * 60;   // 23:00

  let waitMs;
  if (nowMinutes < startMinutes) {
    // Before 9am — wait until 9am + small jitter
    waitMs = (startMinutes - nowMinutes) * 60 * 1000;
  } else if (nowMinutes >= endMinutes) {
    // After 11pm — wait until next day 9am
    waitMs = (24 * 60 - nowMinutes + startMinutes) * 60 * 1000;
  } else {
    // In window — start in 30-120s (random jitter)
    waitMs = (30 + Math.floor(Math.random() * 90)) * 1000;
  }

  // Add +/- 3 min jitter
  waitMs += (Math.floor(Math.random() * 6) - 3) * 60 * 1000;
  return Math.max(10000, waitMs);
}

function isInTimeWindow() {
  const { hour } = getNigeriaHour();
  return hour >= 9 && hour < 23;
}

function startSyncScheduler() {
  if (timer) return;

  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const delay = getInitialDelay();
  const delayMin = Math.round(delay / 60000);

  console.log(`[Speedaf Sync] Scheduler: every 2h, 9AM–11PM Nigeria time. First run in ~${delayMin}min`);

  timer = setTimeout(() => {
    if (isInTimeWindow()) syncActiveShipments();
    timer = setInterval(() => {
      if (isInTimeWindow()) syncActiveShipments();
      else console.log('[Speedaf Sync] Outside time window, skipping');
    }, TWO_HOURS);
  }, delay);
}

function stopSyncScheduler() {
  if (timer) { clearTimeout(timer); clearInterval(timer); timer = null; }
}

module.exports = { syncActiveShipments, startSyncScheduler, stopSyncScheduler };
