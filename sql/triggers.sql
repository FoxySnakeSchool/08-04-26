-- =============================================================================
-- TRIGGERS — Veille marchés publics unitee
-- MySQL 8+
-- =============================================================================
-- Récapitulatif des triggers :
--   1. trg_marche_before_insert    — validation et normalisation avant insertion
--   2. trg_marche_before_update    — contrôles avant modification
--   3. trg_marche_after_insert     — log technique de traçabilité
--   4. trg_marche_after_update     — log métier sur changement de score
--   5. trg_notification_after_insert — log technique à chaque alerte créée
--   6. trg_marche_after_insert_audit — audit de chaque insertion dans audit_marche
--
-- Note : niveau_priorite et hash_contenu étant des colonnes GENERATED ALWAYS,
--        elles ne peuvent pas être assignées dans un trigger (MySQL les gère seul).
-- =============================================================================

USE unitee_veille;

DELIMITER $$

-- =============================================================================
-- TRIGGER 1 : trg_marche_before_insert
-- Moment  : BEFORE INSERT sur marche
-- Rôle    : Validation et normalisation avant écriture :
--           - titre obligatoire et non vide
--           - date_limite ne peut pas être antérieure à date_publication
--           - normalisation casse département
-- =============================================================================
DROP TRIGGER IF EXISTS trg_marche_before_insert$$
CREATE TRIGGER trg_marche_before_insert
BEFORE INSERT ON marche
FOR EACH ROW
BEGIN
    -- Titre obligatoire
    IF NEW.titre IS NULL OR TRIM(NEW.titre) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Le titre du marché est obligatoire.';
    END IF;

    -- Date limite cohérente avec la date de publication
    IF NEW.date_limite IS NOT NULL
       AND NEW.date_limite < NEW.date_publication THEN
        SIGNAL SQLSTATE '45001'
            SET MESSAGE_TEXT = 'La date limite ne peut pas être antérieure à la date de publication.';
    END IF;

END$$


-- =============================================================================
-- TRIGGER 2 : trg_marche_before_update
-- Moment  : BEFORE UPDATE sur marche
-- Rôle    : Empêche la modification des champs immuables (id_externe).
-- =============================================================================
DROP TRIGGER IF EXISTS trg_marche_before_update$$
CREATE TRIGGER trg_marche_before_update
BEFORE UPDATE ON marche
FOR EACH ROW
BEGIN
    -- Champs immuables après insertion
    IF NEW.id_externe <> OLD.id_externe THEN
        SIGNAL SQLSTATE '45003'
            SET MESSAGE_TEXT = 'id_externe est immuable après insertion.';
    END IF;

END$$


-- =============================================================================
-- TRIGGER 3 : trg_marche_after_insert
-- Moment  : AFTER INSERT sur marche
-- Rôle    : Log technique de traçabilité pour chaque insertion.
--           Génère une notification de sécurité si score élevé et aucune
--           notification n'existe encore (cas insertion hors procédure stockée).
-- =============================================================================
DROP TRIGGER IF EXISTS trg_marche_after_insert$$
CREATE TRIGGER trg_marche_after_insert
AFTER INSERT ON marche
FOR EACH ROW
BEGIN
    -- Log technique de traçabilité
    INSERT INTO log_technique (niveau, source, message)
    VALUES (
        'INFO',
        'trigger:trg_marche_after_insert',
        CONCAT(
            'Marché inséré id=', NEW.id,
            ' | score=', NEW.score_pertinence
        )
    );

    -- Notification de sécurité si priorité élevée ET pas encore créée
    IF NEW.niveau_priorite = 'eleve' THEN
        IF NOT EXISTS (
            SELECT 1 FROM notification
            WHERE id_marche = NEW.id AND type = 'EMAIL'
        ) THEN
            INSERT INTO notification (
                id_marche, type, destinataire, sujet, corps, statut
            ) VALUES (
                NEW.id,
                'EMAIL',
                'veille@unitee.com',
                CONCAT('[ALERTE] Nouveau marché prioritaire : ', LEFT(NEW.titre, 100)),
                CONCAT(
                    'Titre : ', NEW.titre, '\n',
                    'Score : ', NEW.score_pertinence, '/100\n',
                    'Date limite : ', IFNULL(DATE(NEW.date_limite), 'NC')
                ),
                'PENDING'
            );
        END IF;
    END IF;
