const express = require('express');
const pool = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

const tables = {
  streamers: { table: 'streamers', cols: ['name', 'commission_rate'], adminOnly: true },
  payment_statuses: { table: 'payment_statuses', cols: ['name', 'color'], adminOnly: true },
  delivery_staff: { table: 'delivery_staff', cols: ['name'], adminOnly: true },
};

Object.entries(tables).forEach(([key, cfg]) => {
  // GET - all logged-in users can read
  router.get(`/${key}`, async (req, res) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${cfg.table} ORDER BY id`);
      res.json(rows);
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
  });

  // POST - admin only
  router.post(`/${key}`, cfg.adminOnly ? adminOnly : (r, r2, n) => n(), async (req, res) => {
    try {
      const vals = cfg.cols.map(c => req.body[c]);
      if (vals.some(v => v === undefined)) return res.status(400).json({ message: 'Missing fields' });
      const placeholders = cfg.cols.map(() => '?').join(',');
      const [r] = await pool.query(`INSERT INTO ${cfg.table} (${cfg.cols.join(',')}) VALUES (${placeholders})`, vals);
      res.status(201).json({ id: r.insertId });
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
  });

  // PUT - admin only
  router.put(`/${key}/:id`, cfg.adminOnly ? adminOnly : (r, r2, n) => n(), async (req, res) => {
    try {
      const sets = cfg.cols.map(c => `${c}=?`).join(',');
      const vals = cfg.cols.map(c => req.body[c]);
      vals.push(req.params.id);
      await pool.query(`UPDATE ${cfg.table} SET ${sets} WHERE id=?`, vals);
      res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
  });

  // DELETE - admin only
  router.delete(`/${key}/:id`, cfg.adminOnly ? adminOnly : (r, r2, n) => n(), async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${cfg.table} WHERE id=?`, [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
  });
});

// Alert config — key-value settings for shipping time warnings
router.get('/alert', adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT config_key, config_value FROM alert_config ORDER BY id');
    const cfg = {};
    rows.forEach(r => { cfg[r.config_key] = r.config_value; });
    res.json(cfg);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/alert', adminOnly, async (req, res) => {
  try {
    const { pending_alert_hours, in_transit_alert_hours } = req.body;
    if (pending_alert_hours !== undefined) {
      await pool.query('INSERT INTO alert_config (config_key, config_value) VALUES (?,?) ON DUPLICATE KEY UPDATE config_value=?', ['pending_alert_hours', String(pending_alert_hours), String(pending_alert_hours)]);
    }
    if (in_transit_alert_hours !== undefined) {
      await pool.query('INSERT INTO alert_config (config_key, config_value) VALUES (?,?) ON DUPLICATE KEY UPDATE config_value=?', ['in_transit_alert_hours', String(in_transit_alert_hours), String(in_transit_alert_hours)]);
    }
    res.json({ message: 'Saved' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
