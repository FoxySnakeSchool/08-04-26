const express = require('express');
const router  = express.Router();
const pool    = require('../db');

/**
 * GET /api/logs/technique?niveau=ERROR&limit=100&page=1
 */
router.get('/technique', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit  = Math.min(500, parseInt(req.query.limit, 10) || 100);
  const offset = (page - 1) * limit;
  const niveau = req.query.niveau || null;

  const where  = niveau ? 'WHERE niveau = ?' : '';
  const params = niveau ? [niveau] : [];

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM log_technique ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT id, niveau, source, message, detail, cree_le
       FROM log_technique ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ total, page, limit, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/logs/metier?id_marche=42&limit=50&page=1
 */
router.get('/metier', async (req, res) => {
  const page      = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit     = Math.min(500, parseInt(req.query.limit, 10) || 50);
  const offset    = (page - 1) * limit;
  const id_marche = parseInt(req.query.id_marche, 10) || null;

  const where  = id_marche ? 'WHERE lm.id_marche = ?' : '';
  const params = id_marche ? [id_marche] : [];

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM log_metier lm ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT lm.id, lm.id_marche, m.titre, lm.action,
              lm.ancienne_valeur, lm.nouvelle_valeur, lm.operateur, lm.cree_le
       FROM log_metier lm
       LEFT JOIN marche m ON m.id = lm.id_marche
       ${where}
       ORDER BY lm.cree_le DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ total, page, limit, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/logs/sauvegardes
 */
router.get('/sauvegardes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, statut, chemin_fichier, taille_octets,
              duree_secondes, message_erreur, cree_le
       FROM sauvegarde_log
       ORDER BY cree_le DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
