const express = require('express');
const pool = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// POST reorder - admin fixes all sort_orders
router.post('/reorder', adminOnly, async (req, res) => {
  try {
    const { order } = req.body;
    for (let i = 0; i < order.length; i++) {
      await pool.query('UPDATE products SET sort_order=? WHERE id=?', [i+1, order[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/', async (req, res) => {
  try {
    const { page = 1, page_size = 100 } = req.query;
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM products');
    const ps = Math.min(parseInt(page_size), 100);
    const offset = (parseInt(page) - 1) * ps;
    const [rows] = await pool.query('SELECT * FROM products ORDER BY sort_order, id LIMIT ? OFFSET ?', [ps, offset]);
    res.json({ list: rows, total: countRows[0].total, page: parseInt(page) });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const { code, name, price, sort_order, status } = req.body;
    if (!code || !name || price == null) return res.status(400).json({ message: 'All fields required' });
    const [dup] = await pool.query('SELECT id FROM products WHERE code=? OR name=?', [code, name]);
    if (dup.length > 0) return res.status(400).json({ message: 'Product code or name already exists' });
    const [r] = await pool.query('INSERT INTO products (code, name, price, sort_order, status) VALUES (?,?,?,?,?)',
      [code, name, price, sort_order || 0, status || 'active']);
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { code, name, price, sort_order, status } = req.body;
    if (!code || !name || price == null) return res.status(400).json({ message: 'All fields required' });
    const [dup] = await pool.query('SELECT id FROM products WHERE (code=? OR name=?) AND id!=?', [code, name, parseInt(req.params.id)]);
    if (dup.length > 0) return res.status(400).json({ message: 'Product code or name already exists' });
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
