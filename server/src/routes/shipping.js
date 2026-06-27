const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { notifyCustomer } = require('../services/whatsapp');
const router = express.Router();
router.use(authMiddleware);

async function attachOvertime(rows) {
  try {
    const [alerts] = await pool.query('SELECT config_key, config_value FROM alert_config');
    const thresholds = {};
    alerts.forEach(a => { thresholds[a.config_key] = parseInt(a.config_value) || 0; });
    for (const row of rows) {
      const s = row.status;
      let start = null;
      if (s === 'pending') start = row.status_since || row.initiated_at;
      else if (s === 'in_transit') start = row.shipped_at;
      if (start) {
        let hours = 0;
        if (s === 'pending') hours = thresholds.pending_alert_hours || 24;
        else if (s === 'in_transit' && row.delivery_method === 'own') hours = thresholds.in_transit_own_alert_hours || 48;
        else if (s === 'in_transit') hours = thresholds.in_transit_gigl_alert_hours || 120;
        if (hours > 0) {
          const elapsed = (Date.now() - new Date(start).getTime()) / 3600000;
          row.overtime_hours = Math.round(elapsed * 10) / 10;
          row.is_overtime = elapsed > hours;
        } else { row.overtime_hours = null; row.is_overtime = false; }
      } else { row.overtime_hours = null; row.is_overtime = false; }
    }
  } catch (e) { /* ignore */ }
}

function genShippingCode() {
  return 'SHP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function logAction(shippingId, action, detail, operator) {
  await pool.query('INSERT INTO shipping_logs (shipping_id, action, detail, operator) VALUES (?,?,?,?)',
    [shippingId, action, detail, operator || '']);
}

