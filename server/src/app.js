const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const configRoutes = require('./routes/config');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const shippingRoutes = require('./routes/shipping');
const statsRoutes = require('./routes/stats');
const giglRoutes = require('./routes/gigl');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/config', configRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/gigl', giglRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Public tracking — no login required (WhatsApp Flow)
app.get('/api/public/track', async (req, res) => {
  try {
    const pool = require('./config/db');
    const { q } = req.query;
    if (!q || q.trim().length < 3) return res.status(400).json({ message: 'Enter at least 3 characters' });

    const keyword = q.trim();
    const phoneDigits = keyword.replace(/\D/g, '').slice(-4);
    let where, params;
    if (/^PF\d+/i.test(keyword)) {
      where = 'o.order_no LIKE ?'; params = ['%' + keyword + '%'];
    } else {
      where = "RIGHT(REPLACE(o.customer_phone, '+', ''), 4) = ?";
      params = [phoneDigits];
    }

    const [rows] = await pool.query(
      `SELECT o.order_no, o.customer_name,
        CONCAT(REPEAT('*', GREATEST(0, CHAR_LENGTH(o.customer_phone)-4)), RIGHT(o.customer_phone,4)) AS masked_phone,
        o.total_amount, o.actual_amount,
        sr.status AS shipping_status, sr.delivery_method,
        sr.gig_tracking, sr.delivery_staff_name,
        COALESCE(gs.is_delivered,0) AS gigl_delivered,
        COALESCE(gs.is_cancelled,0) AS gigl_cancelled,
        COALESCE(gs.current_scan_status,'') AS current_scan_status,
        COALESCE(gs.destination,'') AS destination
       FROM orders o
       LEFT JOIN shipping_records sr ON sr.order_id = o.id
       LEFT JOIN gigl_shipments gs ON sr.gig_tracking = gs.waybill
       WHERE ${where} ORDER BY o.created_at DESC LIMIT 10`, params
    );

    const results = [];
    for (const row of rows) {
      let events = [];
      if (row.delivery_method === 'gig' && row.gig_tracking) {
        const [evtRows] = await pool.query(
          'SELECT event_time, location, status_code, status_description FROM gigl_tracking_events WHERE waybill = ? ORDER BY event_time ASC',
          [row.gig_tracking]
        );
        events = evtRows;
      }
      results.push({ ...row, events });
    }
    res.json({ results, total: results.length });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Serve frontend (built dist)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
// SPA fallback (Express 5 safe — avoid regex route)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

module.exports = app;
