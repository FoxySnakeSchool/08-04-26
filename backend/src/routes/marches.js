const express = require('express');
const router  = express.Router();
const pool    = require('../db');

/**
 * GET /api/marches?page=1&limit=20&priorite=eleve&departement=35&sort=score_pertinence&dir=desc
 * Liste paginée des marchés avec filtres et tri dynamique.
 */
router.get('/', async (req, res) => {
  const page     = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit    = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const offset   = (page - 1) * limit;
  const priorite      = req.query.priorite      || null;
  const departement   = req.query.departement   || null;
  const dateLimiteMin = req.query.dateLimiteMin || null;
  const masquerSansDate = req.query.masquerSansDate === '1';

  // Tri — whitelist pour éviter toute injection SQL
  const COLS_MAP = {
    titre:            'titre',
    acheteur:         'nom_acheteur',
    departement:      'departement',
    score_pertinence: 'score_pertinence',
    niveau_priorite:  'niveau_priorite',
    date_publication: 'date_publication',
    date_limite:      'date_limite',
  };
  const sortRaw = req.query.sort || 'score_pertinence';
  const sortKey = COLS_MAP[sortRaw] ?? 'score_pertinence';
  const sortDir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const sortExpr = `m.${sortKey}`;

  const conditions = [];
  const params     = [];

  if (priorite)    { conditions.push('m.niveau_priorite = ?');  params.push(priorite); }
  if (departement) { conditions.push('m.departement = ?');      params.push(departement); }
  if (dateLimiteMin) {
    if (masquerSansDate) {
      conditions.push('m.date_limite >= ?');
    } else {
      conditions.push('(m.date_limite >= ? OR m.date_limite IS NULL)');
    }
    params.push(dateLimiteMin);
  } else if (masquerSansDate) {
    conditions.push('m.date_limite IS NOT NULL');
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM marche m ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT m.id, m.titre, m.niveau_priorite, m.score_pertinence,
              m.date_publication, m.date_limite,
              m.departement, m.ville, m.lien_source, m.contact_email,
              m.etat, m.type_marche, m.nature_libelle, m.procedure_libelle,
              m.procedure_categorise, m.descripteur_code,
              m.nom_acheteur AS acheteur
       FROM marche m
       ${where}
       ORDER BY ${sortExpr} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ total, page, limit, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/marches/:id
 * Détail complet d'un marché + mots-clés associés.
 */
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const [[marche]] = await pool.query(
      `SELECT m.*, m.nom_acheteur AS acheteur
       FROM marche m
       WHERE m.id = ?`,
      [id]
    );

    if (!marche) return res.status(404).json({ error: 'Marché introuvable.' });

    const [mots] = await pool.query(
      `SELECT mk.terme, mmk.nb_occurrences, mk.poids
       FROM marche_mot_cle mmk JOIN mot_cle mk ON mk.id = mmk.id_mot_cle
       WHERE mmk.id_marche = ?
       ORDER BY mk.poids DESC, mmk.nb_occurrences DESC`,
      [id]
    );

    res.json({ ...marche, mots_cles: mots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
