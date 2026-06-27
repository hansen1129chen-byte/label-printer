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
const { router: speedafRoutes, webhookRouter: speedafWebhook } = require('./routes/speedaf');
const whatsappFlowRoutes = require('./routes/whatsapp-flow');
const parseWhatsappRoutes = require('./routes/parse-whatsapp');
const customerRoutes = require('./routes/customers');

const app = express();
app.use(cors());
app.use(express.json());

// Speedaf webhook (plain JSON push from Speedaf, no auth)
app.use('/api/speedaf', speedafWebhook);

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/whatsapp-flow', (req, res, next) => {
  res.type('json');
  next();
}, express.static(path.join(__dirname, '..', 'public', 'whatsapp-flow')));
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/config', configRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/speedaf', speedafRoutes);
app.use('/api/whatsapp-flow', whatsappFlowRoutes);
app.use('/api/parse-whatsapp', parseWhatsappRoutes);
app.use('/api/customers', customerRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Public tracking — no login required (WhatsApp Flow)
app.get('/api/public/track', async (req, res) => {
  try {
    const pool = require('./config/db');
    const { phone, tracking_no } = req.query;
    if (!tracking_no || !phone) return res.status(400).json({ message: 'Enter phone and order/tracking number' });
    // Normalize Nigerian phone: handle both 0xxx and 234xxx formats
    let phoneDigits = phone.trim().replace(/\D/g, '');
    if (phoneDigits.startsWith('234') && phoneDigits.length >= 10) phoneDigits = phoneDigits.slice(3);
    if (phoneDigits.startsWith('0')) phoneDigits = phoneDigits.slice(1);
    const phoneLast4 = phoneDigits.slice(-4);
    if (phoneLast4.length < 4) return res.status(400).json({ message: 'Please check your phone number' });

    const tn = tracking_no.trim();
    let where = "(o.order_no LIKE ? OR sr.gig_tracking = ?) AND (RIGHT(REPLACE(o.customer_phone, '+', ''), 4) = ? OR RIGHT(REPLACE(COALESCE(o.customer_phone2,''), '+', ''), 4) = ?)";
    const params = ['%' + tn + '%', tn, phoneLast4, phoneLast4];

    const [rows] = await pool.query(
      `SELECT o.order_no, o.customer_name,
        CONCAT(REPEAT('*', GREATEST(0, CHAR_LENGTH(o.customer_phone)-4)), RIGHT(o.customer_phone,4)) AS masked_phone,
        o.total_amount, o.actual_amount,
        sr.status AS shipping_status, sr.delivery_method,
        sr.gig_tracking, sr.delivery_staff_name
       FROM orders o
       LEFT JOIN shipping_records sr ON sr.order_id = o.id
       WHERE o.is_deleted = 0 AND ${where} ORDER BY o.created_at DESC LIMIT 10`, params
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
      } else if (row.delivery_method === 'speedaf' && row.gig_tracking) {
        const [evtRows] = await pool.query(
          'SELECT event_time, location, status_code, status_description FROM speedaf_tracking_events WHERE waybill = ? ORDER BY event_time ASC',
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
