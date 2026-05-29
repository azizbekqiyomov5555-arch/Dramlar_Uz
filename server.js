const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

/* ── PostgreSQL ── */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('railway.internal')
    ? false
    : { rejectUnauthorized: false }
});

/* ── Jadval yaratish ── */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movies (
      id           TEXT PRIMARY KEY,
      title        TEXT    NOT NULL,
      genre        TEXT    DEFAULT '',
      price        INTEGER DEFAULT 0,
      poster       TEXT    DEFAULT '',
      poster_id    TEXT    DEFAULT '',
      videos       JSONB   DEFAULT '[]',
      video_keys   JSONB   DEFAULT '[]',
      episode_prices JSONB DEFAULT '{}',
      parts        JSONB   DEFAULT '[]',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ PostgreSQL jadval tayyor');
}
initDB().catch(console.error);

/* ── Admin token tekshirish ── */
function checkAdmin(req, res) {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    res.status(403).json({ ok: false, error: 'Ruxsat yoq' });
    return false;
  }
  return true;
}

/* ═══════════════════════════════
   GET  /api/movies  — barcha kinolar (hammaga)
═══════════════════════════════ */
app.get('/api/movies', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM movies ORDER BY created_at DESC'
    );
    res.json({ ok: true, movies: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ═══════════════════════════════
   POST /api/movies  — kino qo'shish (faqat admin)
   Body: { id, title, genre, price, poster, posterId, videos, videoKeys, episodePrices }
═══════════════════════════════ */
app.post('/api/movies', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { id, title, genre, price, poster, posterId, videos, videoKeys, episodePrices } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: 'title majburiy' });

    const { rows } = await pool.query(
      `INSERT INTO movies (id, title, genre, price, poster, poster_id, videos, video_keys, episode_prices)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         title=$2, genre=$3, price=$4, poster=$5, poster_id=$6,
         videos=$7, video_keys=$8, episode_prices=$9
       RETURNING *`,
      [
        id,
        title,
        genre || '',
        price || 0,
        poster || '',
        posterId || '',
        JSON.stringify(videos || []),
        JSON.stringify(videoKeys || []),
        JSON.stringify(episodePrices || {})
      ]
    );
    res.json({ ok: true, movie: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ═══════════════════════════════
   PUT /api/movies/:id  — tahrirlash (faqat admin)
═══════════════════════════════ */
app.put('/api/movies/:id', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { title, genre, price, poster, posterId, videos, videoKeys, episodePrices } = req.body;
    const { rows } = await pool.query(
      `UPDATE movies SET
         title=$1, genre=$2, price=$3, poster=$4, poster_id=$5,
         videos=$6, video_keys=$7, episode_prices=$8
       WHERE id=$9 RETURNING *`,
      [title, genre||'', price||0, poster||'', posterId||'',
       JSON.stringify(videos||[]), JSON.stringify(videoKeys||[]),
       JSON.stringify(episodePrices||{}), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Topilmadi' });
    res.json({ ok: true, movie: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ═══════════════════════════════
   DELETE /api/movies/:id  — o'chirish (faqat admin)
═══════════════════════════════ */
app.delete('/api/movies/:id', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    await pool.query('DELETE FROM movies WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ── Episode narxlarini yangilash ── */
app.patch('/api/movies/:id/episode-prices', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { episodePrices } = req.body;
    const { rows } = await pool.query(
      'UPDATE movies SET episode_prices=$1 WHERE id=$2 RETURNING *',
      [JSON.stringify(episodePrices), req.params.id]
    );
    res.json({ ok: true, movie: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ── Health check ── */
app.get('/health', (_, res) => res.json({ ok: true, time: new Date() }));

app.listen(PORT, () => console.log(`🎬 KinoDrama API: http://localhost:${PORT}`));
