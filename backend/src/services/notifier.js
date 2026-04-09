/**
 * Service de notification par email via Brevo (ex-Sendinblue).
 *
 * Fonctionnement :
 *   1. Lit les notifications PENDING (max BATCH_SIZE)
 *   2. Envoie chaque email via l'API transactionnelle Brevo
 *   3. Met à jour le statut (SENT / FAILED) + tentatives
 *   4. Log chaque résultat dans log_technique
 *
 * Variables d'environnement requises :
 *   BREVO_API_KEY       — clé API Brevo (v3)
 *   BREVO_SENDER_EMAIL  — adresse expéditeur vérifiée dans Brevo
 *   BREVO_SENDER_NAME   — nom affiché de l'expéditeur
 */

const Brevo = require('@getbrevo/brevo');
const pool   = require('../db');
const logger = require('../logger');

const BATCH_SIZE   = 20;
const MAX_RETRIES  = 3;

// ── Configuration client Brevo ──────────────────────────────────────────────
function getClient() {
  const client = new Brevo.TransactionalEmailsApi();
  client.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
  return client;
}

// ── Envoi d'un email via Brevo ──────────────────────────────────────────────
async function envoyerEmail(destinataire, sujet, corpsTexte) {
  const client = getClient();

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.sender  = {
    name:  process.env.BREVO_SENDER_NAME  || 'Unitee Veille',
    email: process.env.BREVO_SENDER_EMAIL || 'veille@unitee.com',
  };
  sendSmtpEmail.to      = [{ email: destinataire }];
  sendSmtpEmail.subject = sujet;
  sendSmtpEmail.htmlContent = corpsTexte
    .replace(/\n/g, '<br>')
    .replace(/^(.*)$/, '<div style="font-family:sans-serif;font-size:14px;color:#333">$1</div>');
  sendSmtpEmail.textContent = corpsTexte;

  const result = await client.sendTransacEmail(sendSmtpEmail);
  return result;
}

// ── Traitement du batch de notifications PENDING ────────────────────────────
async function traiterNotificationsPending() {
  if (!process.env.BREVO_API_KEY) {
    await logger.warn('notifier', 'BREVO_API_KEY non configurée — envoi désactivé');
    return { sent: 0, failed: 0, skipped: 0 };
  }

  // Récupérer les notifications en attente (pas trop de tentatives)
  const [pending] = await pool.query(`
    SELECT id, id_marche, destinataire, sujet, corps, tentatives
    FROM notification
    WHERE statut = 'PENDING' AND tentatives < ?
    ORDER BY cree_le ASC
    LIMIT ?
  `, [MAX_RETRIES, BATCH_SIZE]);

  const stats = { sent: 0, failed: 0, skipped: 0 };

  for (const notif of pending) {
    try {
      await envoyerEmail(notif.destinataire, notif.sujet, notif.corps || '');

      // Marquer comme envoyé
      await pool.query(`
        UPDATE notification
        SET statut = 'SENT', envoye_le = NOW(), tentatives = tentatives + 1
        WHERE id = ?
      `, [notif.id]);

      await logger.info('notifier', `Email envoyé — notification #${notif.id} → ${notif.destinataire}`);
      stats.sent++;

    } catch (err) {
      const tentatives = notif.tentatives + 1;
      const newStatut  = tentatives >= MAX_RETRIES ? 'FAILED' : 'PENDING';

      await pool.query(`
        UPDATE notification
        SET statut = ?, tentatives = ?
        WHERE id = ?
      `, [newStatut, tentatives, notif.id]);

      await logger.error('notifier',
        `Échec envoi notification #${notif.id} (tentative ${tentatives}/${MAX_RETRIES}) : ${err.message}`,
        err
      );
      stats.failed++;
    }
  }

  if (pending.length > 0) {
    await logger.info('notifier',
      `Batch terminé — ${stats.sent} envoyé(s), ${stats.failed} échoué(s) sur ${pending.length}`
    );
  }

  return stats;
}

module.exports = { traiterNotificationsPending, envoyerEmail };
