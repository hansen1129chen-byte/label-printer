/**
 * GIGL Sync Scheduler
 *
 * - Runs every ~2h (±5 min jitter), only between 10:00–18:00
 * - Pulls last 7 days GIGL shipments
 * - Matches local orders (PENDING) by customer name + partial phone → auto-fill tracking
 * - For IN_TRANSIT GIG orders: checks if delivered on GIGL side → auto-complete
 * - If waybill already tracked locally, overwrite status with latest GIGL data
 * - Operator logged as "GIGL"
 */
const gigl = require('./gigl');
const pool = require('../config/db');
const { lastDigits, nameMatches, scoreCandidate, isDelivered, isCancelled } = require('./matching');

const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const JITTER_MS = 5 * 60 * 1000;              // ±5 minutes
const NIGERIA_OFFSET_MS = 1 * 60 * 60 * 1000; // UTC+1

let syncTimer = null;
let isSyncing = false;  // prevent concurrent sync

/**
 * Get current Nigeria (UTC+1) time as a Date-like object.
 * We work with UTC and offset so scheduling math stays correct.
 */
function nigeriaNow() {
  const now = Date.now();
  return new Date(now + NIGERIA_OFFSET_MS);
}

/**
 * Get Nigeria hour (0-23) from a UTC timestamp.
 */
function nigeriaHour(ts = Date.now()) {
  return new Date(ts + NIGERIA_OFFSET_MS).getUTCHours();
}


/**
 * Log a shipping action with operator "GIGL".
 */
async function logGiglAction(shippingId, action, detail) {
  await pool.query(
    'INSERT INTO shipping_logs (shipping_id, action, detail, operator) VALUES (?,?,?,?)',
    [shippingId, action, detail, 'GIGL']
  );
}

/**
 * Check if current Nigeria time is within the sync window (10:00–18:00 WAT).
 */
function isWithinSyncWindow() {
  const hour = nigeriaHour();
  return hour >= 10 && hour < 18;
}

// ── matching ─────────────────────────────────────────────────────────

/**
 * Match a GIGL shipment against local PENDING shipping records.
 *
 * Step 1: Filter by name + phone (must pass both)
 * Step 2: Score each candidate by date proximity + amount proximity
 * Step 3: Pick the best match (highest score, minimum threshold = 3)
 *
 * This handles repeat customers by favoring the closest order in time & value.
 */
async function findMatchingShipping(giglOrder, trackData) {
  const giglName = giglOrder.receiverName || '';
  const giglPhoneDigits = lastDigits(giglOrder.receiverPhoneNumber, 4);
  // Prefer full phone from tracking if available
  const giglFullPhone = lastDigits(trackData?.receiverPhoneNumber || giglOrder.receiverPhoneNumber, 4);
  const giglAmount = Number(giglOrder.grandTotal || 0);
  const giglDate = giglOrder.dateCreated ? new Date(giglOrder.dateCreated) : null;

  if (!giglName || !giglPhoneDigits) return null;

  // Find all PENDING GIG shipping records without tracking
  const [rows] = await pool.query(
    `SELECT sr.*, o.customer_name, o.customer_phone, o.order_no,
            o.total_amount, o.actual_amount,
            COALESCE(o.order_time, o.created_at) AS order_created_at
     FROM shipping_records sr
     JOIN orders o ON sr.order_id = o.id
     WHERE sr.status = 'pending'
       AND (sr.delivery_method = 'gig' OR sr.delivery_method IS NULL OR sr.delivery_method = '')
       AND (sr.gig_tracking = '' OR sr.gig_tracking IS NULL)`
  );

  const candidates = [];

  for (const row of rows) {
    const localName = row.customer_name || '';
    const localPhoneDigits = lastDigits(row.customer_phone, 4);

    if (!localPhoneDigits) continue;

    // Must pass name + phone
    if (!nameMatches(localName, giglName)) continue;
    // Phone: match either masked last-4 or full last-4 from tracking
    if (localPhoneDigits !== giglPhoneDigits && localPhoneDigits !== giglFullPhone) continue;

    // ── Score this candidate ──
    const score = scoreCandidate(row, {
      receiver_name: giglName,
      grand_total: giglAmount,
      date_created: giglDate
    });
    candidates.push({ row, score });
  }

  if (candidates.length === 0) return null;

  // Sort by score desc
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // If multiple candidates exist, don't auto-match — let user pick manually
  if (candidates.length > 1) {
    console.log(`[GIGL Sync] Skipped auto-match for "${giglName}" — ${candidates.length} candidates (${candidates.map(c => c.row.order_no).join(', ')})`);
    return null;
  }

  // Single candidate — auto-match as long as there's some date proximity
  if (best.score >= 3) {
    return best.row;
  }

  console.log(`[GIGL Sync] Match rejected for "${giglName}" — best score ${best.score} below threshold (candidates: ${candidates.map(c => c.row.order_no + ':' + c.score).join(', ')})`);
  return null;
}

