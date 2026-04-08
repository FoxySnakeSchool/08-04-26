-- =============================================================================
-- PROCÉDURES STOCKÉES — Veille marchés publics unitee
-- MySQL 8+
-- =============================================================================

USE unitee_veille;

DELIMITER $$

-- =============================================================================
-- PROCÉDURE 1 : sp_inserer_marche
-- Rôle      : Intègre un marché unique dans la base avec :
--               - déduplication (clé composite source_nom+id_externe + hash GENERATED)
--               - calcul du score de pertinence (fn_calculer_score)
--               - journalisation métier
--               - génération de notification si marché prioritaire élevé
-- Paramètres: (voir ci-dessous)
-- Retour    : p_resultat OUT VARCHAR(50) → 'INSERE' | 'DOUBLON' | 'ERREUR'
--             p_id_marche OUT INT UNSIGNED → id inséré ou existant
--
-- Note : niveau_priorite et hash_contenu sont des colonnes GENERATED ALWAYS —
--        elles ne peuvent pas être passées à INSERT, MySQL les calcule seul.
-- =============================================================================
DROP PROCEDURE IF EXISTS sp_inserer_marche$$
CREATE PROCEDURE sp_inserer_marche(
    IN  p_id_externe         VARCHAR(100),
    IN  p_etat               VARCHAR(20),
    IN  p_titre              VARCHAR(255),
    IN  p_description        LONGTEXT,
    IN  p_nom_acheteur       VARCHAR(255),
    IN  p_ville              VARCHAR(100),
    IN  p_departement        CHAR(3),
    IN  p_contact_email      VARCHAR(255),
    IN  p_type_marche        VARCHAR(50),
    IN  p_nature_libelle     VARCHAR(100),
    IN  p_procedure_libelle  VARCHAR(100),
    IN  p_procedure_categorise VARCHAR(50),
    IN  p_descripteur_code   JSON,
    IN  p_date_publication   DATETIME,
    IN  p_date_limite        DATETIME,
    IN  p_lien_source        TEXT,
    OUT p_resultat           VARCHAR(50),
    OUT p_id_marche          INT UNSIGNED
)
sp_inserer_marche: BEGIN
    DECLARE v_score     TINYINT UNSIGNED DEFAULT 0;
    DECLARE v_err_msg   TEXT;

    -- Gestionnaire d'erreurs : rollback + log en cas d'exception SQL
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 v_err_msg = MESSAGE_TEXT;
        ROLLBACK;
        INSERT INTO log_technique (niveau, source, message, detail)
            VALUES ('ERROR', 'sp_inserer_marche',
                    CONCAT('Erreur insertion marché id_externe=', IFNULL(p_id_externe, 'NULL')),
                    v_err_msg);
        SET p_resultat  = 'ERREUR';
        SET p_id_marche = NULL;
    END;

    START TRANSACTION;

    -- -------------------------------------------------------------------------
    -- 1. Vérifier le doublon par identifiant externe
    -- -------------------------------------------------------------------------
    SELECT id INTO p_id_marche
    FROM marche
    WHERE id_externe = p_id_externe
    LIMIT 1;

    IF p_id_marche IS NOT NULL THEN
        ROLLBACK;
        SET p_resultat = 'DOUBLON';
        LEAVE sp_inserer_marche;
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Vérifier le doublon sémantique par hash (GENERATED ALWAYS STORED)
    --    On recalcule la valeur attendue pour faire le lookup sans insérer.
    -- -------------------------------------------------------------------------
    SELECT id INTO p_id_marche
    FROM marche
    WHERE hash_contenu = SHA2(
        CONCAT(
            LOWER(TRIM(p_titre)), '|',
            LOWER(TRIM(IFNULL(p_nom_acheteur, ''))), '|',
            DATE(p_date_publication)
        ), 256
    )
    LIMIT 1;

    IF p_id_marche IS NOT NULL THEN
        ROLLBACK;
        SET p_resultat = 'DOUBLON';
        LEAVE sp_inserer_marche;
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. Insérer le marché (score = 0 provisoire, mis à jour après scoring)
    --    niveau_priorite et hash_contenu sont GENERATED — pas dans le INSERT.
    -- -------------------------------------------------------------------------
    INSERT INTO marche (
        id_externe, etat, titre, description,
        nom_acheteur, ville, departement, contact_email,
        type_marche, nature_libelle, procedure_libelle, procedure_categorise, descripteur_code,
        date_publication, date_limite, lien_source,
        score_pertinence
    ) VALUES (
        p_id_externe, p_etat, p_titre, p_description,
        p_nom_acheteur, p_ville, p_departement, p_contact_email,
        p_type_marche, p_nature_libelle, p_procedure_libelle, p_procedure_categorise, p_descripteur_code,
        p_date_publication, p_date_limite, p_lien_source,
        0
    );

    SET p_id_marche = LAST_INSERT_ID();

    -- -------------------------------------------------------------------------
    -- 4. Calculer et appliquer le score de pertinence
    --    (fn_calculer_score interroge marche_mot_cle — les mots-clés doivent
    --     avoir été insérés dans marche_mot_cle AVANT cet appel via le backend)
    -- -------------------------------------------------------------------------
    SET v_score = fn_calculer_score(p_id_marche);

    UPDATE marche
    SET score_pertinence = v_score
    WHERE id = p_id_marche;

    -- Après l'UPDATE, niveau_priorite (GENERATED) reflète le nouveau score.

    -- -------------------------------------------------------------------------
    -- 5. Log métier : insertion réussie
    -- -------------------------------------------------------------------------
    INSERT INTO log_metier (id_marche, action, nouvelle_valeur, operateur)
    VALUES (
        p_id_marche,
        'INSERTION',
        CONCAT('score=', v_score),
        'sp_inserer_marche'
    );

    -- -------------------------------------------------------------------------
    -- 6. Notification si priorité élevée (score >= 60)
    -- -------------------------------------------------------------------------
    IF v_score >= 60 THEN
        INSERT INTO notification (
            id_marche, type, destinataire, sujet, corps, statut
        ) VALUES (
            p_id_marche,
            'EMAIL',
            'veille@unitee.com',
            CONCAT('[ALERTE] Nouveau marché prioritaire : ', LEFT(p_titre, 100)),
            CONCAT(
                'Titre : ', p_titre, '\n',
                'Score : ', v_score, '/100\n',
                'Date limite : ', IFNULL(DATE(p_date_limite), 'NC'), '\n',
                'Lien : ', IFNULL(p_lien_source, 'NC')
            ),
            'PENDING'
        );
    END IF;

    COMMIT;
    SET p_resultat = 'INSERE';
