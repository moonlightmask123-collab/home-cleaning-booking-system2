// Home Cleaning Booking Slot System - Node.js + Express + MySQL
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ====== SETTINGS (read from .env file or environment variables) ======
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
} catch (e) { /* no .env file - defaults are used */ }
const env = process.env;

let dbCfg = {
  host: env.DB_HOST || 'localhost', port: +env.DB_PORT || 3306,
  user: env.DB_USER || 'root', password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'home_cleaning'
};
if (env.DATABASE_URL) { // e.g. mysql://user:pass@host:3306/dbname (given by most hosts)
  const u = new URL(env.DATABASE_URL);
  dbCfg = { host: u.hostname, port: +u.port || 3306, user: decodeURIComponent(u.username),
            password: decodeURIComponent(u.password), database: u.pathname.slice(1) };
}
let ssl;
if (/^(1|true|yes)$/i.test(env.DB_SSL || '')) {
  ssl = { rejectUnauthorized: true };
  if (env.DB_SSL_CA) ssl.ca = fs.readFileSync(env.DB_SSL_CA);
}
const PORT = +env.PORT || 3000;
const SLOT_CAPACITY = +env.SLOT_CAPACITY || 3;      // bookings allowed per time slot
const LEAD_MINUTES = 60;                            // a slot closes 1 hour before it starts
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || '';    // empty = admin panel disabled
let SECRET = env.AUTH_SECRET;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: AUTH_SECRET is not set. Users will be logged out whenever the server restarts.');
}

// ====== BUSINESS DATA (single source of truth - the website reads it from /api/services) ======
const SERVICES = [
  { name: 'Basic Home Cleaning', desc: 'Sweeping, mopping and dusting of all rooms.', price: 499 },
  { name: 'Deep Home Cleaning', desc: 'Thorough scrubbing of floors, walls and corners.', price: 1499 },
  { name: 'Kitchen Cleaning', desc: 'Stove, chimney, cabinets, sink and tiles cleaned.', price: 799 },
  { name: 'Bathroom Cleaning', desc: 'Tiles, taps, toilet and floor disinfected.', price: 599 },
  { name: 'Full House Cleaning', desc: 'Complete cleaning of the entire home.', price: 2499 }
];
const SLOTS = [
  { label: '09:00 AM - 11:00 AM', start: 9 * 60 },
  { label: '11:00 AM - 01:00 PM', start: 11 * 60 },
  { label: '02:00 PM - 04:00 PM', start: 14 * 60 },
  { label: '04:00 PM - 06:00 PM', start: 16 * 60 }
];
const STATUSES = ['Confirmed', 'Completed', 'Cancelled'];

// ====== DATABASE ======
const pool = mysql.createPool({
  ...dbCfg, ssl, dateStrings: true, waitForConnections: true, connectionLimit: 10
}).promise();
const db = pool;

async function initDatabase() {
  if (/^[A-Za-z0-9_]+$/.test(dbCfg.database)) {
    try { // create the database if missing (some hosts do not allow this - then it must already exist)
      const c = await mysql.createConnection({ ...dbCfg, database: undefined, ssl }).promise();
      await c.query('CREATE DATABASE IF NOT EXISTS `' + dbCfg.database + '`');
      await c.end();
    } catch (e) { /* ignore */ }
  }
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(15) NOT NULL,
    password VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service VARCHAR(100) NOT NULL,
    price INT NOT NULL DEFAULT 0,
    booking_date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    address VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Confirmed',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_slot (booking_date, time_slot, status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  // upgrade a database that was created with the older schema
  const [c1] = await db.query("SHOW COLUMNS FROM bookings LIKE 'price'");
  if (!c1.length) await db.query('ALTER TABLE bookings ADD COLUMN price INT NOT NULL DEFAULT 0');
  const [c2] = await db.query("SHOW COLUMNS FROM bookings LIKE 'created_at'");
  if (!c2.length) await db.query('ALTER TABLE bookings ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  const [i1] = await db.query("SHOW INDEX FROM bookings WHERE Key_name = 'idx_slot'");
  if (!i1.length) await db.query('ALTER TABLE bookings ADD INDEX idx_slot (booking_date, time_slot, status)');
}

// ====== TIME HELPERS (India time, whatever the server's timezone is) ======
function istNow() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = t => p.find(x => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: (+g('hour')) * 60 + (+g('minute')) };
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function slotClosed(dateStr, slot) { // true if this slot can no longer be booked/cancelled
  const now = istNow();
  if (dateStr < now.date) return true;
  return dateStr === now.date && slot.start - LEAD_MINUTES <= now.minutes;
}

// ====== LOGIN TOKENS (signed with HMAC, no extra library needed) ======
function makeToken(payload, hours) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600e3 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
function readToken(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}
function auth(role) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const p = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!p || p.role !== role) return res.status(401).json({ message: 'Please login again.' });
    req.auth = p; next();
  };
}

