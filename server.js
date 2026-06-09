require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '6282284326992';
const QRIS_IMAGE_URL = process.env.QRIS_IMAGE_URL || '/images/qris-chocolater.svg';
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'chocolate-later-secret';

const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Format gambar harus JPG, PNG, atau WEBP'));
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'mysql.railway.internal',
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || 'usthIDbeFSZoQtZcRLZTXOfKteiNsZJN',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password) + PASSWORD_SECRET).digest('hex');
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(Number(number || 0));
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.replace('Bearer ', '').trim();
}

async function readUserFromToken(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > NOW()`,
    [token]
  );

  return rows[0] || null;
}

async function optionalAuth(req, res, next) {
  try {
    req.user = await readUserFromToken(req);
    next();
  } catch (error) {
    next();
  }
}

async function requireAuth(req, res, next) {
  try {
    const user = await readUserFromToken(req);
    if (!user) return res.status(401).json({ message: 'Silakan login terlebih dahulu' });
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Gagal memeriksa login', detail: error.message });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'Akses ditolak. Halaman ini khusus ' + role });
    }
    next();
  };
}

function makeWhatsAppMessage(order, items) {
  const itemLines = items
    .map((item, index) => `${index + 1}. ${item.name} x${item.quantity} = ${formatRupiah(item.subtotal)}`)
    .join('\n');

  const paymentLabel = order.payment_method === 'qris'
    ? 'QRIS - bukti pembayaran akan dikirim lewat WhatsApp'
    : 'Konfirmasi lewat WhatsApp';

  return `Halo, saya ingin memesan produk ChocoLater Store.

` +
    `No Order: #${order.id}
` +
    `Nama: ${order.customer_name}
` +
    `No HP: ${order.phone}
` +
    `Alamat: ${order.address}

` +
    `Detail Pesanan:
${itemLines}

` +
    `Total: ${formatRupiah(order.total)}
` +
    `Metode Pembayaran: ${paymentLabel}
` +
    `Catatan: ${order.notes || '-'}

` +
    `Mohon konfirmasi pesanan saya. Terima kasih.`;
}



const STORE_PROFILE = {
  storeName: 'ChocoLater Store',
  campusName: 'Institut Bisnis Pelita Indonesia',
  phone: '0822-8432-6992',
  email: 'willey24pranata@gmail.com',
  logoPath: '/images/logo.png'
};

function normalizeDateTimeForMysql(value) {
  if (!value) return null;

  const text = String(value).trim().replace('T', ' ');

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return `${text}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text;

  return null;
}


async function syncMemberWithUser(db, userId, userData) {
  const role = userData.role || 'customer';

  if (role === 'customer') {
    await db.query(
      `INSERT INTO members (user_id, name, email, phone, address)
       VALUES (?, ?, ?, ?, '')
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         email = VALUES(email),
         phone = VALUES(phone)`,
      [userId, userData.name || '', userData.email || '', userData.phone || '']
    );
    return;
  }

  await db.query('DELETE FROM members WHERE user_id = ?', [userId]);
}

async function syncUserWithMember(db, memberId, memberData) {
  const [members] = await db.query('SELECT user_id FROM members WHERE id = ?', [memberId]);
  const member = members[0];

  if (!member || !member.user_id) return;

  await db.query(
    "UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ? AND role = \'customer\'",
    [memberData.name || '', memberData.email || '', memberData.phone || '', member.user_id]
  );
}

