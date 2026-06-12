const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// GET /api/customers — aggregated customer list
router.get('/', async (req, res) => {
  try {
    const { name, phone, streamer_name, page = 1, page_size = 20, sort_by, sort_dir } = req.query;
    let where = 'WHERE o.is_deleted = 0';
    const params = [];
    if (name) { where += ' AND o.customer_name LIKE ?'; params.push('%' + name + '%'); }
    if (phone) { where += ' AND o.customer_phone LIKE ?'; params.push('%' + phone + '%'); }
    if (streamer_name) { where += ' AND o.streamer_name LIKE ?'; params.push('%' + streamer_name + '%'); }

    const allowedSort = { first_order_date: 'first_order_date', order_count: 'order_count', total_spent: 'total_spent' };
    const sortCol = allowedSort[sort_by] || 'first_order_date';
    const sortDir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT o.customer_phone) AS total FROM orders o ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT o.customer_name, o.customer_phone,
        (SELECT o2.streamer_name FROM orders o2 WHERE o2.customer_phone = o.customer_phone AND o2.is_deleted = 0 ORDER BY o2.created_at DESC LIMIT 1) AS streamer_name,
        MIN(COALESCE(o.order_time, o.created_at)) AS first_order_date,
        COUNT(*) AS order_count,
        SUM(o.total_amount) AS total_spent
       FROM orders o ${where}
       GROUP BY o.customer_phone
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)]
    );
    res.json({ list: rows, total: countRows[0].total, page: parseInt(page) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/customers/:phone — customer detail + purchase history
router.get('/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const [orders] = await pool.query(
      `SELECT o.id, o.order_no, o.customer_name, o.customer_phone, o.streamer_name,
        o.total_amount, o.payment_status_name,
        DATE_FORMAT(o.order_time, '%Y-%m-%d') AS order_time,
        o.created_at, sr.status AS shipping_status
       FROM orders o
       LEFT JOIN shipping_records sr ON sr.order_id = o.id
       WHERE o.customer_phone = ? AND o.is_deleted = 0
       ORDER BY o.created_at DESC`,
      [phone]
    );
    // Streamer change history: detect when streamer_name differs between consecutive orders
    const changes = [];
    for (let i = 0; i < orders.length - 1; i++) {
      if (orders[i].streamer_name !== orders[i + 1].streamer_name) {
        changes.push({
          from: orders[i + 1].streamer_name,
          to: orders[i].streamer_name,
          changed_at: orders[i].created_at,
          order_no: orders[i].order_no
        });
      }
    }
    res.json({ orders, streamer_changes: changes });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
