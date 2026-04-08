const express = require('express');
const router  = express.Router();
const pool    = require('../db');

/**
 * GET /api/dashboard/stats
 * KPIs globaux calculés en live depuis les tables existantes.
 */
router.get('/stats', async (req, res) => {
  try {
    // 1. Compteurs globaux
    const [[counts]] = await pool.query(`
      SELECT
        COUNT(*)                                                        AS total,
        SUM(niveau_priorite = 'eleve')                                  AS priorite_eleve,
        SUM(niveau_priorite = 'moyen')                                  AS priorite_moyen,
        SUM(niveau_priorite = 'faible')                                 AS priorite_faible,
        ROUND(AVG(score_pertinence), 1)                                 AS score_moyen,
        SUM(date_limite IS NOT NULL AND date_limite >= CURDATE()
            AND date_limite < DATE_ADD(CURDATE(), INTERVAL 7 DAY))      AS urgents_7j,
        SUM(date_limite IS NOT NULL AND date_limite < CURDATE())        AS expires,
        SUM(DATE(date_import) = CURDATE())                              AS importes_aujourdhui,
        SUM(date_import >= DATE_SUB(CURDATE(), INTERVAL 7 DAY))         AS importes_semaine,
        SUM(date_import >= DATE_SUB(CURDATE(), INTERVAL 30 DAY))        AS importes_mois
      FROM marche
    `);

    // 2. Répartition par type de marché
    const [parType] = await pool.query(`
      SELECT IFNULL(type_marche, 'Non renseigné') AS label, COUNT(*) AS value
      FROM marche GROUP BY type_marche ORDER BY value DESC
    `);

    // 3. Répartition par état
    const [parEtat] = await pool.query(`
      SELECT IFNULL(etat, 'Non renseigné') AS label, COUNT(*) AS value
      FROM marche GROUP BY etat ORDER BY value DESC
    `);

    // 4. Top 10 départements
    const [parDept] = await pool.query(`
      SELECT IFNULL(departement, '??') AS label, COUNT(*) AS value
      FROM marche GROUP BY departement ORDER BY value DESC LIMIT 10
    `);

    // 5. Distribution des scores (tranches de 10)
    const [distScores] = await pool.query(`
      SELECT
        CONCAT(tranche * 10, '-', tranche * 10 + 9) AS tranche,
        COUNT(*) AS value
      FROM (SELECT FLOOR(score_pertinence / 10) AS tranche FROM marche) t
      GROUP BY tranche
      ORDER BY tranche
    `);

    // 6. Évolution imports sur 30 derniers jours
    const [evolution] = await pool.query(`
      SELECT DATE_FORMAT(date_import, '%Y-%m-%d') AS jour, COUNT(*) AS nb
      FROM marche
      WHERE date_import >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE_FORMAT(date_import, '%Y-%m-%d')
      ORDER BY jour
    `);

    // 7. Top mots-clés (nombre de marchés associés)
    const [topMotsCles] = await pool.query(`
      SELECT mk.terme, mk.poids, COUNT(mmk.id_marche) AS nb_marches,
             SUM(mmk.nb_occurrences) AS total_occurrences
      FROM mot_cle mk
      LEFT JOIN marche_mot_cle mmk ON mmk.id_mot_cle = mk.id
      GROUP BY mk.id
      ORDER BY nb_marches DESC
      LIMIT 15
    `);

    // 8. Top 10 acheteurs
    const [topAcheteurs] = await pool.query(`
      SELECT IFNULL(nom_acheteur, 'Inconnu') AS label, COUNT(*) AS value
      FROM marche
      GROUP BY nom_acheteur
      ORDER BY value DESC
      LIMIT 10
    `);

    // 9. Dernières infos système
    const [[derniereErreur]] = await pool.query(`
      SELECT message, cree_le FROM log_technique
      WHERE niveau IN ('ERROR','CRITICAL')
      ORDER BY id DESC LIMIT 1
    `);
    const [[dernierImport]] = await pool.query(`
      SELECT message, cree_le FROM log_technique
      WHERE source LIKE '%import%' AND niveau = 'INFO'
      ORDER BY id DESC LIMIT 1
    `);

    res.json({
      counts,
      parType,
      parEtat,
      parDept,
      distScores,
      evolution,
      topMotsCles,
      topAcheteurs,
      systeme: {
        derniere_erreur: derniereErreur || null,
        dernier_import:  dernierImport  || null,
      },
    });
  } catch (err) {
    console.error('[DASHBOARD]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
