const express = require('express');
const pool = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

function genOrderNo(date) {
  const d = date || new Date();
  return `PF${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { date_from, date_to, streamer_id, payment_status_id, product_names, page = 1, page_size = 20 } = req.query;
    let where = '1=1';
    const params = [];
    if (date_from) { where += ' AND o.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND o.created_at <= ?'; params.push(date_to + ' 23:59:59'); }
    if (streamer_id) { where += ' AND o.streamer_id = ?'; params.push(streamer_id); }
    if (payment_status_id) { where += ' AND o.payment_status_id = ?'; params.push(payment_status_id); }
    if (product_names) {
      const names = product_names.split(',').filter(Boolean);
      if (names.length > 0) {
        where += ' AND ' + names.map(() => 'o.id IN (SELECT oi.order_id FROM order_items oi WHERE oi.product_name LIKE ?)').join(' AND ');
        names.forEach(n => params.push('%' + n.trim() + '%'));
      }
    }
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM orders o WHERE ${where}`, params);
    const [rows] = await pool.query(
      `SELECT o.*, sr.status AS shipping_status, sr.shipping_code,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS product_count
       FROM orders o LEFT JOIN shipping_records sr ON sr.order_id = o.id
       WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size), (parseInt(page)-1)*parseInt(page_size)]
    );
    res.json({ list: rows, total: countRows[0].total, page: parseInt(page) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/orders/pdf?ids=1,2,3 - PDF labels (must be before /:id and /export)
router.get('/pdf', async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ message: 'Select orders' });
    const idList = ids.split(',').filter(Boolean);

    // Fetch orders with items
    const placeholders = idList.map(() => '?').join(',');
    const [orders] = await pool.query(
      `SELECT * FROM orders WHERE id IN (${placeholders}) ORDER BY id`, idList
    );
    const [allItems] = await pool.query(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id, id`, idList
    );

    // Group items by order
    const itemsByOrder = {};
    allItems.forEach(item => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    });

    const W = 142, H = 227;
    const M = 8;
    const doc = new PDFDocument({ size: [W, H], margin: M, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=labels.pdf');
    doc.pipe(res);

    const logoPath = require('path').join(__dirname, '..', '..', 'logo.png');

    orders.forEach((order, oi) => {
      if (oi > 0) doc.addPage();
      const items = itemsByOrder[order.id] || [];

      // Logo (header image)
      try { doc.image(logoPath, (W - 60) / 2, M, { width: 60 }); } catch (e) { /* fallback to text */ }
      let y = M + 22;

      // Tagline
      doc.font('Courier').fontSize(5).fillColor('#333');
      doc.text('Your scent   One tap away', M, y, { align: 'center', width: W - M * 2 });
      y += 10;

      // Invoice no + customer
      doc.font('Courier').fontSize(6).fillColor('#111');
      doc.text('INVOICE No.  ' + order.order_no, M, y);
      y += 10;
      doc.fontSize(5.5).fillColor('#555');
      doc.text(order.customer_name, M, y);
      doc.text(order.customer_phone, { align: 'right' });
      y += 8;
      doc.fontSize(5).text(order.customer_address || '', { width: W - M * 2 });

      // Table
      y = doc.y + 8;
      doc.moveTo(M, y).lineTo(W - M, y).stroke('#111');
      y += 4;

      // Table header
      const cols = [M, M + 50, M + 72, M + 88];
      doc.font('Courier-Bold').fontSize(5.5).fillColor('#111');
      doc.text('Item', cols[0], y);
      doc.text('Price', cols[1], y);
      doc.text('QTY', cols[2], y);
      doc.text('Amount', cols[3], y, { width: W - cols[3] - M, align: 'right' });
      y += 9;
      doc.moveTo(M, y).lineTo(W - M, y).stroke('#111');
      y += 4;

      // Items
      doc.font('Courier').fontSize(5).fillColor('#111');
      let itemTotal = 0;
      items.forEach(item => {
        doc.text(item.product_name, cols[0], y, { width: cols[1] - cols[0] - 4 });
        doc.text('₦' + Number(item.unit_price).toLocaleString(), cols[1], y);
        doc.text(String(item.quantity), cols[2], y, { align: 'center' });
        doc.text('₦' + Number(item.subtotal).toLocaleString(), cols[3], y, { width: W - cols[3] - M, align: 'right' });
        itemTotal += Number(item.subtotal);
        y += 10;
      });

      // Total row
      y += 2;
      doc.moveTo(M, y).lineTo(W - M, y).stroke('#111');
      y += 4;
      doc.font('Courier-Bold').fontSize(6);
      doc.text('Total:', cols[1], y);
      doc.text(String(items.length), cols[2], y, { align: 'center' });
      doc.text('₦' + itemTotal.toLocaleString(), cols[3], y, { width: W - cols[3] - M, align: 'right' });

      // Footer
      y = H - 55;
      doc.font('Courier').fontSize(5).fillColor('#555');
      doc.text('Thank you for choosing PARFCO!', M, y, { width: W - M * 2 });
      y += 10;
      doc.fontSize(4.5).fillColor('#999');
      doc.text('Questions? WhatsApp 0707 093 0000', M, y, { width: W - M * 2 });
      y += 7;
      doc.text('Mon-Fri 10AM-5PM | Sat 10AM-2PM', M, y, { width: W - M * 2 });
      y += 7;
      doc.text('Enjoy your fragrance!', M, y, { width: W - M * 2 });
    });

    doc.end();
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/orders/export - XLSX with merged cells (must be before /:id)
router.get('/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { date_from, date_to, streamer_id, payment_status_id, product_names, ids } = req.query;
    let where = '1=1';
    const params = [];
    if (ids) { where += ' AND o.id IN (' + ids.split(',').map(()=>'?').join(',') + ')'; ids.split(',').forEach(id=>params.push(id)); }
    if (date_from) { where += ' AND o.created_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND o.created_at <= ?'; params.push(date_to + ' 23:59:59'); }
    if (streamer_id) { where += ' AND o.streamer_id = ?'; params.push(streamer_id); }
    if (payment_status_id) { where += ' AND o.payment_status_id = ?'; params.push(payment_status_id); }
    if (product_names) {
      const names = product_names.split(',').filter(Boolean);
      if (names.length > 0) {
        where += ' AND ' + names.map(() => 'o.id IN (SELECT oi.order_id FROM order_items oi WHERE oi.product_name LIKE ?)').join(' AND ');
        names.forEach(n => params.push('%' + n.trim() + '%'));
      }
    }
    const [rows] = await pool.query(
      "SELECT o.order_no,o.customer_name,o.customer_phone,o.customer_address,o.streamer_name,o.payment_status_name,o.total_amount,o.actual_amount,o.created_at,oi.product_code,oi.product_name,oi.unit_price,oi.quantity,oi.subtotal FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE "+where+" ORDER BY o.created_at DESC,oi.id", params
    );
    if (rows.length === 0) return res.status(400).json({ message: 'No data' });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Orders');
    const headers = ['Order No.','Customer','Phone','Address','Streamer','Payment','Total','Actual','Date','Product Code','Product Name','Unit Price','Quantity','Subtotal'];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    // Add data rows
    for (const r of rows) {
      ws.addRow([r.order_no,r.customer_name,r.customer_phone,r.customer_address,r.streamer_name,r.payment_status_name,r.total_amount,r.actual_amount,String(r.created_at||'').slice(0,10),r.product_code,r.product_name,r.unit_price,r.quantity,r.subtotal]);
    }

    // Merge cells by order group
    let row = 2; // data starts at row 2 (after header)
    while (row <= ws.rowCount) {
      const currentOrder = ws.getCell(row, 1).value;
      let endRow = row;
      while (endRow < ws.rowCount && ws.getCell(endRow + 1, 1).value === currentOrder) endRow++;
      if (endRow > row) {
        for (let col = 1; col <= 9; col++) {
          ws.mergeCells(row, col, endRow, col);
        }
      }
      row = endRow + 1;
    }

    // Style: center align merged cells
    ws.eachRow((r, rn) => {
      if (rn > 1) r.eachCell((c, cn) => {
        if (cn <= 9) c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
    });

    // Column widths
    ws.columns.forEach((c, i) => {
      c.width = i < 9 ? 16 : (i < 11 ? 20 : 12);
    });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename=orders_export.xlsx');
    res.send(buf);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT o.*, sr.status AS shipping_status, sr.shipping_code FROM orders o LEFT JOIN shipping_records sr ON sr.order_id=o.id WHERE o.id=?',[req.params.id]);
    if (rows.length===0) return res.status(404).json({ message: 'Not found' });
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?',[rows[0].id]);
    rows[0].items = items;
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/orders
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { customer_name, customer_gender, customer_phone, customer_address, streamer_id, payment_status_id, actual_amount, items } = req.body;
    if (!items || !Array.isArray(items) || items.length===0) return res.status(400).json({ message: 'Select at least one product' });
    const prefix = genOrderNo();
    const [lastRows] = await conn.query("SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1",[prefix+'%']);
    let seq = 1;
    if (lastRows.length>0) { const ls = parseInt(lastRows[0].order_no.slice(-3)); if (!isNaN(ls)) seq = ls+1; }
    const orderNo = prefix + String(seq).padStart(3,'0');
    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const [prodRows] = await conn.query('SELECT * FROM products WHERE id=?',[item.product_id]);
      if (prodRows.length===0) { conn.release(); return res.status(400).json({ message: 'Product not found' }); }
      const p = prodRows[0]; const qty = parseInt(item.quantity)||1;
      const subtotal = parseFloat(p.price)*qty; totalAmount += subtotal;
      orderItems.push({ product_id:p.id, product_code:p.code, product_name:p.name, unit_price:p.price, quantity:qty, subtotal });
    }
    const actual = actual_amount!=null ? Math.min(parseFloat(actual_amount),totalAmount) : totalAmount;
    let sn='', psn='', cr=0;
    if (streamer_id) { const [sr]=await conn.query('SELECT name,commission_rate FROM streamers WHERE id=?',[streamer_id]); if (sr.length>0) { sn=sr[0].name; cr=sr[0].commission_rate; } }
    if (payment_status_id) { const [ps]=await conn.query('SELECT name FROM payment_statuses WHERE id=?',[payment_status_id]); if (ps.length>0) psn=ps[0].name; }
    const [orderResult] = await conn.query(
      'INSERT INTO orders (order_no,customer_name,customer_gender,customer_phone,customer_address,streamer_id,streamer_name,commission_rate,payment_status_id,payment_status_name,total_amount,actual_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [orderNo,customer_name||'',customer_gender||'',customer_phone||'',customer_address||'',streamer_id||null,sn,cr,payment_status_id||null,psn,totalAmount,actual]
    );
    for (const oi of orderItems) {
      await conn.query('INSERT INTO order_items (order_id,product_id,product_code,product_name,unit_price,quantity,subtotal) VALUES (?,?,?,?,?,?,?)',
        [orderResult.insertId,oi.product_id,oi.product_code,oi.product_name,oi.unit_price,oi.quantity,oi.subtotal]);
    }
    const shipCode = 'SHP'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase();
    await conn.query("INSERT INTO shipping_records (order_id,shipping_code,status) VALUES (?,?,'pending')",[orderResult.insertId,shipCode]);
    conn.release();
    res.status(201).json({ id:orderResult.insertId, order_no:orderNo, total_amount:totalAmount });
  } catch (err) { conn.release(); console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/orders/:id
router.put('/:id', async (req, res) => {
  try {
    const { customer_name, customer_gender, customer_phone, customer_address, streamer_id, payment_status_id, actual_amount } = req.body;
    const [orderRows] = await pool.query('SELECT total_amount FROM orders WHERE id=?',[req.params.id]);
    if (orderRows.length===0) return res.status(404).json({ message: 'Not found' });
    const actual = actual_amount!=null ? Math.min(parseFloat(actual_amount),orderRows[0].total_amount) : undefined;
    await pool.query('UPDATE orders SET customer_name=?,customer_gender=?,customer_phone=?,customer_address=?,streamer_id=?,payment_status_id=?,actual_amount=? WHERE id=?',
      [customer_name,customer_gender,customer_phone,customer_address,streamer_id,payment_status_id,actual!=null?actual:orderRows[0].total_amount,req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/orders/:id - admin only
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM shipping_records WHERE order_id=?',[req.params.id]);
    await pool.query('DELETE FROM order_items WHERE order_id=?',[req.params.id]);
    await pool.query('DELETE FROM orders WHERE id=?',[req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
