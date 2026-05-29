const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

function genShippingCode() {
  return 'SHP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// GET /api/shipping — list by status
router.get('/', async (req, res) => {
  try {
    const { status, date_from, date_to, page = 1, page_size = 20 } = req.query;
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND sr.status = ?'; params.push(status); }
    if (date_from) { where += ' AND sr.initiated_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND sr.initiated_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [rows] = await pool.query(
      `SELECT sr.*, o.order_no, o.customer_name, o.customer_phone, o.customer_address, o.total_amount,
        ds.name AS delivery_staff_name, o.streamer_id
       FROM shipping_records sr
       JOIN orders o ON sr.order_id = o.id
       LEFT JOIN delivery_staff ds ON sr.delivery_staff_id = ds.id
       WHERE ${where} ORDER BY sr.initiated_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM shipping_records sr WHERE ${where}`, params);
    res.json({ list: rows, total: countRows[0].total, page: parseInt(page) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/shipping — create shipping record (move from unpaid → pending)
router.post('/', async (req, res) => {
  try {
    const { order_id, delivery_method, gig_tracking, delivery_staff_id } = req.body;
    if (!order_id || !delivery_method) return res.status(400).json({ message: 'Missing fields' });

    // Check existing
    const [existing] = await pool.query('SELECT id FROM shipping_records WHERE order_id = ? AND status != ?', [order_id, 'returned']);
    if (existing.length > 0) return res.status(400).json({ message: 'Already has active shipping' });

    const code = genShippingCode();
    await pool.query(
      'INSERT INTO shipping_records (order_id, shipping_code, delivery_method, gig_tracking, delivery_staff_id) VALUES (?,?,?,?,?)',
      [order_id, code, delivery_method, gig_tracking || '', delivery_method === 'own' ? delivery_staff_id : null]
    );
    res.status(201).json({ code });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/shipping/:id/action — update status
router.post('/:id/action', async (req, res) => {
  try {
    const { action, delivery_method, gig_tracking, delivery_staff_id } = req.body;
    const [rows] = await pool.query('SELECT * FROM shipping_records WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });

    const rec = rows[0];
    const validActions = {
      pending: ['confirm_ship'],
      in_transit: ['deliver', 'return', 'reassign'],
    };

    if (!validActions[rec.status] || !validActions[rec.status].includes(action)) {
      return res.status(400).json({ message: `Cannot ${action} in ${rec.status} status` });
    }

    let newStatus;
    if (action === 'confirm_ship') newStatus = 'in_transit';
    else if (action === 'deliver') newStatus = 'delivered';
    else if (action === 'return') newStatus = 'returned';
    else if (action === 'reassign') {
      newStatus = 'pending';
      if (delivery_method) {
        await pool.query('UPDATE shipping_records SET delivery_method=?, gig_tracking=?, delivery_staff_id=? WHERE id=?',
          [delivery_method, gig_tracking || '', delivery_method === 'own' ? delivery_staff_id : null, rec.id]);
      }
    }

    await pool.query('UPDATE shipping_records SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, rec.id]);
    res.json({ message: 'Status updated', status: newStatus });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