// ── gigl_shipments table helpers ─────────────────────────────────────

/**
 * UPSERT a GIGL shipment record with all available data.
 */
async function upsertGiglShipment(s, trackData, matchedShippingId) {
  const delivered = isDelivered(trackData);
  const cancelled = isCancelled(trackData) || (s.isCancelled ? true : false);

  // GIGL's currentScanStatusDescription can be stale — prefer last tracking history entry
  const history = trackData?.fullTrackHistory || [];
  const lastEvent = history[history.length - 1];
  const scanStatus = lastEvent?.scanStatusIncident
    || trackData?.currentScanStatusDescription
    || '';

  const trackingRaw = trackData ? JSON.stringify(trackData) : null;

  // Upsert tracking events into gigl_tracking_events (dedup by INSERT IGNORE)
  if (history.length > 0) {
    const eventValues = [];
    const eventParams = [];
    for (const evt of history) {
      eventValues.push('(?, ?, ?, ?, ?, ?, ?, ?)');
      eventParams.push(
        s.waybill,
        new Date(evt.dateTime),
        evt.location || '',
        evt.code || evt.status || '',
        evt.scanStatusIncident || '',
        evt.scanStatusReason || '',
        evt.scanStatusComment || '',
        evt.user || ''
      );
    }
    // INSERT IGNORE to avoid duplicates
    await pool.query(
      `INSERT IGNORE INTO gigl_tracking_events (waybill, event_time, location, status_code, status_description, status_reason, status_comment, operator_name)
       VALUES ${eventValues.join(', ')}`,
      eventParams
    );
  }

  await pool.query(
    `INSERT INTO gigl_shipments (
       waybill, receiver_name, receiver_phone, grand_total, payment_status,
       shipment_scan_status, current_scan_status, is_cancelled, is_delivered,
       date_created, tracking_raw, matched_shipping_id,
       shipment_source, gigl_shipment_id, is_express_dropoff, is_from_mobile,
       is_international, delivery_option_id, destination, sender_phone, date_modified,
       last_synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       receiver_name = VALUES(receiver_name),
       receiver_phone = VALUES(receiver_phone),
       grand_total = VALUES(grand_total),
       payment_status = VALUES(payment_status),
       shipment_scan_status = VALUES(shipment_scan_status),
       current_scan_status = VALUES(current_scan_status),
       is_cancelled = VALUES(is_cancelled),
       is_delivered = VALUES(is_delivered),
       tracking_raw = COALESCE(VALUES(tracking_raw), tracking_raw),
       matched_shipping_id = COALESCE(VALUES(matched_shipping_id), matched_shipping_id),
       shipment_source = VALUES(shipment_source),
       gigl_shipment_id = VALUES(gigl_shipment_id),
       is_express_dropoff = VALUES(is_express_dropoff),
       is_from_mobile = VALUES(is_from_mobile),
       is_international = VALUES(is_international),
       delivery_option_id = VALUES(delivery_option_id),
       destination = VALUES(destination),
       sender_phone = VALUES(sender_phone),
       date_modified = VALUES(date_modified),
       last_synced_at = NOW()`,
    [
      s.waybill,
      s.receiverName || '',
      s.receiverPhoneNumber || '',
      s.grandTotal || 0,
      s.paymentStatus || 0,
      s.shipmentScanStatus ?? 0,
      scanStatus,
      cancelled ? 1 : 0,
      delivered ? 1 : 0,
      s.dateCreated ? new Date(s.dateCreated) : null,
      trackingRaw,
      matchedShippingId || null,
      // Extended fields
      s.shipmentSource || '',
      s.shipmentId || null,
      s.isExpressDropoff ? 1 : 0,
      s.isFromMobile ? 1 : 0,
      s.isInternational ? 1 : 0,
      s.deliveryOptionId ?? null,
      trackData?.destination || '',
      trackData?.senderPhoneNumber || '',
      s.dateModified ? new Date(s.dateModified) : null,
    ]
  );
}

