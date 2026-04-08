const axios  = require('axios');
const pool   = require('../db');
const logger = require('../logger');

const BOAMP_API = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';

/**
 * Charge les mots-clés depuis la BDD — source de vérité unique.
 * Retourne un tableau de { id, terme } triés par poids décroissant.
 */
async function chargerMotsCles() {
  const [rows] = await pool.query('SELECT id, terme FROM mot_cle ORDER BY poids DESC');
  return rows;
}

/**
 * Insère un marché via sp_inserer_marche et retourne le résultat.
 * La procédure gère la déduplication, le scoring, les logs et les notifications.
 */
async function insererMarche(conn, data) {
  await conn.query(
    `CALL sp_inserer_marche(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,@res,@id)`,
    [
      data.id_externe, data.etat, data.titre,
      data.description, data.nom_acheteur,
      data.ville, data.departement, data.contact_email,
      data.type_marche, data.nature_libelle, data.procedure_libelle, data.procedure_categorise,
      JSON.stringify(data.descripteur_code || []),
      data.date_publication, data.date_limite,
      data.lien_source,
    ]
  );
  const [[row]] = await conn.query('SELECT @res AS resultat, @id AS id_marche');
  return row || { resultat: 'ERREUR', id_marche: null };
}

async function detecterMotsCles(texte, motsCles) {
  if (!texte || motsCles.length === 0) return [];
  const found = [];
  for (const { id, terme } of motsCles) {
    const regex = new RegExp(terme, 'gi');
    const matches = (texte.match(regex) || []).length;
    if (matches > 0) found.push({ id_mot_cle: id, nb_occurrences: matches });
  }
  return found;
}

/**
 * Après une insertion réussie :
 *  1. Détecte les mots-clés dans titre + description
 *  2. Insère les correspondances dans marche_mot_cle
 *  3. Recalcule le score via fn_calculer_score et met à jour marche
 */
async function appliquerMotsCles(conn, idMarche, titre, description, motsCles) {
  const texte = [titre, description].filter(Boolean).join(' ');
  const mots  = await detecterMotsCles(texte, motsCles);

  if (mots.length > 0) {
    const values = mots.map(m => [idMarche, m.id_mot_cle, m.nb_occurrences]);
    await conn.query(
      'INSERT INTO marche_mot_cle (id_marche, id_mot_cle, nb_occurrences) VALUES ?' +
      ' ON DUPLICATE KEY UPDATE nb_occurrences = VALUES(nb_occurrences)',
      [values]
    );
  }

  // Recalcule le score (maintenant que marche_mot_cle est alimenté)
  const [[{ score }]] = await conn.query(
    'SELECT fn_calculer_score(?) AS score', [idMarche]
  );
  await conn.query(
    'UPDATE marche SET score_pertinence = ? WHERE id = ?',
    [score, idMarche]
  );
}

/**
 * Importe les annonces BOAMP filtrées sur les mots-clés métier.
 * @param {object} opts
 * @param {string} [opts.depuis]  Date ISO (YYYY-MM-DD), défaut = aujourd'hui
 * @param {string} [opts.jusqu]  Date ISO (YYYY-MM-DD), défaut = aucune limite
 */
async function importerBoamp(opts = {}) {
  const depuis = opts.depuis || new Date().toISOString().split('T')[0];
  const jusqu  = opts.jusqu  || null;
  const label  = jusqu ? `${depuis} → ${jusqu}` : `depuis ${depuis}`;
  await logger.info('importer:boamp', `Démarrage import BOAMP (${label})`);
  let conn;
  try {
    const motsCles = await chargerMotsCles();

    if (motsCles.length === 0) {
      await logger.warn('importer:boamp', 'Aucun mot-clé en BDD — import annulé');
      return;
    }

    const termesWhere = motsCles
      .map(m => `objet LIKE "%${m.terme}%"`)
      .join(' OR ');

    let dateWhere = `dateparution >= date'${depuis}'`;
    if (jusqu) dateWhere += ` AND dateparution <= date'${jusqu}'`;
    const whereClause = `${dateWhere} AND (${termesWhere})`;

    // Pagination : l'API limite à 100 résultats par appel
    let offset = 0;
    const PAGE = 100;
    let totalPages = 1; // sera ajusté après le premier appel
    let inseres = 0, doublons = 0, erreurs = 0;
    conn = await pool.getConnection();

    do {
      const response = await axios.get(BOAMP_API, {
        params: {
          where:  whereClause,
          refine: 'nature_categorise_libelle:Avis de marché',
          limit:  PAGE,
          offset,
          lang:   'fr',
        },
        timeout: 15000,
      });

      const total_count = response.data?.total_count ?? 0;
      totalPages = Math.ceil(total_count / PAGE);
      const annonces = response.data?.results || [];

      if (annonces.length === 0) break;

      for (const a of annonces) {
        try {
          const titre = (a.objet || '').substring(0, 255);

          // Extraire les champs enrichis depuis le JSON 'donnees'
          let description = null, ville = null, contactEmail = null;
          if (a.donnees) {
            try {
              const d = JSON.parse(a.donnees);
              description  = d.OBJET?.OBJET_COMPLET || null;
              ville        = d.IDENTITE?.VILLE       || null;
              contactEmail = d.IDENTITE?.MEL         || null;
            } catch { /* donnees mal formé : on ignore */ }
          }

          const departement          = a.code_departement?.[0]  || null;
          const typeMarche           = a.type_marche?.[0]       || null;
          const natureLibelle        = a.nature_libelle         || null;
          const procLibelle          = a.procedure_libelle      || null;
          const procCategorise       = a.procedure_categorise   || null;
          const descripteurCode      = Array.isArray(a.descripteur_code) ? a.descripteur_code : [];

          const { resultat, id_marche } = await insererMarche(conn, {
            id_externe:           a.idweb,
            etat:                 a.etat              || null,
            titre,
            description,
            nom_acheteur:         a.nomacheteur       || null,
            ville,
            departement,
            contact_email:        contactEmail,
            type_marche:          typeMarche,
            nature_libelle:       natureLibelle,
            procedure_libelle:    procLibelle,
            procedure_categorise: procCategorise,
            descripteur_code:     descripteurCode,
            date_publication:  a.dateparution      ? new Date(a.dateparution)      : new Date(),
            date_limite:       a.datelimitereponse ? new Date(a.datelimitereponse) : null,
            lien_source:       a.url_avis || null,
          });
          if (resultat === 'INSERE') {
            inseres++;
            await appliquerMotsCles(conn, id_marche, titre, description, motsCles);
          } else if (resultat === 'DOUBLON') doublons++;
          else erreurs++;
        } catch (rowErr) {
          erreurs++;
          await logger.error('importer:boamp', `Erreur insertion annonce BOAMP : ${rowErr.message}`, rowErr);
        }
      }

      offset += PAGE;
    } while (offset / PAGE < totalPages);

    if (inseres + doublons + erreurs === 0) {
      await logger.info('importer:boamp', 'Aucune annonce BOAMP retournée par l\'API');
    }
    await logger.info('importer:boamp', `Import terminé — insérés:${inseres} doublons:${doublons} erreurs:${erreurs}`);
  } catch (err) {
    const detail = err.response
      ? { status: err.response.status, url: err.config?.url, params: err.config?.params, responseBody: err.response.data }
      : err;
    await logger.error('importer:boamp', `Erreur fatale import BOAMP : ${err.message}`, detail);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { importerBoamp };