END$$


-- =============================================================================
-- TRIGGER 4 : trg_marche_after_update
-- Moment  : AFTER UPDATE sur marche
-- Rôle    : Historise chaque changement de score dans log_metier.
--           Génère une notification si le niveau passe à 'eleve'.
--           niveau_priorite étant GENERATED, il change automatiquement avec
--           score_pertinence — NEW.niveau_priorite reflète la valeur recalculée.
-- =============================================================================
DROP TRIGGER IF EXISTS trg_marche_after_update$$
CREATE TRIGGER trg_marche_after_update
AFTER UPDATE ON marche
FOR EACH ROW
BEGIN
    -- Log sur changement de score
    IF NEW.score_pertinence <> OLD.score_pertinence THEN
        INSERT INTO log_metier (
            id_marche, action, ancienne_valeur, nouvelle_valeur, operateur
        ) VALUES (
            NEW.id,
            'SCORE_UPDATE',
            CAST(OLD.score_pertinence AS CHAR),
            CAST(NEW.score_pertinence AS CHAR),
            'trigger:trg_marche_after_update'
        );
    END IF;

    -- Log + notification si passage à priorité élevée après requalification
    IF NEW.niveau_priorite <> OLD.niveau_priorite THEN
        INSERT INTO log_metier (
            id_marche, action, ancienne_valeur, nouvelle_valeur, operateur
        ) VALUES (
            NEW.id,
            'NIVEAU_CHANGE',
            OLD.niveau_priorite,
            NEW.niveau_priorite,
            'trigger:trg_marche_after_update'
        );

        IF NEW.niveau_priorite = 'eleve' AND OLD.niveau_priorite <> 'eleve' THEN
            INSERT INTO notification (
                id_marche, type, destinataire, sujet, corps, statut
            ) VALUES (
                NEW.id,
                'EMAIL',
                'veille@unitee.com',
                CONCAT('[REQUALIFICATION] Marché passé prioritaire : ', LEFT(NEW.titre, 100)),
                CONCAT(
                    'Titre : ', NEW.titre, '\n',
                    'Nouveau score : ', NEW.score_pertinence, '/100\n',
                    'Ancien niveau : ', OLD.niveau_priorite, '\n',
                    'Nouveau niveau : eleve'
                ),
                'PENDING'
            );
        END IF;
    END IF;
END$$


-- =============================================================================
-- TRIGGER 5 : trg_notification_after_insert
-- Moment  : AFTER INSERT sur notification
-- Rôle    : Log technique à chaque création d'alerte.
-- =============================================================================
DROP TRIGGER IF EXISTS trg_notification_after_insert$$
CREATE TRIGGER trg_notification_after_insert
AFTER INSERT ON notification
FOR EACH ROW
BEGIN
    INSERT INTO log_technique (niveau, source, message)
    VALUES (
        'INFO',
        'trigger:trg_notification_after_insert',
        CONCAT(
            'Notification créée id=', NEW.id,
            ' | marche_id=', NEW.id_marche,
            ' | type=', NEW.type,
            ' | destinataire=', NEW.destinataire
        )
    );
END$$


-- =============================================================================
-- TRIGGER 6 : trg_marche_after_insert_audit
-- Moment  : AFTER INSERT sur marche
-- Rôle    : Enregistre chaque insertion dans la table audit_marche.
-- Note    : MySQL autorise plusieurs AFTER INSERT triggers sur la même table
--           (depuis MySQL 5.7+ avec FOLLOWS).
-- =============================================================================
DROP TRIGGER IF EXISTS trg_marche_after_insert_audit$$
CREATE TRIGGER trg_marche_after_insert_audit
AFTER INSERT ON marche
FOR EACH ROW
FOLLOWS trg_marche_after_insert
BEGIN
    INSERT INTO audit_marche (
        id_marche, id_externe, etat, titre, nom_acheteur,
        departement, type_marche, score_pertinence,
        action, effectue_par
    ) VALUES (
        NEW.id, NEW.id_externe, NEW.etat, NEW.titre, NEW.nom_acheteur,
        NEW.departement, NEW.type_marche, NEW.score_pertinence,
        'INSERT', 'trigger:trg_marche_after_insert_audit'
    );
END$$


DELIMITER ;