function buildReportPeriod(query = {}) {
  const period = query.period || 'monthly';

  if (period === 'daily') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '')
      ? query.date
      : new Date().toISOString().slice(0, 10);

    return {
      type: 'daily',
      label: `Laporan Harian - ${date}`,
      whereSql: 'WHERE o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)',
      params: [`${date} 00:00:00`, `${date} 00:00:00`]
    };
  }

  if (period === 'yearly') {
    const year = /^\d{4}$/.test(query.year || '')
      ? query.year
      : String(new Date().getFullYear());
    const start = `${year}-01-01 00:00:00`;

    return {
      type: 'yearly',
      label: `Laporan Tahunan - ${year}`,
      whereSql: 'WHERE o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 YEAR)',
      params: [start, start]
    };
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : currentMonth;
  const start = `${month}-01 00:00:00`;

  return {
    type: 'monthly',
    label: `Laporan Bulanan - ${month}`,
    whereSql: 'WHERE o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 MONTH)',
    params: [start, start]
  };
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, message: 'API dan database aktif' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Database belum terhubung', detail: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email dan password wajib diisi' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    if (!user || user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }

    if (user.status !== 'aktif') return res.status(403).json({ message: 'Akun belum aktif' });

    const token = createToken();
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))',
      [user.id, token]
    );

    res.json({
      message: 'Login berhasil',
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ message: 'Gagal login', detail: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { name, email, phone, address, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Nama, email, no HP, dan password wajib diisi' });
    }

    await connection.beginTransaction();
    const [exists] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) throw new Error('Email sudah terdaftar');

    const [userResult] = await connection.query(
      `INSERT INTO users (name, email, phone, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'customer', 'aktif')`,
      [name, email, phone, hashPassword(password)]
    );

    await connection.query(
      'INSERT INTO members (user_id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)',
      [userResult.insertId, name, email, phone, address || '']
    );

    await connection.commit();
    res.status(201).json({ message: 'Pendaftaran berhasil. Silakan login.' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: error.message || 'Gagal daftar' });
  } finally {
    connection.release();
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = getBearerToken(req);
  await pool.query('DELETE FROM sessions WHERE token = ?', [token]);
  res.json({ message: 'Logout berhasil' });
});

app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE is_active = 1 ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil data produk', detail: error.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });
  }
});

app.get('/api/payment-options', (req, res) => {
  res.json({
    methods: [
      {
        id: 'whatsapp',
        name: 'Chat WhatsApp',
        description: 'Pesanan disimpan lalu customer langsung diarahkan ke WhatsApp toko.'
      },
      {
        id: 'qris',
        name: 'QRIS',
        description: 'Customer scan QRIS, lalu lanjut WhatsApp untuk mengirim bukti pembayaran.',
        qris_image_url: QRIS_IMAGE_URL
      }
    ]
  });
});

app.post('/api/orders', optionalAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { customer_name, phone, address, notes, items, payment_method } = req.body;
    const paymentMethod = payment_method === 'qris' ? 'qris' : 'whatsapp';
    if (!customer_name || !phone || !address) {
      return res.status(400).json({ message: 'Nama, nomor HP, dan alamat wajib diisi' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Keranjang masih kosong' });
    }

    await connection.beginTransaction();
    const finalItems = [];
    let total = 0;

    for (const rawItem of items) {
      const productId = Number(rawItem.product_id);
      const quantity = Number(rawItem.quantity);
      if (!productId || !quantity || quantity < 1) throw new Error('Data item tidak valid');

      const [products] = await connection.query('SELECT * FROM products WHERE id = ? AND is_active = 1 FOR UPDATE', [productId]);
      if (!products.length) throw new Error(`Produk dengan ID ${productId} tidak ditemukan`);
      const product = products[0];
      if (Number(product.stock) < quantity) throw new Error(`Stok ${product.name} tidak cukup`);

      const price = Number(product.price);
      const subtotal = price * quantity;
      total += subtotal;
      finalItems.push({ product_id: product.id, name: product.name, quantity, price, subtotal });
    }

    const customerUserId = req.user && req.user.role === 'customer' ? req.user.id : null;
    const finalNotes = [
      `Metode Pembayaran: ${paymentMethod === 'qris' ? 'QRIS' : 'WhatsApp'}`,
      notes || ''
    ].filter(Boolean).join('\n');

    const [orderResult] = await connection.query(
      `INSERT INTO orders (customer_user_id, customer_name, phone, address, notes, total, status)
       VALUES (?, ?, ?, ?, ?, ?, 'baru')`,
      [customerUserId, customer_name, phone, address, finalNotes, total]
    );

    const orderId = orderResult.insertId;
    for (const item of finalItems) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, item.product_id, item.name, item.quantity, item.price, item.subtotal]
      );
      await connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
    }

    await connection.commit();
    const order = { id: orderId, customer_name, phone, address, notes, total, payment_method: paymentMethod };
    const message = makeWhatsAppMessage(order, finalItems);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    res.status(201).json({
      message: 'Pesanan berhasil disimpan',
      order_id: orderId,
      total,
      whatsapp_url: whatsappUrl,
      payment: {
        method: paymentMethod,
        qris_image_url: QRIS_IMAGE_URL,
        note: paymentMethod === 'qris'
          ? 'Silakan scan QRIS, lalu lanjutkan chat WhatsApp untuk kirim bukti pembayaran.'
          : 'Customer diarahkan langsung ke WhatsApp untuk konfirmasi pesanan.'
      }
    });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: error.message || 'Gagal membuat pesanan' });
  } finally {
    connection.release();
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ message: 'Nama, email, dan pesan wajib diisi' });
    const [result] = await pool.query(
      'INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone || '', subject || 'Pesan pelanggan', message]
    );
    res.status(201).json({ message: 'Pesan berhasil dikirim', id: result.insertId });
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengirim pesan', detail: error.message });
  }
});

