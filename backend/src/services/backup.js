const { exec } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const pool      = require('../db');
const logger    = require('../logger');

const BACKUP_DIR            = process.env.BACKUP_DIR || './backups';
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30;

/**
 * Crée un dump complet mysqldump de unitee_veille.
 * Inclut les données + la structure (procédures, triggers, events).
 * Journalise le résultat dans sauvegarde_log.
 */
async function effectuerSauvegarde(type = 'FULL') {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `backup_${type.toLowerCase()}_${timestamp}.sql`;
  const filepath  = path.join(BACKUP_DIR, filename);
  const debut     = Date.now();

  const cmd = [
    'mysqldump',
    `--host=${process.env.DB_HOST}`,
    `--port=${process.env.DB_PORT || 3306}`,
    `--user=${process.env.DB_USER}`,
    `--password=${process.env.DB_PASSWORD}`,
    '--routines',     // procédures stockées + fonctions
    '--triggers',     // triggers
    '--events',       // event scheduler
    '--single-transaction',
    process.env.DB_NAME,
    `> "${filepath}"`,
  ].join(' ');

  return new Promise((resolve) => {
    exec(cmd, async (err) => {
      const duree  = Math.round((Date.now() - debut) / 1000);
      let taille   = null;

      if (!err && fs.existsSync(filepath)) {
        taille = fs.statSync(filepath).size;
      }

      const statut  = err ? 'ECHEC' : 'SUCCES';
      const message = err ? err.message : null;

      await pool.query(
        `INSERT INTO sauvegarde_log
         (type, statut, chemin_fichier, taille_octets, duree_secondes, message_erreur)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [type, statut, err ? null : filepath, taille, duree, message]
      );

      if (err) {
        await logger.error('backup', `Échec sauvegarde : ${err.message}`, err);
      } else {
        await logger.info('backup', `Sauvegarde OK — ${filename} (${duree}s, ${taille} octets)`);
      }

      resolve(!err);
    });
  });
}

/**
 * Supprime les fichiers de sauvegarde plus anciens que BACKUP_RETENTION_DAYS.
 */
function purgerAnciennesSauvegardes() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const limite = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files  = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql'));
  let suppr    = 0;

  for (const file of files) {
    const full = path.join(BACKUP_DIR, file);
    if (fs.statSync(full).mtimeMs < limite) {
      fs.unlinkSync(full);
      suppr++;
    }
  }

  if (suppr > 0) {
    logger.info('backup', `Rotation — ${suppr} fichier(s) supprimé(s)`);
  }
}

module.exports = { effectuerSauvegarde, purgerAnciennesSauvegardes };
