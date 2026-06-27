const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const speedaf = require('../services/speedaf');
const router = express.Router();
router.use(authMiddleware);

const WEBHOOK_URL = 'https://parfco.vip/api/speedaf/webhook';

const STATUS_MAP = {
  '10': 'pending',
  '1': 'in_transit', '2': 'in_transit', '3': 'in_transit', '4': 'in_transit',
  '5': 'delivered',
  '-710': 'returning',
  '730': 'returned',
  '-10': 'cancelled',
};

// Upsert speedaf_shipments record
async function upsertShipment(waybill, data = {}) {
  await pool.query(
    `INSERT INTO speedaf_shipments (waybill, order_no, receiver_name, receiver_phone, destination, current_status, current_status_desc, matched_shipping_id, tracking_raw, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE current_status = VALUES(current_status), current_status_desc = VALUES(current_status_desc), tracking_raw = VALUES(tracking_raw), last_synced_at = NOW()`,
    [waybill, data.order_no || '', data.receiver_name || '', data.receiver_phone || '', data.destination || '', data.status || '', data.status_desc || '', data.shipping_id || null, data.tracking_raw || null]
  );
}

// Insert tracking events with dedup (by waybill + event_time + status_code)
async function insertTrackingEvents(tracksList) {
  if (!tracksList || tracksList.length === 0) return;
  for (const t of tracksList) {
    if (!t.waybill || !t.event_time) continue;
    try {
      await pool.query(
        `INSERT IGNORE INTO speedaf_tracking_events (waybill, event_time, location, status_code, status_description, operator_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [t.waybill, t.event_time, t.location || '', t.status_code || '', t.status_description || '', t.operator_name || '']
      );
    } catch (e) { /* skip duplicates */ }
  }
}

// ============ Routes ============

// POST /api/speedaf/create — create Speedaf order + auto-subscribe
router.post('/create', async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ message: 'order_id required' });

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? AND is_deleted = 0', [order_id]);
    if (orders.length === 0) return res.status(404).json({ message: 'Order not found' });

    const order = orders[0];

    const [items] = await pool.query(
      'SELECT oi.*, p.name AS product_name FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
      [order_id]
    );

    // Check if there's an existing unassigned record to reuse
    const [existing] = await pool.query(
      "SELECT id FROM shipping_records WHERE order_id = ? AND status = 'unassigned'",
      [order_id]
    );

    const result = await speedaf.createOrder(order, items);
    if (!result.success || !result.data?.billCode) {
      return res.json({ success: false, message: result.error?.message || result.data?.message || 'Speedaf create failed' });
    }

    const billCode = result.data.billCode;

    if (existing.length > 0) {
      // Reuse existing unassigned record
      await pool.query(
        "UPDATE shipping_records SET delivery_method='speedaf', gig_tracking=?, status='pending', status_since=NOW(), updated_at=NOW() WHERE id=?",
        [billCode, existing[0].id]
      );
    } else {
      const shippingCode = 'SHP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
      await pool.query(
        "INSERT INTO shipping_records (order_id, shipping_code, delivery_method, gig_tracking, status, status_since) VALUES (?,?,?,?,?, NOW())",
        [order_id, shippingCode, 'speedaf', billCode, 'pending']
      );
    }

    // Get shipping ID for reference
    const [sr] = await pool.query('SELECT id FROM shipping_records WHERE gig_tracking = ?', [billCode]);

    // Store in speedaf_shipments
    await upsertShipment(billCode, {
      order_no: order.order_no || '',
      receiver_name: order.customer_name || '',
      receiver_phone: (order.customer_phone || '').replace(/\D/g, '').slice(-10),
      destination: [order.accept_district, order.accept_city, order.accept_province].filter(Boolean).join(', ') || 'LAGOS',
      status: 'pending',
      status_desc: 'Order created, awaiting pickup',
      shipping_id: sr.length > 0 ? sr[0].id : null,
      tracking_raw: JSON.stringify(result),
    });

    // Auto-subscribe to tracking updates
    speedaf.trackSubscribe(billCode, WEBHOOK_URL).catch(() => {});

    res.json({ success: true, billCode });
  } catch (err) {
    console.error('[Speedaf create]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/speedaf/print/:billCode — get print label URL
router.post('/print/:billCode', async (req, res) => {
  try {
    const result = await speedaf.printLabel(req.params.billCode);
    const url = result.data?.urls?.[0] || result.data?.orderLabels?.[0]?.labelUrl || null;
    res.json({ success: !!url, url });
  } catch (err) {
    console.error('[Speedaf print]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/speedaf/track/:billCode — query tracking + store events locally
router.get('/track/:billCode', async (req, res) => {
  try {
    const billCode = req.params.billCode;
    const result = await speedaf.trackQuery(billCode);

    const [rows] = await pool.query(
      'SELECT sr.status, o.order_no FROM shipping_records sr JOIN orders o ON o.id = sr.order_id WHERE sr.gig_tracking = ?',
      [billCode]
    );
    const localStatus = rows.length > 0 ? rows[0].status : null;
    const orderNo = rows.length > 0 ? rows[0].order_no : null;

    let speedafStatus = 'pending', lastEvent = 'Order created, awaiting pickup';
    const tracks = result.data?.[0]?.tracks || [];

    // Store tracking events locally
    if (tracks.length > 0) {
      const events = tracks.map(t => ({
        waybill: billCode,
        event_time: t.time || t.scanTime || '',
        location: t.location || '',
        status_code: String(t.action || t.scanStatus || ''),
        status_description: t.msgEng || t.actionName || t.description || t.statusDescription || '',
        operator_name: t.operatorName || '',
      }));
      await insertTrackingEvents(events);

      const last = tracks[tracks.length - 1];
      const code = String(last.action || last.scanStatus || '');
      speedafStatus = STATUS_MAP[code] || 'pending';
      lastEvent = (last.msgEng || last.actionName || last.description || '') + ' - ' + (last.location || '');

      // Update speedaf_shipments
      await upsertShipment(billCode, { status: speedafStatus, status_desc: lastEvent, tracking_raw: JSON.stringify(tracks) });
    }

    res.json({
      billCode, orderNo, localStatus, speedafStatus, lastEvent,
      matched: localStatus === speedafStatus,
    });
  } catch (err) {
    console.error('[Speedaf track]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/speedaf/events/:billCode — local tracking events
router.get('/events/:billCode', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT event_time, location, status_code, status_description, operator_name FROM speedaf_tracking_events WHERE waybill = ? ORDER BY event_time DESC',
      [req.params.billCode]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Speedaf events]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/speedaf/sync — force sync local status from Speedaf
router.post('/sync', async (req, res) => {
  try {
    const { billCode } = req.body;
    if (!billCode) return res.status(400).json({ message: 'billCode required' });

    const result = await speedaf.trackQuery(billCode);
    const tracks = result.data?.[0]?.tracks || [];
    if (tracks.length === 0) return res.json({ success: false, message: 'No tracking data' });

    // Store tracking events
    const events = tracks.map(t => ({
      waybill: billCode,
      event_time: t.time || t.scanTime || '',
      location: t.location || '',
      status_code: String(t.action || t.scanStatus || ''),
      status_description: t.msgEng || t.actionName || t.description || t.statusDescription || '',
      operator_name: t.operatorName || '',
    }));
    await insertTrackingEvents(events);

    const last = tracks[tracks.length - 1];
    const code = String(last.action || last.scanStatus || '');
    const newStatus = STATUS_MAP[code];
    const lastEvent = (last.msgEng || last.actionName || last.description || '') + ' - ' + (last.location || '');

    if (newStatus) {
      await pool.query(
        "UPDATE shipping_records SET status = ?, status_since = NOW(), updated_at = NOW(), updated_by = 'SpeedafSync' WHERE gig_tracking = ?",
        [newStatus, billCode]
      );
    }

    // Update speedaf_shipments
    await upsertShipment(billCode, { status: newStatus || '', status_desc: lastEvent, tracking_raw: JSON.stringify(tracks) });

    res.json({ success: !!newStatus, newStatus: newStatus || tracks[tracks.length - 1]?.actionName || 'unknown' });
  } catch (err) {
    console.error('[Speedaf sync]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/speedaf/cancel — cancel Speedaf order
router.post('/cancel', async (req, res) => {
  try {
    const { billCode, reason } = req.body;
    if (!billCode) return res.status(400).json({ message: 'billCode required' });
    const result = await speedaf.cancelOrder(billCode, reason || 'Customer request');

    if (result.success) {
      const itemResult = result.data?.[0] || {};
      if (itemResult.success) {
        await pool.query(
          "UPDATE shipping_records SET delivery_method = NULL, gig_tracking = '', delivery_staff_id = NULL, delivery_staff_name = '', status = 'unassigned', status_since = NOW(), shipped_at = NULL, updated_at = NOW(), updated_by = ? WHERE gig_tracking = ?",
          [req.user?.username || 'admin', billCode]
        );
        await upsertShipment(billCode, { status: 'unassigned', status_desc: 'Rollback to Unassigned: ' + (reason || 'Customer request') });
        return res.json({ success: true, message: 'Rollback — back to Unassigned' });
      }
      return res.json({ success: false, message: itemResult.message || 'Cancel rejected by Speedaf' });
    }
    res.json({ success: false, message: result.error?.message || 'Cancel failed' });
  } catch (err) {
    console.error('[Speedaf cancel]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ Webhook (PUBLIC, no auth) ============
const webhookRouter = express.Router();
webhookRouter.post('/webhook', async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    for (const item of payload) {
      const { mailNo, action, scanStatus, time, location, description, actionName, msgEng, operatorName } = item;
      const statusCode = String(action || scanStatus || '');
      console.log('[Speedaf Webhook]', mailNo, statusCode, description || actionName);

      if (mailNo) {
        // Store tracking event
        await insertTrackingEvents([{
          waybill: mailNo,
          event_time: time || scanStatus || '',
          location: location || '',
          status_code: statusCode,
          status_description: msgEng || actionName || description || '',
          operator_name: operatorName || '',
        }]);

        // Update shipping status
        const newStatus = STATUS_MAP[statusCode];
        if (newStatus) {
          await pool.query(
            "UPDATE shipping_records SET status = ?, status_since = NOW(), updated_at = NOW(), updated_by = 'Speedaf' WHERE gig_tracking = ?",
            [newStatus, mailNo]
          );
        }

        // Update speedaf_shipments
        const desc = (actionName || description || '') + (location ? ' - ' + location : '');
        await upsertShipment(mailNo, { status: newStatus || statusCode, status_desc: desc });
      }
    }
    res.json({ data: '', error: { code: '', message: '' }, success: true });
  } catch (err) {
    console.error('[Speedaf Webhook]', err);
    res.status(500).json({ data: '', error: { code: '500', message: err.message }, success: false });
  }
});

module.exports = { router, webhookRouter };