// ====== SIMPLE BRUTE-FORCE PROTECTION ======
const fails = new Map();
const isLocked = k => { const e = fails.get(k); return !!(e && e.n >= 8 && e.until > Date.now()); };
const addFail = k => {
  let e = fails.get(k); if (!e || e.until < Date.now()) e = { n: 0 };
  e.n++; e.until = Date.now() + 15 * 60e3; fails.set(k, e);
};
setInterval(() => fails.forEach((e, k) => { if (e.until < Date.now()) fails.delete(k); }), 600e3).unref();

// ====== APP ======
const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  next();
});
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(err => {
  console.error(err);
  res.status(500).json({ message: 'Server error. Please try again.' });
});

// ====== SERVE FRONTEND ======
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
['index', 'register', 'login', 'services', 'booking', 'booking-history', 'profile', 'admin'].forEach(p =>
  app.get('/' + p + '.html', (req, res) => res.sendFile(path.join(__dirname, p + '.html'))));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ====== PUBLIC INFO ======
app.get('/api/health', wrap(async (req, res) => { await db.query('SELECT 1'); res.json({ ok: true }); }));

app.get('/api/services', (req, res) =>
  res.json({ services: SERVICES, slots: SLOTS.map(s => s.label), capacity: SLOT_CAPACITY }));

app.get('/api/availability', wrap(async (req, res) => {
  const date = req.query.date;
  if (!validDate(date)) return res.status(400).json({ message: 'Invalid date.' });
  const [rows] = await db.query(
    "SELECT time_slot, COUNT(*) AS c FROM bookings WHERE booking_date = ? AND status <> 'Cancelled' GROUP BY time_slot", [date]);
  const used = {}; rows.forEach(r => { used[r.time_slot] = Number(r.c); });
  res.json(SLOTS.map(s => ({
    slot: s.label,
    left: slotClosed(date, s) ? 0 : Math.max(0, SLOT_CAPACITY - (used[s.label] || 0))
  })));
}));

// ====== 1. REGISTER ======
app.post('/api/register', wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').trim(), password = String(b.password || ''), address = String(b.address || '').trim();
  if (!name || !email || !phone || !password || !address) return res.status(400).json({ message: 'All fields are required.' });
  if (name.length > 100) return res.status(400).json({ message: 'Name is too long.' });
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 100) return res.status(400).json({ message: 'Enter a valid email.' });
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ message: 'Enter a valid 10-digit mobile number.' });
  if (password.length < 6 || password.length > 72) return res.status(400).json({ message: 'Password must be 6 to 72 characters.' });
  if (address.length < 5 || address.length > 255) return res.status(400).json({ message: 'Enter your full address.' });
  const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exists.length > 0) return res.status(409).json({ message: 'Email already registered.' });
  const hash = await bcrypt.hash(password, 10);
  try {
    await db.query('INSERT INTO users (name, email, phone, password, address) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone, hash, address]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already registered.' });
    throw err;
  }
  res.json({ message: 'Registration successful!' });
}));

// ====== 2. LOGIN ======
app.post('/api/login', wrap(async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const key = req.ip + '|' + email;
  if (isLocked(key)) return res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  const match = user ? await bcrypt.compare(password, user.password) : false;
  if (!match) { addFail(key); return res.status(401).json({ message: 'Invalid email or password.' }); }
  fails.delete(key);
  res.json({ message: 'Login successful!', token: makeToken({ role: 'user', id: user.id }, 24 * 7),
             user: { id: user.id, name: user.name, email: user.email } });
}));

// ====== 3. GET USER PROFILE (only your own) ======
app.get('/api/user/:id', auth('user'), wrap(async (req, res) => {
  if (String(req.auth.id) !== req.params.id) return res.status(403).json({ message: 'Not allowed.' });
  const [rows] = await db.query('SELECT id, name, email, phone, address FROM users WHERE id = ?', [req.auth.id]);
  if (rows.length === 0) return res.status(404).json({ message: 'User not found.' });
  res.json(rows[0]);
}));

