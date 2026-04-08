/**
 * Service de journalisation
 * - Écrit dans la table log_technique (BDD)
 * - Écrit dans la console si DEBUG=true dans .env ou si niveau >= ERROR
 *
 * Usage :
 *   const logger = require('./logger');
 *   logger.info('importer:boamp', 'Import démarré');
 *   logger.warn('importer:ted', 'Aucune annonce retournée');
 *   logger.error('importer:boamp', 'Erreur axios', err);
 *   logger.critical('cron', 'Connexion BDD perdue', err);
 */

const pool = require('./db');

const DEBUG = process.env.DEBUG === 'true';

// Couleurs console
const COLORS = {
  INFO:     '\x1b[36m',  // cyan
  WARNING:  '\x1b[33m',  // jaune
  ERROR:    '\x1b[31m',  // rouge
  CRITICAL: '\x1b[35m',  // magenta
  RESET:    '\x1b[0m',
};

/**
 * Écrit un log en BDD et, selon le niveau/mode, dans la console.
 * Ne lève jamais d'exception (éviter qu'un bug de log masque l'erreur originale).
 *
 * @param {'INFO'|'WARNING'|'ERROR'|'CRITICAL'} niveau
 * @param {string} source  - Composant émetteur, ex: 'importer:boamp'
 * @param {string} message
 * @param {Error|string|null} detail  - Stack trace ou info complémentaire
 */
async function log(niveau, source, message, detail = null) {
  // Récupère le détail textuel
  let detailStr = null;
  if (detail instanceof Error) {
    detailStr = detail.stack || detail.message;
  } else if (detail !== null && detail !== undefined) {
    try {
      detailStr = JSON.stringify(detail, null, 2);
    } catch {
      detailStr = String(detail);
    }
  }

  // Console : toujours pour ERROR/CRITICAL, sinon seulement en DEBUG
  if (DEBUG || niveau === 'ERROR' || niveau === 'CRITICAL') {
    const ts    = new Date().toISOString();
    const color = COLORS[niveau] || '';
    const line  = `${color}[${ts}] [${niveau}] [${source}] ${message}${COLORS.RESET}`;
    if (niveau === 'ERROR' || niveau === 'CRITICAL') {
      console.error(line);
      if (detailStr) console.error(detailStr);
    } else {
      console.log(line);
      if (detailStr && DEBUG) console.log(detailStr);
    }
  }

  // BDD — fire-and-forget avec catch silencieux pour ne pas boucler
  try {
    await pool.query(
      'INSERT INTO log_technique (niveau, source, message, detail) VALUES (?, ?, ?, ?)',
      [niveau, source, message.substring(0, 65535), detailStr]
    );
  } catch (dbErr) {
    // Fallback console si la BDD est indisponible
    console.error(`[LOGGER] Impossible d'écrire en BDD : ${dbErr.message}`);
  }
}

const logger = {
  info:     (source, message, detail) => log('INFO',     source, message, detail),
  warn:     (source, message, detail) => log('WARNING',  source, message, detail),
  error:    (source, message, detail) => log('ERROR',    source, message, detail),
  critical: (source, message, detail) => log('CRITICAL', source, message, detail),
};

module.exports = logger;
