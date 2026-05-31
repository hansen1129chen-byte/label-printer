/**
 * GIGL API routes — shipment listing, tracking, matching
 */
const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/gigl/shipments
 * List all GIGL shipments with optional filters.
 */
router.get('/shipments', async (req, res) => {
  try {
    const { status, search, date_from, date_to, page = 1, page_size = 20 } = req.query;
    let where = '1=1';
    const params = [];

    if (date_from) { where += ' AND gs.date_created >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND gs.date_created <= ?'; params.push(date_to + ' 23:59:59'); }

    if (status === 'delivered') { where += ' AND gs.is_delivered = 1'; }
    else if (status === 'transit') { where += ' AND gs.is_delivered = 0 AND gs.is_cancelled = 0 AND NOT EXISTS (SELECT 1 FROM gigl_tracking_events te WHERE te.waybill = gs.waybill AND te.status_code = \'DFA\')'; }
    else if (status === 'cancelled') { where += ' AND gs.is_cancelled = 1'; }
    else if (status === 'failed') { where += ' AND gs.is_delivered = 0 AND gs.is_cancelled = 0 AND EXISTS (SELECT 1 FROM gigl_tracking_events te WHERE te.waybill = gs.waybill AND te.status_code = \'DFA\')'; }
    else if (status === 'unmatched') { where += ' AND gs.matched_shipping_id IS NULL'; }

    if (search) {
      where += ' AND (gs.waybill LIKE ? OR gs.receiver_name LIKE ? OR gs.receiver_phone LIKE ?)';
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM gigl_shipments gs WHERE ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT gs.id, gs.waybill, gs.receiver_name, gs.receiver_phone,
              gs.grand_total, gs.payment_status, gs.current_scan_status,
              gs.is_delivered, gs.is_cancelled, gs.date_created, gs.date_modified,
              gs.shipment_source, gs.gigl_shipment_id, gs.is_express_dropoff,
              gs.is_from_mobile, gs.is_international, gs.delivery_option_id,
              gs.destination, gs.sender_phone, gs.matched_shipping_id,
              gs.last_synced_at,
              sr.shipping_code, o.order_no, o.customer_name AS local_customer,
              CASE WHEN gs.is_cancelled = 1 THEN 0
                   WHEN gs.is_delivered = 1 THEN 0
                   WHEN EXISTS (SELECT 1 FROM gigl_tracking_events te WHERE te.waybill = gs.waybill AND te.status_code = 'DFA') THEN 1
                   ELSE 0 END AS is_failed
       FROM gigl_shipments gs
       LEFT JOIN shipping_records sr ON gs.matched_shipping_id = sr.id
       LEFT JOIN orders o ON sr.order_id = o.id
       WHERE ${where}
       ORDER BY gs.date_created DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)]
    );

    res.json({ list: rows, total: countRows[0].total, page: parseInt(page) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

/**
 * GET /api/gigl/shipments/:waybill/tracking
 * Get full tracking timeline for a waybill.
 */
router.get('/shipments/:waybill/tracking', async (req, res) => {
  try {
    const [shipment] = await pool.query(
      'SELECT * FROM gigl_shipments WHERE waybill = ?', [req.params.waybill]
    );
    if (shipment.length === 0) return res.status(404).json({ message: 'Not found' });

    const [events] = await pool.query(
      'SELECT * FROM gigl_tracking_events WHERE waybill = ? ORDER BY event_time ASC',
      [req.params.waybill]
    );

    res.json({ shipment: shipment[0], events });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

/**
 * GET /api/gigl/match-suggestions?shipping_id=X
 * Get suggested GIGL waybills for a local shipping record.
 * Uses same scoring: name + phone + amount + date.
 */
router.get('/match-suggestions', async (req, res) => {
  try {
    const { shipping_id } = req.query;
    if (!shipping_id) return res.status(400).json({ message: 'shipping_id required' });

    // Get the local order info
    const [srRows] = await pool.query(
      `SELECT sr.*, o.customer_name, o.customer_phone, o.total_amount, o.created_at AS order_created_at
       FROM shipping_records sr
       JOIN orders o ON sr.order_id = o.id
       WHERE sr.id = ?`, [shipping_id]
    );
    if (srRows.length === 0) return res.status(404).json({ message: 'Shipping record not found' });
    const local = srRows[0];

    // Get unmatched GIGL shipments (or already matched to this shipping record)
    const [giglRows] = await pool.query(
      `SELECT * FROM gigl_shipments WHERE is_cancelled = 0 AND (matched_shipping_id IS NULL OR matched_shipping_id = ?) ORDER BY date_created DESC`,
      [shipping_id]
    );

    // Step 1: Hard filter — name AND phone must match
    const localPhone = (local.customer_phone || '').replace(/\D/g, '').slice(-4);
    const localName = (local.customer_name || '').toLowerCase().replace(/\s+/g, ' ').trim();

    const matched = giglRows.filter(gs => {
      const giglName = (gs.receiver_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const giglPhone = (gs.receiver_phone || '').replace(/\D/g, '').slice(-4);
      if (!giglName || !giglPhone || !localName || !localPhone) return false;

      // Name must match
      const nameOk = giglName === localName
        || giglName.includes(localName) || localName.includes(giglName)
        || giglName.split(' ')[0] === localName.split(' ')[0];
      if (!nameOk) return false;

      // Phone last 4 must match
      if (giglPhone !== localPhone) return false;

      return true;
    });

    // Step 2: Score candidates (date + amount as tiebreakers)
    const candidates = matched.map(gs => {
      let score = 0;
      const giglName = (gs.receiver_name || '').toLowerCase().replace(/\s+/g, ' ').trim();

      // Name quality bonus
      if (giglName === localName) score += 10;
      else if (giglName.includes(localName) || localName.includes(giglName)) score += 7;
      else score += 5; // first-name match

      // Phone match (already verified)
      score += 10;

      // Date proximity
      if (gs.date_created && local.order_created_at) {
        const diffDays = Math.abs((new Date(gs.date_created) - new Date(local.order_created_at)) / 86400000);
        if (diffDays <= 1) score += 8;
        else if (diffDays <= 2) score += 5;
        else if (diffDays <= 3) score += 3;
        else if (diffDays <= 7) score += 1;
      }

      // Amount proximity
      const giglAmt = Number(gs.grand_total || 0);
      const localAmt = Number(local.total_amount || 0);
      if (giglAmt > 0 && localAmt > 0) {
        const ratio = Math.max(giglAmt, localAmt) / Math.min(giglAmt, localAmt);
        if (ratio <= 1.1) score += 5;
        else if (ratio <= 1.3) score += 3;
        else if (ratio <= 1.5) score += 1;
      }

      return { ...gs, score };
    });

    // Sort by score desc
    candidates.sort((a, b) => b.score - a.score);
    const suggestions = candidates.slice(0, 10);

    res.json({ shipping_id, customer_name: local.customer_name, suggestions });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

/**
 * POST /api/gigl/shipments/:waybill/match
 * Manually match a GIGL waybill to a local shipping record.
 */
router.post('/shipments/:waybill/match', async (req, res) => {
  try {
    const { shipping_id } = req.body;
    if (!shipping_id) return res.status(400).json({ message: 'shipping_id required' });

    const [srRows] = await pool.query('SELECT * FROM shipping_records WHERE id = ?', [shipping_id]);
    if (srRows.length === 0) return res.status(404).json({ message: 'Shipping record not found' });

    const sr = srRows[0];
    const waybill = req.params.waybill;

    // Update shipping record
    await pool.query(
      `UPDATE shipping_records SET gig_tracking = ?, updated_by = 'GIGL', updated_at = NOW() WHERE id = ?`,
      [waybill, shipping_id]
    );

    // Update gigl_shipments
    await pool.query(
      `UPDATE gigl_shipments SET matched_shipping_id = ?, last_synced_at = NOW() WHERE waybill = ?`,
      [shipping_id, waybill]
    );

    // Log
    await pool.query(
      `INSERT INTO shipping_logs (shipping_id, action, detail, operator) VALUES (?, 'modify', ?, 'GIGL')`,
      [shipping_id, `Manual GIGL match: ${waybill}`]
    );

    res.json({ message: 'Matched', waybill, shipping_id });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