/**
 * Calculate the start date for GIGL shipment query.
 * - Find the earliest pending GIG order's creation time
 * - Subtract 7 days buffer
 * - Minimum: today - 7 days
 */
async function getSyncStartDate() {
  const [rows] = await pool.query(
    `SELECT MIN(o.created_at) AS earliest
     FROM shipping_records sr
     JOIN orders o ON sr.order_id = o.id
     WHERE sr.status = 'pending'
       AND sr.delivery_method = 'gig'`
  );
  const earliestPending = rows[0]?.earliest ? new Date(rows[0].earliest) : null;

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Pick the earlier of the two, but never less than 7 days ago
  if (earliestPending && earliestPending < sevenDaysAgo) {
    const buffered = new Date(earliestPending);
    buffered.setDate(buffered.getDate() - 7);
    return buffered.toISOString().slice(0, 10);
  }
  return sevenDaysAgo.toISOString().slice(0, 10);
}

// ── main sync logic ──────────────────────────────────────────────────

async function syncGiglOrders() {
  if (isSyncing) {
    console.log('[GIGL Sync] Skipped — previous sync still running');
    return;
  }

  console.log('[GIGL Sync] ========== Starting sync ==========');

  if (!isWithinSyncWindow()) {
    console.log('[GIGL Sync] Outside sync window (10:00-18:00 WAT), skipping');
    return;
  }

  isSyncing = true;

  try {
    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);

    // ═══ Step 1: Smart date range + fetch GIGL list ═══
    const startDate = await getSyncStartDate();
    console.log(`[GIGL Sync] Step 1 — Fetching ${startDate} ~ ${endDate}`);
    const shipments = await gigl.getShipments(startDate, endDate);
    console.log(`[GIGL Sync] Got ${shipments.length} GIGL shipments`);

    let matchedCount = 0;
    let deliveryCount = 0;
    let statusUpdateCount = 0;
    let upsertCount = 0;

    // ═══ Step 2 & 4: Process new waybills — match + write events ═══
    for (const s of shipments) {
      const waybill = s.waybill;
      if (!waybill) continue;

      // Skip cancelled GIGL waybills — don't match or auto-fill
      if (s.isCancelled) continue;

      // Check if already tracked locally
      const [existingRows] = await pool.query(
        `SELECT sr.*, o.customer_name
         FROM shipping_records sr
         JOIN orders o ON sr.order_id = o.id
         WHERE sr.gig_tracking = ?`,
        [waybill]
      );

      if (existingRows.length > 0) {
        const existing = existingRows[0];
        const oldStatus = existing.status;

        // If already delivered/returned, skip (Step 4)
        if (oldStatus === 'delivered' || oldStatus === 'returned') {
          // Still UPSERT gigl_shipments for data completeness, no tracking update
          await upsertGiglShipment(s, null, existing.id);
          upsertCount++;
          continue;
        }

        // Track + update events + status
        const trackData = await gigl.trackShipment(waybill);
        await upsertGiglShipment(s, trackData, existing.id);

        if (isDelivered(trackData)) {
          await pool.query(
            `UPDATE shipping_records SET status = 'delivered', updated_at = NOW(), updated_by = 'GIGL'
             WHERE id = ? AND status IN ('pending', 'in_transit')`,
            [existing.id]
          );
          await logGiglAction(existing.id, 'deliver',
            `GIGL auto-delivered (waybill ${waybill})`);
          console.log(`[GIGL Sync] Auto-delivered: ${existing.customer_name} | ${waybill}`);
          deliveryCount++;
        } else if (oldStatus === 'pending') {
          await pool.query(
            `UPDATE shipping_records SET status = 'in_transit', shipped_at = NOW(), updated_by = 'GIGL'
             WHERE id = ? AND status = 'pending'`,
            [existing.id]
          );
          await logGiglAction(existing.id, 'confirm_ship',
            `GIGL auto-confirmed (waybill ${waybill})`);
          console.log(`[GIGL Sync] Auto-confirmed: ${existing.customer_name} | ${waybill}`);
          statusUpdateCount++;
        }
        upsertCount++;
        continue;
      }

      // ── New waybill — track → match → check 1-to-many → upsert ──
      const trackData = await gigl.trackShipment(waybill);
      const match = await findMatchingShipping(s, trackData);

      // Check 1-to-many BEFORE setting matched_shipping_id
      let shouldAutoMatch = false;
      if (match) {
        const [otherWaybills] = await pool.query(
          `SELECT waybill FROM gigl_shipments
           WHERE matched_shipping_id IS NULL AND is_cancelled = 0
             AND waybill != ? AND (receiver_name = ? COLLATE utf8mb4_general_ci OR receiver_name LIKE ?)`,
          [waybill, s.receiverName, '%' + (match.customer_name || '') + '%']
        );
        if (otherWaybills.length > 0) {
          console.log(`[GIGL Sync] Skipped 1-to-many: "${s.receiverName}" — multiple GIGL waybills (${waybill}, ${otherWaybills.map(r=>r.waybill).join(',')})`);
          // Pre-set delivery_method to GIG so user doesn't need to select
          await pool.query('UPDATE shipping_records SET delivery_method = ? WHERE id = ?', ['gig', match.id]);
        } else {
          shouldAutoMatch = true;
        }
      }

      await upsertGiglShipment(s, trackData, shouldAutoMatch ? match.id : null);

      if (shouldAutoMatch) {

        await pool.query(
          `UPDATE shipping_records SET delivery_method = 'gig', gig_tracking = ?, updated_by = 'GIGL', updated_at = NOW()
           WHERE id = ?`,
          [waybill, match.id]
        );
        await logGiglAction(match.id, 'modify',
          `GIGL auto-matched tracking: ${waybill} | GIGL name: ${s.receiverName}`);

        if (isDelivered(trackData)) {
          await pool.query(
            `UPDATE shipping_records SET status = 'delivered', updated_by = 'GIGL', updated_at = NOW()
             WHERE id = ?`,
            [match.id]
          );
          await logGiglAction(match.id, 'deliver',
            `GIGL auto-delivered (waybill ${waybill})`);
          deliveryCount++;
        } else {
          await pool.query(
            `UPDATE shipping_records SET status = 'in_transit', shipped_at = NOW(), updated_by = 'GIGL'
             WHERE id = ? AND status = 'pending'`,
            [match.id]
          );
          await logGiglAction(match.id, 'confirm_ship',
            `GIGL auto-confirmed (waybill ${waybill})`);
          statusUpdateCount++;
        }

        matchedCount++;
        console.log(`[GIGL Sync] Matched: ${match.customer_name} (${match.order_no}) ← ${waybill} (${s.receiverName})`);
      }

      upsertCount++;
    }

    // ═══ Step 3: Update status for existing tracking (with 2h cache) ═══
    // Only track shipments that haven't been synced in the last 2 hours
    const [staleRows] = await pool.query(
      `SELECT sr.*, o.customer_name
       FROM shipping_records sr
       JOIN orders o ON sr.order_id = o.id
       LEFT JOIN gigl_shipments gs ON sr.gig_tracking = gs.waybill
       WHERE sr.delivery_method = 'gig'
         AND sr.gig_tracking != ''
         AND sr.gig_tracking IS NOT NULL
         AND sr.status IN ('pending', 'in_transit')
         AND (gs.last_synced_at IS NULL OR gs.last_synced_at < DATE_SUB(NOW(), INTERVAL 2 HOUR))`
    );

    if (staleRows.length > 0) {
      console.log(`[GIGL Sync] Step 3 — Checking ${staleRows.length} stale tracking records`);
    }

    for (const row of staleRows) {
      try {
        const trackData = await gigl.trackShipment(row.gig_tracking);
        if (!trackData) continue;

        // Update gigl_shipments + events
        const [gsRow] = await pool.query('SELECT * FROM gigl_shipments WHERE waybill = ?', [row.gig_tracking]);
        const sData = gsRow[0] || {};
        await upsertGiglShipment({ waybill: row.gig_tracking, ...sData }, trackData, row.id);

        if (isDelivered(trackData) && row.status !== 'delivered') {
          await pool.query(
            `UPDATE shipping_records SET status = 'delivered', updated_at = NOW(), updated_by = 'GIGL'
             WHERE id = ?`,
            [row.id]
          );
          await logGiglAction(row.id, 'deliver',
            `GIGL auto-delivered (waybill ${row.gig_tracking})`);
          console.log(`[GIGL Sync] Auto-delivered (stale check): ${row.customer_name} | ${row.gig_tracking}`);
          deliveryCount++;
        }
      } catch (err) {
        console.error(`[GIGL Sync] Track error for ${row.gig_tracking}:`, err.message);
      }
    }

    console.log(`[GIGL Sync] Done — upserted: ${upsertCount}, matched: ${matchedCount}, status_updated: ${statusUpdateCount}, delivered: ${deliveryCount}`);

  } catch (err) {
    console.error('[GIGL Sync] Error:', err.message);
  } finally {
    isSyncing = false;
  }
}

