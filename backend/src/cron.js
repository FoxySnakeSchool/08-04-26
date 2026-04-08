const cron   = require('node-cron');
const pool   = require('./db');
const logger = require('./logger');
const { importerBoamp } = require('./services/importer');
const { effectuerSauvegarde, purgerAnciennesSauvegardes } = require('./services/backup');

function demarrerCrons() {

  // // Import BOAMP - toutes les 15 minutes
  // cron.schedule('*/15 * * * *', async () => {
  //   await logger.info('cron', 'Import BOAMP declenche');
  //   try { await importerBoamp(); }
  //   catch (err) { await logger.error('cron:boamp', 'Erreur import BOAMP', err); }
  // });

  // // Import TED - toutes les 15 minutes
  // cron.schedule('*/15 * * * *', async () => {
  //   await logger.info('cron', 'Import TED declenche');
  //   try { await importerTed(); }
  //   catch (err) { await logger.error('cron:ted', 'Erreur import TED', err); }
  // });

  // // Sauvegarde quotidienne - 01h00
  // cron.schedule('0 1 * * *', async () => {
  //   await logger.info('cron', 'Sauvegarde quotidienne declenchee');
  //   try {
  //     await effectuerSauvegarde('FULL');
  //     purgerAnciennesSauvegardes();
  //   } catch (err) { await logger.error('cron:backup', 'Erreur sauvegarde', err); }
  // });

  // // Purge BDD hebdomadaire - dimanche 03h00
  // cron.schedule('0 3 * * 0', async () => {
  //   await logger.info('cron', 'Purge BDD declenchee');
  //   try {
  //     await pool.query('CALL sp_purge_anciens_marches(180, 90)');
  //     await logger.info('cron', 'Purge BDD terminee');
  //   } catch (err) {
  //     await logger.error('cron:purge', 'Erreur purge BDD', err);
  //   }
  // });

  logger.info('cron', 'Taches planifiees demarrees');
}

module.exports = { demarrerCrons };