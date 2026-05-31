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

// Serve frontend (built dist)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
// SPA fallback — non-API routes serve index.html
app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

module.exports = app;
