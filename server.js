const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const { runMigrations, dbFile } = require('./db');
const path = require('path');

// Ensure migrations executed
runMigrations();

const db = new Database(dbFile);

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());

// Simple in-memory session tokens for demo (not for production)
const sessions = new Map();

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    // check if username already exists
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: 'username already taken' });
    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const created_at = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO users (id, username, email, password_hash, xp, coins, level, created_at) VALUES (?, ?, ?, ?, 0, 0, 1, ?)');
    stmt.run(id, username, email || null, password_hash, created_at);
    console.log('Registered user', username, id);
    return res.json({ ok: true, id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'could not create user', details: e.message });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const row = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username);
    if (!row) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = uuidv4();
    sessions.set(token, { userId: row.id, createdAt: Date.now() });
    console.log('User logged in', username);
    return res.json({ ok: true, token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'login failed' });
  }
});

// middleware to authenticate via token header
function auth(req, res, next) {
  const token = req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'no token' });
  const s = sessions.get(token);
  if (!s) return res.status(401).json({ error: 'invalid token' });
  req.userId = s.userId;
  next();
}

app.get('/user', auth, (req, res) => {
  const row = db.prepare('SELECT id, username, email, xp, coins, level, created_at FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ error: 'user not found' });
  res.json({ user: row });
});

app.post('/user/modify', auth, (req, res) => {
  // modify xp/coins incrementally
  const { xpDelta = 0, coinsDelta = 0 } = req.body || {};
  try {
    const stmt = db.prepare('UPDATE users SET xp = xp + ?, coins = coins + ? WHERE id = ?');
    stmt.run(xpDelta, coinsDelta, req.userId);
    // recompute level based on xp
  const current = db.prepare('SELECT xp FROM users WHERE id = ?').get(req.userId);
  const newLevel = Math.floor(current.xp / 100) + 1;
    db.prepare('UPDATE users SET level = ? WHERE id = ?').run(newLevel, req.userId);
    const row = db.prepare('SELECT id, username, email, xp, coins, level FROM users WHERE id = ?').get(req.userId);
    res.json({ ok: true, user: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'could not update user' });
  }
});

// serve static client files for quick demo
app.use('/', express.static(path.join(__dirname, '/')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on', PORT));
