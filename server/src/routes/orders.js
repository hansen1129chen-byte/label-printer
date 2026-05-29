const express = require('express');
const pool = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

function genOrderNo(date) {
  const d = date || new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `PF${m}${day}`;
}

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { date_from, date_to, streamer_id, payment_status_id, status, page = 1, page_size = 20 } = req.query;
    let where = '1=1';
    const params = [];
    if (date_from) { where += ' AND o.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND o.created_at <= ?'; params.push(date_to + ' 23:59:59'); }
    if (streamer_id) { where += ' AND o.streamer_id = ?'; params.push(streamer_id); }
    if (payment_status_id) { where += ' AND o.payment_status_id = ?'; params.push(payment_status_id); }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM orders o WHERE ${where}`, params);
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT o.*, s.name AS streamer_name, ps.name AS payment_status_name
       FROM orders o
       LEFT JOIN streamers s ON o.streamer_id = s.id
       LEFT JOIN payment_statuses ps ON o.payment_status_id = ps.id
       WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)]
    );
    res.json({ list: rows, total, page: parseInt(page) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, s.name AS streamer_name, ps.name AS payment_status_name
       FROM orders o LEFT JOIN streamers s ON o.streamer_id = s.id
       LEFT JOIN payment_statuses ps ON o.payment_status_id = ps.id WHERE o.id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [rows[0].id]);
    rows[0].items = items;
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/orders
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { customer_name, customer_gender, customer_phone, customer_address, streamer_id, payment_status_id, actual_amount, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Select at least one product' });

    // Generate order number
    const prefix = genOrderNo();
    const [lastRows] = await conn.query("SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1", [prefix + '%']);
    let seq = 1;
    if (lastRows.length > 0) {
      const lastSeq = parseInt(lastRows[0].order_no.slice(-3));
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const orderNo = prefix + String(seq).padStart(3, '0');

    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const [prodRows] = await conn.query('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (prodRows.length === 0) { conn.release(); return res.status(400).json({ message: `Product not found` }); }
      const p = prodRows[0];
      const qty = parseInt(item.quantity) || 1;
      const subtotal = parseFloat(p.price) * qty;
      totalAmount += subtotal;
      orderItems.push({ product_id: p.id, product_code: p.code, product_name: p.name, unit_price: p.price, quantity: qty, subtotal });
    }

    const actual = actual_amount != null ? Math.min(parseFloat(actual_amount), totalAmount) : totalAmount;

    const [orderResult] = await conn.query(
      'INSERT INTO orders (order_no, customer_name, customer_gender, customer_phone, customer_address, streamer_id, payment_status_id, total_amount, actual_amount) VALUES (?,?,?,?,?,?,?,?,?)',
      [orderNo, customer_name || '', customer_gender || '', customer_phone || '', customer_address || '', streamer_id || null, payment_status_id || null, totalAmount, actual]
    );

    for (const oi of orderItems) {
      await conn.query('INSERT INTO order_items (order_id, product_id, product_code, product_name, unit_price, quantity, subtotal) VALUES (?,?,?,?,?,?,?)',
        [orderResult.insertId, oi.product_id, oi.product_code, oi.product_name, oi.unit_price, oi.quantity, oi.subtotal]);
    }

    conn.release();
    res.status(201).json({ id: orderResult.insertId, order_no: orderNo, total_amount: totalAmount });
  } catch (err) { conn.release(); console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/orders/:id
router.put('/:id', async (req, res) => {
  try {
    const { customer_name, customer_gender, customer_phone, customer_address, streamer_id, payment_status_id, actual_amount } = req.body;
    const [orderRows] = await pool.query('SELECT total_amount FROM orders WHERE id = ?', [req.params.id]);
    if (orderRows.length === 0) return res.status(404).json({ message: 'Not found' });
    const actual = actual_amount != null ? Math.min(parseFloat(actual_amount), orderRows[0].total_amount) : undefined;

    await pool.query(
      'UPDATE orders SET customer_name=?, customer_gender=?, customer_phone=?, customer_address=?, streamer_id=?, payment_status_id=?, actual_amount=? WHERE id=?',
      [customer_name, customer_gender, customer_phone, customer_address, streamer_id, payment_status_id, actual != null ? actual : orderRows[0].total_amount, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/orders/:id - admin only
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM shipping_records WHERE order_id = ?', [req.params.id]);
    await pool.query('DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
    await pool.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