// ====== 4. CREATE BOOKING ======
app.post('/api/bookings', auth('user'), wrap(async (req, res) => {
  const b = req.body || {};
  const service = SERVICES.find(s => s.name === b.service);
  const slot = SLOTS.find(s => s.label === b.time_slot);
  const date = b.booking_date, address = String(b.address || '').trim();
  if (!service) return res.status(400).json({ message: 'Please select a valid service.' });
  if (!validDate(date)) return res.status(400).json({ message: 'Please select a valid date.' });
  if (!slot) return res.status(400).json({ message: 'Please select a valid time slot.' });
  if (address.length < 5 || address.length > 255) return res.status(400).json({ message: 'Please enter your full address.' });
  const today = istNow().date;
  if (date < today) return res.status(400).json({ message: 'Date cannot be in the past.' });
  if (date > addDays(today, 60)) return res.status(400).json({ message: 'You can book up to 60 days ahead.' });
  if (slotClosed(date, slot)) return res.status(400).json({ message: 'This slot is closed. Please choose a later slot.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // lock this slot's rows so two people cannot take the last place at the same moment
    const [taken] = await conn.query(
      "SELECT id, user_id FROM bookings WHERE booking_date = ? AND time_slot = ? AND status <> 'Cancelled' FOR UPDATE",
      [date, slot.label]);
    if (taken.some(r => r.user_id === req.auth.id)) {
      await conn.rollback();
      return res.status(409).json({ message: 'You already have a booking in this slot.' });
    }
    if (taken.length >= SLOT_CAPACITY) {
      await conn.rollback();
      return res.status(409).json({ message: 'Sorry, this slot is full. Please choose another.' });
    }
    const [r] = await conn.query(
      'INSERT INTO bookings (user_id, service, price, booking_date, time_slot, address, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.auth.id, service.name, service.price, date, slot.label, address, 'Confirmed']);
    await conn.commit();
    res.json({ message: 'Booking confirmed successfully!', booking: { id: r.insertId, price: service.price } });
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW')
      return res.status(401).json({ message: 'Account not found. Please login again.' });
    throw err;
  } finally { conn.release(); }
}));

// ====== 5. BOOKING HISTORY (only your own) ======
app.get('/api/bookings/:userId', auth('user'), wrap(async (req, res) => {
  if (String(req.auth.id) !== req.params.userId) return res.status(403).json({ message: 'Not allowed.' });
  const [rows] = await db.query(
    'SELECT id, service, price, booking_date, time_slot, address, status FROM bookings WHERE user_id = ? ORDER BY booking_date DESC, id DESC',
    [req.auth.id]);
  res.json(rows);
}));

// ====== 6. CANCEL BOOKING ======
app.post('/api/bookings/:id/cancel', auth('user'), wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM bookings WHERE id = ? AND user_id = ?', [req.params.id, req.auth.id]);
  const bk = rows[0];
  if (!bk) return res.status(404).json({ message: 'Booking not found.' });
  if (bk.status !== 'Confirmed') return res.status(400).json({ message: 'Only confirmed bookings can be cancelled.' });
  const slot = SLOTS.find(s => s.label === bk.time_slot);
  if (!slot || slotClosed(bk.booking_date, slot))
    return res.status(400).json({ message: 'Too late to cancel this booking. Please call us.' });
  await db.query("UPDATE bookings SET status = 'Cancelled' WHERE id = ?", [bk.id]);
  res.json({ message: 'Booking cancelled.' });
}));

// ====== ADMIN ======
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
app.post('/api/admin/login', wrap(async (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ message: 'Admin panel is not enabled (set ADMIN_PASSWORD).' });
  const key = req.ip + '|admin';
  if (isLocked(key)) return res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
  if (!crypto.timingSafeEqual(sha((req.body || {}).password || ''), sha(ADMIN_PASSWORD))) {
    addFail(key); return res.status(401).json({ message: 'Wrong password.' });
  }
  fails.delete(key);
  res.json({ token: makeToken({ role: 'admin' }, 12) });
}));

app.get('/api/admin/bookings', auth('admin'), wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT b.id, b.service, b.price, b.booking_date, b.time_slot, b.address, b.status, b.created_at,
            u.name, u.email, u.phone
     FROM bookings b JOIN users u ON u.id = b.user_id
     ORDER BY b.booking_date DESC, b.id DESC LIMIT 500`);
  res.json(rows);
}));

app.post('/api/admin/bookings/:id/status', auth('admin'), wrap(async (req, res) => {
  const status = (req.body || {}).status;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status.' });
  const [r] = await db.query('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ message: 'Booking not found.' });
  res.json({ message: 'Status updated.' });
}));

// ====== ERRORS ======
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found.' }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'index.html')));
app.use((err, req, res, next) => { // e.g. broken JSON from a client
  res.status(err.status || 400).json({ message: 'Bad request.' });
});

initDatabase().then(() => {
  app.listen(PORT, () => console.log('Server running at http://localhost:' + PORT));
}).catch(err => {
  console.error('\nCould not connect to MySQL: ' + (err.code || err.message));
  console.error('Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME in your .env file and that MySQL is running.\n');
  process.exit(1);
});
