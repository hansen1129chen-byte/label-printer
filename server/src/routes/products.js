const express = require('express');
const pool = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products ORDER BY sort_order, id');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const { code, name, price, sort_order, status } = req.body;
    if (!code || !name || price == null) return res.status(400).json({ message: 'Missing fields' });
    const [r] = await pool.query('INSERT INTO products (code, name, price, sort_order, status) VALUES (?,?,?,?,?)',
      [code, name, price, sort_order || 0, status || 'active']);
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { code, name, price, sort_order, status } = req.body;
    await pool.query('UPDATE products SET code=?, name=?, price=?, sort_order=?, status=? WHERE id=?',
      [code, name, price, sort_order, status, req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE order_items SET product_id=NULL WHERE product_id=?', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