app.get('/api/customer/orders', requireAuth, async (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ message: 'Khusus customer' });
  const [orders] = await pool.query('SELECT * FROM orders WHERE customer_user_id = ? ORDER BY id DESC', [req.user.id]);
  res.json(orders);
});

app.use('/api/admin', requireAuth, requireRole('admin'));

app.get('/api/admin/stats', async (req, res) => {
  try {
    const [[income]] = await pool.query('SELECT COALESCE(SUM(total),0) AS value FROM orders WHERE status != "dibatalkan"');
    const [[orders]] = await pool.query('SELECT COUNT(*) AS value FROM orders');
    const [[pending]] = await pool.query('SELECT COUNT(*) AS value FROM orders WHERE status IN ("baru", "diproses")');
    const [[members]] = await pool.query('SELECT COUNT(*) AS value FROM members');
    const [[products]] = await pool.query('SELECT COUNT(*) AS value FROM products');
    const [[messages]] = await pool.query('SELECT COUNT(*) AS value FROM messages WHERE status = "baru"');

    const [monthlySales] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COALESCE(SUM(total),0) AS total
       FROM orders
       WHERE status != 'dibatalkan' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month ASC`
    );

    const [productSales] = await pool.query(
      `SELECT product_name AS name, COALESCE(SUM(quantity),0) AS qty, COALESCE(SUM(subtotal),0) AS total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'dibatalkan'
       GROUP BY product_name
       ORDER BY qty DESC`
    );

    res.json({
      total_income: Number(income.value),
      total_orders: Number(orders.value),
      pending_orders: Number(pending.value),
      total_members: Number(members.value),
      total_products: Number(products.value),
      unread_messages: Number(messages.value),
      monthly_sales: monthlySales,
      product_sales: productSales
    });
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil statistik', detail: error.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, phone, role, status, created_at FROM users ORDER BY id DESC');
  res.json(rows);
});

app.post('/api/admin/users', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { name, email, phone, password, role, status } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Nama, email, password, dan role wajib diisi' });
    }

    await connection.beginTransaction();

    const [result] = await connection.query(
      'INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, phone || '', hashPassword(password), role, status || 'aktif']
    );

    await syncMemberWithUser(connection, result.insertId, { name, email, phone, role });

    await connection.commit();

    res.status(201).json({ message: 'User berhasil ditambahkan', id: result.insertId });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: 'Gagal menambah user', detail: error.message });
  } finally {
    connection.release();
  }
});

app.put('/api/admin/users/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { name, email, phone, role, status, password } = req.body;
    const userId = Number(req.params.id);

    await connection.beginTransaction();

    const params = [name, email, phone || '', role, status || 'aktif'];
    let sql = 'UPDATE users SET name=?, email=?, phone=?, role=?, status=?';

    if (password) {
      sql += ', password_hash=?';
      params.push(hashPassword(password));
    }

    sql += ' WHERE id=?';
    params.push(userId);

    const [result] = await connection.query(sql, params);

    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    await syncMemberWithUser(connection, userId, { name, email, phone, role });

    await connection.commit();

    res.json({ message: 'User berhasil diperbarui dan data member ikut tersinkron' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: 'Gagal memperbarui user', detail: error.message });
  } finally {
    connection.release();
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = Number(req.params.id);

    if (userId === Number(req.user.id)) {
      return res.status(400).json({ message: 'User yang sedang login tidak bisa dihapus' });
    }

    await connection.beginTransaction();

    await connection.query('DELETE FROM members WHERE user_id = ?', [userId]);

    const [result] = await connection.query('DELETE FROM users WHERE id = ?', [userId]);

    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    await connection.commit();

    res.json({ message: 'User berhasil dihapus' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: 'Gagal menghapus user', detail: error.message });
  } finally {
    connection.release();
  }
});

function normalizeProductBody(body, file) {
  return {
    sku: body.sku || '',
    name: body.name || '',
    description: body.description || '',
    price: Number(body.price || 0),
    stock: Number(body.stock || 0),
    image_url: file ? `/uploads/${file.filename}` : (body.image_url || ''),
    is_active: body.is_active === '0' ? 0 : 1
  };
}

app.get('/api/admin/products', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM products ORDER BY id DESC');
  res.json(rows);
});

app.get('/api/admin/menu', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, price, stock, is_active FROM products ORDER BY id ASC');
  res.json(rows);
});

app.post('/api/admin/products', upload.single('image'), async (req, res) => {
  try {
    const product = normalizeProductBody(req.body, req.file);
    if (!product.name || !product.price) return res.status(400).json({ message: 'Nama dan harga wajib diisi' });
    const [result] = await pool.query(
      'INSERT INTO products (sku, name, description, price, stock, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product.sku, product.name, product.description, product.price, product.stock, product.image_url, product.is_active]
    );
    res.status(201).json({ message: 'Barang/menu berhasil ditambahkan', id: result.insertId });
  } catch (error) {
    res.status(400).json({ message: 'Gagal menambah barang/menu', detail: error.message });
  }
});

app.put('/api/admin/products/:id', upload.single('image'), async (req, res) => {
  try {
    const product = normalizeProductBody(req.body, req.file);
    if (!product.image_url) {
      const [oldRows] = await pool.query('SELECT image_url FROM products WHERE id = ?', [req.params.id]);
      product.image_url = oldRows[0]?.image_url || '';
    }
    const [result] = await pool.query(
      `UPDATE products SET sku=?, name=?, description=?, price=?, stock=?, image_url=?, is_active=? WHERE id=?`,
      [product.sku, product.name, product.description, product.price, product.stock, product.image_url, product.is_active, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    res.json({ message: 'Barang/menu berhasil diperbarui' });
  } catch (error) {
    res.status(400).json({ message: 'Gagal memperbarui barang/menu', detail: error.message });
  }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  const [result] = await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Produk tidak ditemukan' });
  res.json({ message: 'Produk berhasil dihapus' });
});

app.get('/api/admin/orders', async (req, res) => {
  const [orders] = await pool.query('SELECT * FROM orders ORDER BY id DESC');
  for (const order of orders) {
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    order.items = items;
  }
  res.json(orders);
});

app.post('/api/admin/orders', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { customer_name, phone, address, notes, items, status, order_date } = req.body;
    const allowedStatus = ['baru', 'diproses', 'selesai', 'dibatalkan'];

    if (!customer_name) {
      return res.status(400).json({ message: 'Nama pembeli wajib diisi' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Minimal pilih satu produk untuk pembelian manual' });
    }

    const orderStatus = allowedStatus.includes(status) ? status : 'selesai';
    const manualDate = normalizeDateTimeForMysql(order_date);

    await connection.beginTransaction();

    const finalItems = [];
    let total = 0;

    for (const rawItem of items) {
      const productId = Number(rawItem.product_id);
      const quantity = Number(rawItem.quantity);

      if (!productId || !quantity || quantity < 1) {
        throw new Error('Produk dan jumlah pembelian tidak valid');
      }

      const [products] = await connection.query(
        'SELECT * FROM products WHERE id = ? AND is_active = 1 FOR UPDATE',
        [productId]
      );

      if (!products.length) throw new Error(`Produk dengan ID ${productId} tidak ditemukan atau tidak aktif`);

      const product = products[0];

      if (Number(product.stock) < quantity) {
        throw new Error(`Stok ${product.name} tidak cukup. Stok tersedia: ${product.stock}`);
      }

      const price = Number(product.price);
      const subtotal = price * quantity;
      total += subtotal;
      finalItems.push({ product_id: product.id, name: product.name, quantity, price, subtotal });
    }

    const finalNotes = [
      'Penjualan langsung / manual dari admin',
      notes || ''
    ].filter(Boolean).join('\n');

    let orderResult;

    if (manualDate) {
      [orderResult] = await connection.query(
        `INSERT INTO orders (customer_user_id, customer_name, phone, address, notes, total, status, created_at)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [customer_name, phone || '-', address || 'Pembelian langsung di toko', finalNotes, total, orderStatus, manualDate]
      );
    } else {
      [orderResult] = await connection.query(
        `INSERT INTO orders (customer_user_id, customer_name, phone, address, notes, total, status)
         VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
        [customer_name, phone || '-', address || 'Pembelian langsung di toko', finalNotes, total, orderStatus]
      );
    }

    const orderId = orderResult.insertId;

    for (const item of finalItems) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, item.product_id, item.name, item.quantity, item.price, item.subtotal]
      );

      await connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
    }

    await connection.commit();

    res.status(201).json({
      message: 'Pembelian manual berhasil ditambahkan',
      order_id: orderId,
      total
    });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: error.message || 'Gagal menambah pembelian manual' });
  } finally {
    connection.release();
  }
});

app.put('/api/admin/orders/:id/status', async (req, res) => {
  const allowed = ['baru', 'diproses', 'selesai', 'dibatalkan'];
  const { status } = req.body;
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Status tidak valid' });
  const [result] = await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
  res.json({ message: 'Status berhasil diperbarui' });
});

app.delete('/api/admin/orders/:id', async (req, res) => {
  const [result] = await pool.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
  res.json({ message: 'Pesanan berhasil dihapus' });
});

app.get('/api/admin/messages', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM messages ORDER BY id DESC');
  res.json(rows);
});

app.put('/api/admin/messages/:id/status', async (req, res) => {
  const { status } = req.body;
  const [result] = await pool.query('UPDATE messages SET status = ? WHERE id = ?', [status || 'dibaca', req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Pesan tidak ditemukan' });
  res.json({ message: 'Status pesan berhasil diperbarui' });
});

app.delete('/api/admin/messages/:id', async (req, res) => {
  const [result] = await pool.query('DELETE FROM messages WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Pesan tidak ditemukan' });
  res.json({ message: 'Pesan berhasil dihapus' });
});

app.get('/api/admin/members', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.*, u.status
     FROM members m
     LEFT JOIN users u ON u.id = m.user_id
     ORDER BY m.id DESC`
  );
  res.json(rows);
});