// ── scheduler ────────────────────────────────────────────────────────

/**
 * Schedule the next sync using Nigeria time (UTC+1 / WAT).
 * - If next ~2h is still within 10:00-18:00 WAT → ~2h later with ±5 min jitter
 * - Otherwise → jump to tomorrow 10:00 WAT + jitter
 */
function scheduleNext() {
  const now = Date.now();

  // What Nigeria hour will it be ~2 hours from now?
  const futureNgHour = nigeriaHour(now + SYNC_INTERVAL_MS);

  let delay;
  if (futureNgHour < 18) {
    // Still within today's Nigeria window → schedule ~2h
    const jitter = Math.floor(Math.random() * (JITTER_MS * 2 + 1)) - JITTER_MS;
    delay = SYNC_INTERVAL_MS + jitter;
  } else {
    // Reached end of Nigeria window → jump to tomorrow 10:00 AM WAT
    const tenAmTomorrow = new Date(now + NIGERIA_OFFSET_MS);
    tenAmTomorrow.setUTCDate(tenAmTomorrow.getUTCDate() + 1);
    tenAmTomorrow.setUTCHours(10, 0, 0, 0);
    const tenAmEpoch = tenAmTomorrow.getTime() - NIGERIA_OFFSET_MS;
    const jitter = Math.floor(Math.random() * (JITTER_MS * 2 + 1)) - JITTER_MS;
    delay = tenAmEpoch - now + jitter;
  }

  const nextRun = new Date(now + delay);
  console.log(`[GIGL Sync] Next run: ${nextRun.toLocaleString()} (server time), Nigeria: ${new Date(now + delay + NIGERIA_OFFSET_MS).toISOString().slice(11,19)} WAT`);

  syncTimer = setTimeout(async () => {
    await syncGiglOrders();
    scheduleNext();
  }, delay);
}

