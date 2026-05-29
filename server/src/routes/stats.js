const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// GET /api/stats/sales?date_from=&date_to=
router.get('/sales', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let where = '1=1';
    const params = [];
    if (date_from) { where += ' AND o.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND o.created_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [summary] = await pool.query(
      `SELECT COUNT(*) AS total_orders, SUM(o.total_amount) AS total_sales, SUM(o.actual_amount) AS total_actual
       FROM orders o WHERE ${where}`, params
    );
    res.json(summary[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/stats/commission?date_from=&date_to=
router.get('/commission', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let where = '1=1';
    const params = [];
    if (date_from) { where += ' AND o.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND o.created_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.commission_rate,
        COUNT(o.id) AS order_count,
        COALESCE(SUM(o.total_amount), 0) AS total_sales,
        COALESCE(SUM(o.total_amount) * s.commission_rate / 100, 0) AS commission
       FROM streamers s
       LEFT JOIN orders o ON o.streamer_id = s.id AND ${where}
       GROUP BY s.id ORDER BY total_sales DESC`, params
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/stats/products?date_from=&date_to=
router.get('/products', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let where = '1=1';
    const params = [];
    if (date_from) { where += ' AND o.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND o.created_at <= ?'; params.push(date_to + ' 23:59:59'); }

    const [rows] = await pool.query(
      `SELECT oi.product_name, oi.product_code,
        COUNT(oi.id) AS order_count,
        COALESCE(SUM(oi.quantity), 0) AS total_qty,
        COALESCE(SUM(oi.subtotal), 0) AS total_sales
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${where} GROUP BY oi.product_code, oi.product_name ORDER BY total_sales DESC`, params
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