app.put('/api/admin/members/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { name, email, phone, address } = req.body;
    const memberId = Number(req.params.id);

    await connection.beginTransaction();

    const [result] = await connection.query(
      'UPDATE members SET name=?, email=?, phone=?, address=? WHERE id=?',
      [name, email, phone || '', address || '', memberId]
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: 'Member tidak ditemukan' });
    }

    await syncUserWithMember(connection, memberId, { name, email, phone });

    await connection.commit();

    res.json({ message: 'Member berhasil diperbarui dan user ikut tersinkron' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ message: 'Gagal memperbarui member', detail: error.message });
  } finally {
    connection.release();
  }
});

app.get('/api/admin/reports', async (req, res) => {
  try {
    const period = buildReportPeriod(req.query);
    const [users] = await pool.query('SELECT id, name, email, phone, role, status, created_at FROM users ORDER BY id DESC');
    const [products] = await pool.query('SELECT * FROM products ORDER BY id DESC');
    const [members] = await pool.query('SELECT * FROM members ORDER BY id DESC');
    const [messages] = await pool.query('SELECT * FROM messages ORDER BY id DESC');
    const [orders] = await pool.query(
      `SELECT o.* FROM orders o ${period.whereSql} ORDER BY o.created_at DESC, o.id DESC`,
      period.params
    );
    const [items] = await pool.query(
      `SELECT oi.*, o.created_at AS order_date
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       ${period.whereSql}
       ORDER BY o.created_at DESC, oi.order_id DESC`,
      period.params
    );
    const [[summary]] = await pool.query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(CASE WHEN o.status != 'dibatalkan' THEN o.total ELSE 0 END),0) AS total_income,
              COALESCE(SUM(CASE WHEN o.status = 'baru' THEN 1 ELSE 0 END),0) AS new_orders,
              COALESCE(SUM(CASE WHEN o.status = 'selesai' THEN 1 ELSE 0 END),0) AS completed_orders,
              COALESCE(SUM(CASE WHEN o.status = 'dibatalkan' THEN 1 ELSE 0 END),0) AS cancelled_orders
       FROM orders o ${period.whereSql}`,
      period.params
    );

    res.json({
      profile: STORE_PROFILE,
      printed_by: req.user ? req.user.name : 'Admin',
      printed_at: new Date().toISOString(),
      period: { type: period.type, label: period.label },
      summary,
      users,
      products,
      members,
      messages,
      orders,
      order_items: items
    });
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengambil laporan', detail: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
