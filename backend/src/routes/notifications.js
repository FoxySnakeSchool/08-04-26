const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { traiterNotificationsPending } = require('../services/notifier');

/**
 * GET /api/notifications
 * Liste les notifications avec filtres optionnels.
 *   ?statut=PENDING|SENT|FAILED  &limit=50  &offset=0
 */
router.get('/', async (req, res) => {
  try {
    const { statut, limit = 50, offset = 0 } = req.query;
    const params = [];
    let where = '';

    if (statut && ['PENDING', 'SENT', 'FAILED'].includes(statut)) {
      where = 'WHERE n.statut = ?';
      params.push(statut);
    }

    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(`
      SELECT n.*, m.titre AS marche_titre
      FROM notification n
      LEFT JOIN marche m ON m.id = n.id_marche
      ${where}
      ORDER BY n.cree_le DESC
      LIMIT ? OFFSET ?
    `, params);

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) AS total FROM notification n ${where}
    `, statut && ['PENDING', 'SENT', 'FAILED'].includes(statut) ? [statut] : []);

    res.json({ rows, total });
  } catch (err) {
    console.error('[NOTIFICATIONS]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/notifications/stats
 * Compteurs par statut.
 */
router.get('/stats', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT statut, COUNT(*) AS nb
      FROM notification
      GROUP BY statut
    `);
    const stats = { PENDING: 0, SENT: 0, FAILED: 0 };
    rows.forEach(r => { stats[r.statut] = r.nb; });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/notifications/send
 * Déclenche manuellement le traitement des notifications en attente.
 */
router.post('/send', async (req, res) => {
  try {
    const result = await traiterNotificationsPending();
    res.json(result);
  } catch (err) {
    console.error('[NOTIFICATIONS:SEND]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/notifications/:id/retry
 * Remet une notification FAILED en PENDING pour nouvelle tentative.
 */
router.post('/:id/retry', async (req, res) => {
  try {
    const [result] = await pool.query(`
      UPDATE notification SET statut = 'PENDING', tentatives = 0
      WHERE id = ? AND statut = 'FAILED'
    `, [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification non trouvée ou pas en échec.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