END sp_inserer_marche$$


-- =============================================================================
-- PROCÉDURE 2 : sp_purge_anciens_marches
-- Rôle      : Purge les marchés expirés depuis plus de N jours et les logs
--             techniques de plus de M jours.
--             Conserve une trace dans log_technique avant suppression.
-- Paramètres: p_jours_marche INT — délai rétention marchés expirés (défaut 180)
--             p_jours_log    INT — délai rétention logs techniques (défaut 90)
-- =============================================================================
DROP PROCEDURE IF EXISTS sp_purge_anciens_marches$$
CREATE PROCEDURE sp_purge_anciens_marches(
    IN p_jours_marche   INT,
    IN p_jours_log      INT
)
BEGIN
    DECLARE v_nb_marches_suppr  INT DEFAULT 0;
    DECLARE v_nb_logs_suppr     INT DEFAULT 0;
    DECLARE v_err_msg           TEXT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 v_err_msg = MESSAGE_TEXT;
        ROLLBACK;
        INSERT INTO log_technique (niveau, source, message, detail)
        VALUES ('ERROR', 'sp_purge_anciens_marches', 'Erreur lors de la purge', v_err_msg);
    END;

    -- Valeurs par défaut si NULL
    IF p_jours_marche IS NULL THEN SET p_jours_marche = 180; END IF;
    IF p_jours_log    IS NULL THEN SET p_jours_log    = 90;  END IF;

    START TRANSACTION;

    -- Compter avant suppression (traçabilité)
    SELECT COUNT(*) INTO v_nb_marches_suppr
    FROM marche
    WHERE statut = 'EXPIRED'
      AND date_limite < DATE_SUB(NOW(), INTERVAL p_jours_marche DAY);

    -- Supprimer (les FK ON DELETE CASCADE nettoient log_metier, notification, marche_mot_cle)
    DELETE FROM marche
    WHERE statut = 'EXPIRED'
      AND date_limite < DATE_SUB(NOW(), INTERVAL p_jours_marche DAY);

    -- Purge des logs techniques anciens
    SELECT COUNT(*) INTO v_nb_logs_suppr
    FROM log_technique
    WHERE cree_le < DATE_SUB(NOW(), INTERVAL p_jours_log DAY);

    DELETE FROM log_technique
    WHERE cree_le < DATE_SUB(NOW(), INTERVAL p_jours_log DAY);

    COMMIT;

    INSERT INTO log_technique (niveau, source, message)
    VALUES (
        'INFO', 'sp_purge_anciens_marches',
        CONCAT(
            'Purge effectuée — marchés supprimés: ', v_nb_marches_suppr,
            ' | logs supprimés: ', v_nb_logs_suppr
        )
    );
END$$


DELIMITER ;


-- =============================================================================
-- EVENT SCHEDULER — Automatisation des traitements récurrents
-- Active l'Event Scheduler MySQL si ce n'est pas déjà fait (requiert SUPER).
-- =============================================================================
SET GLOBAL event_scheduler = ON;

-- Purge hebdomadaire chaque dimanche à 03h00
CREATE EVENT IF NOT EXISTS evt_purge_hebdo
    ON SCHEDULE EVERY 1 WEEK
    STARTS (TIMESTAMP(CURDATE() + INTERVAL (7 - DAYOFWEEK(CURDATE())) DAY) + INTERVAL 3 HOUR)
    DO CALL sp_purge_anciens_marches(180, 90);