// GET /api/shipping
router.get('/', async (req, res) => {
  try {
    const { status, date_from, date_to, order_no, customer, page = 1, page_size = 20, sort_by, sort_dir, tracking, delivery_staff_id } = req.query;
    let where = '1=1';
    const params = [];

    // Status tab filter
    if (status === 'unassigned') {
      where += " AND (sr.id IS NULL OR sr.status = 'unassigned')";
    } else if (status === 'pending') {
      where += " AND sr.status = 'pending' AND sr.delivery_method IS NOT NULL";
    } else if (status === 'returned') {
      where += " AND sr.status IN ('returned','failed')";
    } else if (status) {
      where += ' AND sr.status = ?'; params.push(status);
    }

    if (order_no) { where += ' AND o.order_no LIKE ?'; params.push('%'+order_no+'%'); }
    if (customer) { where += ' AND (o.customer_name LIKE ? OR o.customer_phone LIKE ?)'; params.push('%'+customer+'%', '%'+customer+'%'); }
    if (tracking) { where += ' AND sr.gig_tracking LIKE ?'; params.push('%'+tracking+'%'); }
    if (delivery_staff_id) { where += ' AND sr.delivery_staff_id = ?'; params.push(delivery_staff_id); }
    if (date_from) { where += ' AND COALESCE(o.order_time, o.created_at) >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND COALESCE(o.order_time, o.created_at) <= ?'; params.push(date_to + ' 23:59:59'); }

    const allowedSort = { order_no: 'o.order_no', created_at: 'o.created_at', order_time: 'o.order_time', status: 'sr.status' };
    const sortCol = allowedSort[sort_by] || 'COALESCE(sr.initiated_at, o.created_at)';
    const sortDir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const [rows] = await pool.query(
      `SELECT sr.id, o.id AS order_id, sr.shipping_code, sr.delivery_method, sr.gig_tracking,
        sr.delivery_staff_id, sr.status, sr.status_since, sr.initiated_at, sr.updated_at,
        COALESCE((SELECT MAX(event_time) FROM speedaf_tracking_events WHERE waybill = sr.gig_tracking), sr.shipped_at) AS shipped_at,
        sr.returned_at, sr.updated_by,
        ds.name AS delivery_staff_name,
        o.order_no, o.order_time, o.created_at AS order_created_at,
        o.customer_name, o.customer_phone, o.accept_province, o.customer_address, o.total_amount,
        o.streamer_id
       FROM orders o
       LEFT JOIN shipping_records sr ON sr.order_id = o.id
       LEFT JOIN delivery_staff ds ON sr.delivery_staff_id = ds.id
       WHERE o.is_deleted = 0 AND ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o LEFT JOIN shipping_records sr ON sr.order_id = o.id WHERE o.is_deleted = 0 AND ${where}`, params);
    await attachOvertime(rows);
    res.json({ list: rows, total: countRows[0].total, page: parseInt(page) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/shipping/create — create shipping record for own delivery (Unassigned → Pending)
router.post('/create', async (req, res) => {
  try {
    const { order_id, delivery_staff_id } = req.body;
    if (!order_id || !delivery_staff_id) return res.status(400).json({ message: 'Missing fields' });

    // Check if there's an existing unassigned record to reuse
    const [existing] = await pool.query(
      "SELECT id FROM shipping_records WHERE order_id = ? AND status = 'unassigned'",
      [order_id]
    );

    let staffName = '';
    const [ds] = await pool.query('SELECT name FROM delivery_staff WHERE id = ?', [delivery_staff_id]);
    if (ds.length > 0) staffName = ds[0].name;

    if (existing.length > 0) {
      // Reuse existing unassigned record
      await pool.query(
        "UPDATE shipping_records SET delivery_method='own', delivery_staff_id=?, delivery_staff_name=?, status='in_transit', status_since=NOW(), shipped_at=NOW(), updated_at=NOW() WHERE id=?",
        [delivery_staff_id, staffName, existing[0].id]
      );
      res.status(200).json({ code: 'reused', id: existing[0].id });
    } else {
      const code = genShippingCode();
      await pool.query(
        "INSERT INTO shipping_records (order_id, shipping_code, delivery_method, delivery_staff_id, delivery_staff_name, status, status_since, shipped_at) VALUES (?,?,?,?,?,?, NOW(), NOW())",
        [order_id, code, 'own', delivery_staff_id, staffName, 'in_transit']
      );
      res.status(201).json({ code });
    }
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/shipping/:id — edit tracking/staff
router.put('/:id', async (req, res) => {
  try {
    const { gig_tracking, delivery_staff_id, operator } = req.body;
    const [rows] = await pool.query('SELECT * FROM shipping_records WHERE id=?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    let detail = '';
    if (gig_tracking !== undefined) {
      await pool.query('UPDATE shipping_records SET gig_tracking=?, updated_by=? WHERE id=?', [gig_tracking, operator, rows[0].id]);
      detail = 'Tracking: ' + gig_tracking;
    }
    if (delivery_staff_id) {
      const [ds] = await pool.query('SELECT name FROM delivery_staff WHERE id=?', [delivery_staff_id]);
      const staffName = ds.length > 0 ? ds[0].name : '';
      await pool.query('UPDATE shipping_records SET delivery_staff_id=?, delivery_staff_name=?, updated_by=? WHERE id=?', [delivery_staff_id, staffName, operator, rows[0].id]);
      detail = 'Staff: ' + staffName;
    }
    await logAction(rows[0].id, 'modify', detail, operator);
    res.json({ message: 'Updated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/shipping/:id/action — update status
router.post('/:id/action', async (req, res) => {
  try {
    const { action, delivery_staff_id, operator } = req.body;
    const [rows] = await pool.query('SELECT * FROM shipping_records WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const rec = rows[0];

    // Ship (from unassigned or pending → pending + own delivery)
    if (action === 'confirm_ship') {
      if (!['pending'].includes(rec.status) && rec.delivery_method !== null) {
        // Allow ship only for unassigned (no sr record) or pending with no method set
      }
      let staffName = '';
      if (delivery_staff_id) {
        const [ds] = await pool.query('SELECT name FROM delivery_staff WHERE id=?', [delivery_staff_id]);
        if (ds.length > 0) staffName = ds[0].name;
      }
      await pool.query(
        "UPDATE shipping_records SET delivery_method='own', delivery_staff_id=?, delivery_staff_name=?, status='in_transit', status_since=NOW(), shipped_at=NOW(), updated_at=NOW(), updated_by=? WHERE id=?",
        [delivery_staff_id || null, staffName, operator || '', rec.id]
      );
      await logAction(rec.id, 'confirm_ship', 'Method: OWN ' + staffName, operator);
      notifyCustomer(pool, rec.id, 'in_transit');
      return res.json({ message: 'Shipped', status: 'in_transit' });
    }

    // Rollback → back to unassigned (clear shipping record)
    if (action === 'rollback') {
      const allowed = ['pending', 'in_transit'];
      if (!allowed.includes(rec.status)) return res.status(400).json({ message: `Cannot rollback from ${rec.status}` });
      if (rec.status === 'in_transit' && rec.delivery_method === 'speedaf') return res.status(400).json({ message: 'Speedaf in_transit orders cannot rollback' });
      // Cancel Speedaf waybill if applicable
      if (rec.delivery_method === 'speedaf' && rec.gig_tracking) {
        try {
          const speedaf = require('../services/speedaf');
          await speedaf.cancelOrder(rec.gig_tracking, 'Customer request');
        } catch (e) { /* log but proceed */ }
      }
      await pool.query(
        "UPDATE shipping_records SET delivery_method=NULL, gig_tracking='', delivery_staff_id=NULL, delivery_staff_name='', status='unassigned', status_since=NOW(), shipped_at=NULL, updated_at=NOW(), updated_by=? WHERE id=?",
        [operator || '', rec.id]
      );
      await logAction(rec.id, 'rollback', 'Rollback to unassigned', operator);
      return res.json({ message: 'Rollback', status: 'unassigned' });
    }

    // Deliver — only for own/gig deliveries in transit
    if (action === 'deliver') {
      if (rec.status !== 'in_transit') return res.status(400).json({ message: 'Deliver only from in_transit' });
      if (rec.delivery_method === 'speedaf') return res.status(400).json({ message: 'Speedaf orders auto-update via webhook' });
      await pool.query(
        "UPDATE shipping_records SET status='delivered', status_since=NOW(), updated_at=NOW(), updated_by=? WHERE id=?",
        [operator || '', rec.id]
      );
      await logAction(rec.id, 'deliver', '', operator);
      notifyCustomer(pool, rec.id, 'delivered');
      return res.json({ message: 'Delivered', status: 'delivered' });
    }

    // Void — admin only, own/gig delivery only
    if (action === 'void') {
      if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Only admin can void' });
      if (rec.delivery_method === 'speedaf') return res.status(400).json({ message: 'Void only for own/gig logistics' });
      const reason = req.body.reason || '';
      if (!reason.trim()) return res.status(400).json({ message: 'Reason is required to void an order' });
      await pool.query(
        "UPDATE shipping_records SET status='voided', status_since=NOW(), updated_at=NOW(), updated_by=? WHERE id=?",
        [operator || '', rec.id]
      );
      await logAction(rec.id, 'void', 'Reason: ' + reason, operator);
      return res.json({ message: 'Voided', status: 'voided' });
    }

    return res.status(400).json({ message: 'Unknown action' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/shipping/:id/logs
router.get('/:id/logs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM shipping_logs WHERE shipping_id=? ORDER BY created_at DESC', [req.params.id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/shipping/:id/tracking — OWN delivery tracking timeline
router.get('/:id/tracking', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM shipping_tracking_events WHERE shipping_id = ? ORDER BY event_time ASC',
      [req.params.id]
    );
    res.json({ events: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
