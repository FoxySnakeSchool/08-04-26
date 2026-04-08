const express = require('express');
const pool    = require('../db');
const { importerBoamp } = require('../services/importer');

const router = express.Router();

// ── GET /api/admin/mots-cles ─────────────────────────────────────────────────
router.get('/mots-cles', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, terme, poids FROM mot_cle ORDER BY poids DESC, terme ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/mots-cles ────────────────────────────────────────────────
router.post('/mots-cles', async (req, res) => {
  const { terme, poids } = req.body;
  if (!terme || typeof terme !== 'string' || terme.trim() === '') {
    return res.status(400).json({ error: 'terme obligatoire.' });
  }
  const p = Math.min(5, Math.max(1, parseInt(poids) || 1));
  try {
    const [result] = await pool.query(
      'INSERT INTO mot_cle (terme, poids) VALUES (?, ?)',
      [terme.trim().toLowerCase(), p]
    );
    res.status(201).json({ id: result.insertId, terme: terme.trim().toLowerCase(), poids: p });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce mot-clé existe déjà.' });
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/mots-cles/:id ──────────────────────────────────────────
router.patch('/mots-cles/:id', async (req, res) => {
  const id   = parseInt(req.params.id);
  const { terme, poids } = req.body;
  if (!id) return res.status(400).json({ error: 'id invalide.' });

  const fields = [];
  const vals   = [];
  if (terme !== undefined) { fields.push('terme = ?'); vals.push(terme.trim().toLowerCase()); }
  if (poids !== undefined) { fields.push('poids = ?'); vals.push(Math.min(5, Math.max(1, parseInt(poids) || 1))); }
  if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier.' });

  vals.push(id);
  try {
    await pool.query(`UPDATE mot_cle SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [[row]] = await pool.query('SELECT id, terme, poids FROM mot_cle WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Mot-clé introuvable.' });
    res.json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce mot-clé existe déjà.' });
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/mots-cles/:id ─────────────────────────────────────────
router.delete('/mots-cles/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide.' });
  try {
    const [result] = await pool.query('DELETE FROM mot_cle WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Mot-clé introuvable.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/import ───────────────────────────────────────────────────
router.post('/import', async (req, res) => {
  try {
    await importerBoamp();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── POST /api/admin/import/historique ────────────────────────────────
router.post('/import/historique', async (req, res) => {
  const { depuis, jusqu } = req.body;
  if (!depuis || !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) {
    return res.status(400).json({ error: 'depuis (YYYY-MM-DD) obligatoire.' });
  }
  if (jusqu && !/^\d{4}-\d{2}-\d{2}$/.test(jusqu)) {
    return res.status(400).json({ error: 'jusqu doit être au format YYYY-MM-DD.' });
  }
  try {
    await importerBoamp({ depuis, jusqu: jusqu || null });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
