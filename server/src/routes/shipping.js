const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

function genShippingCode() {
  return 'SHP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// Log an action
async function logAction(shippingId, action, detail, operator) {
  await pool.query('INSERT INTO shipping_logs (shipping_id, action, detail, operator) VALUES (?,?,?,?)',
    [shippingId, action, detail, operator || '']);
}

// GET /api/shipping
router.get('/', async (req, res) => {
  try {
    const { status, date_from, date_to, order_no, customer, page = 1, page_size = 20 } = req.query;
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND sr.status = ?'; params.push(status); }
    if (order_no) { where += ' AND o.order_no LIKE ?'; params.push('%'+order_no+'%'); }
    if (customer) { where += ' AND (o.customer_name LIKE ? OR o.customer_phone LIKE ?)'; params.push('%'+customer+'%', '%'+customer+'%'); }
    if (date_from) { where += ' AND sr.initiated_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND sr.initiated_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [rows] = await pool.query(
      `SELECT sr.*, o.order_no, o.created_at AS order_created_at,
        o.customer_name, o.customer_phone, o.customer_address, o.total_amount,
        ds.name AS delivery_staff_name, o.streamer_id
       FROM shipping_records sr
       JOIN orders o ON sr.order_id = o.id
       LEFT JOIN delivery_staff ds ON sr.delivery_staff_id = ds.id
       WHERE ${where} ORDER BY sr.initiated_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM shipping_records sr JOIN orders o ON sr.order_id = o.id WHERE ${where}`, params);
    res.json({ list: rows, total: countRows[0].total, page: parseInt(page) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/shipping — create shipping record
router.post('/', async (req, res) => {
  try {
    const { order_id, delivery_method, gig_tracking, delivery_staff_id } = req.body;
    if (!order_id || !delivery_method) return res.status(400).json({ message: 'Missing fields' });
    const [existing] = await pool.query('SELECT id FROM shipping_records WHERE order_id = ? AND status != ?', [order_id, 'returned']);
    if (existing.length > 0) return res.status(400).json({ message: 'Already has active shipping' });
    const code = genShippingCode();
    let staffName = '';
    if (delivery_method === 'own' && delivery_staff_id) {
      const [ds] = await pool.query('SELECT name FROM delivery_staff WHERE id = ?', [delivery_staff_id]);
      if (ds.length > 0) staffName = ds[0].name;
    }
    await pool.query(
      'INSERT INTO shipping_records (order_id, shipping_code, delivery_method, gig_tracking, delivery_staff_id, delivery_staff_name) VALUES (?,?,?,?,?,?)',
      [order_id, code, delivery_method, gig_tracking || '', delivery_method === 'own' ? delivery_staff_id : null, staffName]
    );
    res.status(201).json({ code });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/shipping/:id — edit tracking/staff
router.put('/:id', async (req, res) => {
  try {
    const { gig_tracking, delivery_staff_id, operator } = req.body;
    const [rows] = await pool.query('SELECT * FROM shipping_records WHERE id=?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    let staffName = rows[0].delivery_staff_name || '';
    let detail = '';
    if (gig_tracking !== undefined) {
      await pool.query('UPDATE shipping_records SET gig_tracking=?, updated_by=? WHERE id=?', [gig_tracking, operator, rows[0].id]);
      detail = 'Tracking: ' + gig_tracking;
    }
    if (delivery_staff_id) {
      const [ds] = await pool.query('SELECT name FROM delivery_staff WHERE id=?', [delivery_staff_id]);
      if (ds.length > 0) staffName = ds[0].name;
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
    const { action, delivery_method, gig_tracking, delivery_staff_id, operator } = req.body;
    const [rows] = await pool.query('SELECT * FROM shipping_records WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const rec = rows[0];

    const validActions = {
      pending: ['confirm_ship'],
      in_transit: ['deliver', 'return', 'reassign'],
      delivered: ['return'],
    };
    if (!validActions[rec.status] || !validActions[rec.status].includes(action)) {
      return res.status(400).json({ message: `Cannot ${action} in ${rec.status} status` });
    }

    let newStatus, setExtra = '';
    if (action === 'confirm_ship') {
      newStatus = 'in_transit'; setExtra = ', shipped_at = NOW()';
      if (delivery_method) {
        let dsName = '';
        if (delivery_method === 'own' && delivery_staff_id) {
          const [ds] = await pool.query('SELECT name FROM delivery_staff WHERE id=?', [delivery_staff_id]);
          if (ds.length > 0) dsName = ds[0].name;
        }
        await pool.query('UPDATE shipping_records SET delivery_method=?, gig_tracking=?, delivery_staff_id=?, delivery_staff_name=? WHERE id=?',
          [delivery_method, gig_tracking || '', delivery_method==='own' ? delivery_staff_id : null, dsName, rec.id]);
      }
    }
    else if (action === 'deliver') newStatus = 'delivered';
    else if (action === 'return') { newStatus = 'returned'; setExtra = ', returned_at = NOW()'; }
    else if (action === 'reassign') { newStatus = 'pending'; }

    await pool.query(`UPDATE shipping_records SET status = ?, updated_at = NOW(), updated_by = ? ${setExtra} WHERE id = ?`, [newStatus, operator || '', rec.id]);

    // Log
    const detail = (action === 'confirm_ship' && delivery_method) ? 'Method: ' + delivery_method.toUpperCase() : '';
    await logAction(rec.id, action, detail, operator);

    res.json({ message: 'Status updated', status: newStatus });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/shipping/:id/logs
router.get('/:id/logs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM shipping_logs WHERE shipping_id=? ORDER BY created_at DESC', [req.params.id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