/**
 * Calculate initial delay based on Nigeria time (UTC+1).
 * - Before 10:00 WAT → start at 10:00 + jitter
 * - Within 10:00–18:00 WAT → short random delay
 * - After 18:00 WAT → tomorrow 10:00 WAT + jitter
 */
function getInitialDelay() {
  const now = Date.now();
  const ngHour = nigeriaHour(now);

  // Random jitter for first run
  const jitter = Math.floor(Math.random() * (JITTER_MS * 2 + 1)) - JITTER_MS;

  if (ngHour < 10) {
    // Before 10:00 WAT → start at 10:00 Nigeria time
    const tenAmNg = new Date(now + NIGERIA_OFFSET_MS);
    tenAmNg.setUTCHours(10, 0, 0, 0);
    // Convert Nigeria 10:00 back to server-local epoch
    const tenAmEpoch = tenAmNg.getTime() - NIGERIA_OFFSET_MS;
    return tenAmEpoch - now + jitter;
  }

  if (ngHour < 18) {
    // Within window → short random initial delay
    const initialDelay = Math.floor(Math.random() * 5 * 60 * 1000) + 30 * 1000;
    console.log('[GIGL Sync] Already within Nigeria sync window (10:00-18:00 WAT), initial sync shortly');
    return initialDelay;
  }

  // After 18:00 WAT → tomorrow 10:00 Nigeria time
  const tenAmTomorrow = new Date(now + NIGERIA_OFFSET_MS);
  tenAmTomorrow.setUTCDate(tenAmTomorrow.getUTCDate() + 1);
  tenAmTomorrow.setUTCHours(10, 0, 0, 0);
  const tenAmEpoch = tenAmTomorrow.getTime() - NIGERIA_OFFSET_MS;
  return tenAmEpoch - now + jitter;
}

function startSyncScheduler() {
  if (!process.env.GIGL_EMAIL || !process.env.GIGL_PASSWORD) {
    console.log('[GIGL Sync] Not configured (GIGL_EMAIL/GIGL_PASSWORD missing), scheduler disabled');
    return;
  }

  const initialDelay = getInitialDelay();
  const firstRun = new Date(Date.now() + initialDelay);
  console.log(`[GIGL Sync] First run: ${firstRun.toLocaleString()} (in ${Math.round(initialDelay / 60000)} min)`);

  syncTimer = setTimeout(async () => {
    await syncGiglOrders();
    scheduleNext();
  }, initialDelay);
}

function stopSyncScheduler() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

module.exports = { syncGiglOrders, startSyncScheduler, stopSyncScheduler };
