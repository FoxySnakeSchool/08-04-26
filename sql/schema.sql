-- =============================================================================
-- VEILLE AUTOMATISÉE DES MARCHÉS PUBLICS — unitee
-- Schéma de base de données MySQL 8+
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+01:00';

CREATE DATABASE IF NOT EXISTS unitee_veille
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE unitee_veille;


-- =============================================================================
-- TABLES DE RÉFÉRENTIEL
-- =============================================================================

-- ----------------------------------------------------------------------------
-- mot_cle : référentiel des mots-clés métier
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mot_cle (
    id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    terme         VARCHAR(100)     NOT NULL,
    poids         TINYINT UNSIGNED NOT NULL DEFAULT 1  COMMENT 'Poids dans le calcul du score (1-5)',
    PRIMARY KEY (id),
    UNIQUE KEY uq_mot_cle_terme (terme),
    INDEX idx_mot_cle_poids (poids)
) ENGINE=InnoDB;


-- =============================================================================
-- TABLE CENTRALE : marche
-- =============================================================================

-- ----------------------------------------------------------------------------
-- marche : annonces de marchés publics centralisées
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marche (
    id                  INT UNSIGNED     NOT NULL AUTO_INCREMENT,

    -- Identification externe
    id_externe          VARCHAR(100)     NOT NULL  COMMENT 'Identifiant BOAMP',
    etat                VARCHAR(20)      COMMENT 'INITIAL | RECTIFICATIF | ANNULATION | MODIFICATION',

    -- Contenu
    titre               VARCHAR(255)     NOT NULL,
    description         LONGTEXT,

    -- Acheteur
    nom_acheteur        VARCHAR(255)     NULL,
    ville               VARCHAR(100),
    departement         CHAR(3),
    contact_email       VARCHAR(255),

    -- Qualification du marché
    type_marche          VARCHAR(50)      COMMENT 'TRAVAUX | FOURNITURES | SERVICES',
    nature_libelle       VARCHAR(100)     COMMENT 'Ex: Avis de marché, MAPA…',
    procedure_libelle    VARCHAR(100)     COMMENT 'Ex: Procédure ouverte, négociée…',
    procedure_categorise VARCHAR(50)      COMMENT 'OUVERT | PROCEDURE_ADAPTE | NEGOCIE | RESTREINT',
    descripteur_code     JSON             COMMENT 'Codes CPV BOAMP, ex: ["33","274"]',

    -- Dates
    date_publication    DATETIME         NOT NULL,
    date_limite         DATETIME,
    date_import         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    lien_source         TEXT,

    -- Qualification
    -- score_pertinence est calculé par sp_inserer_marche via fn_calculer_score
    score_pertinence    TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Score 0-100',

    -- Colonne calculée : dérivée automatiquement de score_pertinence
    niveau_priorite     VARCHAR(10) GENERATED ALWAYS AS (
        CASE
            WHEN score_pertinence >= 60 THEN 'eleve'
            WHEN score_pertinence >= 30 THEN 'moyen'
            ELSE 'faible'
        END
    ) STORED,

    -- Colonne calculée : SHA-256 du titre+acheteur+date pour déduplication sémantique
    hash_contenu        CHAR(64)    GENERATED ALWAYS AS (
        SHA2(
            CONCAT(
                LOWER(TRIM(titre)), '|',
                LOWER(TRIM(IFNULL(nom_acheteur, ''))), '|',
                DATE(date_publication)
            ), 256
        )
    ) STORED,

    mis_a_jour_le       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    -- Anti-doublon par identifiant BOAMP
    UNIQUE KEY uq_marche_externe (id_externe),

    -- Anti-doublon sémantique (même marché relayé par plusieurs sources)
    UNIQUE KEY uq_marche_hash (hash_contenu),

    INDEX idx_marche_date_pub    (date_publication),
    INDEX idx_marche_date_limite (date_limite),
    INDEX idx_marche_score       (score_pertinence),
    INDEX idx_marche_priorite    (niveau_priorite),
    INDEX idx_marche_departement (departement),
    INDEX idx_marche_etat        (etat),
    FULLTEXT idx_ft_marche_titre (titre),
    FULLTEXT idx_ft_marche_desc  (description)
) ENGINE=InnoDB;


-- ----------------------------------------------------------------------------
-- marche_mot_cle : relation N:N entre marchés et mots-clés détectés
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marche_mot_cle (
    id_marche       INT UNSIGNED     NOT NULL,
    id_mot_cle      INT UNSIGNED     NOT NULL,
    nb_occurrences  TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (id_marche, id_mot_cle),
    CONSTRAINT fk_mmk_marche
        FOREIGN KEY (id_marche)  REFERENCES marche(id)  ON DELETE CASCADE,
    CONSTRAINT fk_mmk_mot_cle
        FOREIGN KEY (id_mot_cle) REFERENCES mot_cle(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- =============================================================================
-- TABLES TECHNIQUES : logs, notifications, sauvegardes
-- =============================================================================

-- ----------------------------------------------------------------------------
-- log_technique : erreurs, appels API, imports (supervision système)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_technique (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    niveau          ENUM('INFO','WARNING','ERROR','CRITICAL') NOT NULL DEFAULT 'INFO',
    source          VARCHAR(100)     COMMENT 'Composant émetteur (cron_import, proc_insert…)',
    message         TEXT             NOT NULL,
    detail          LONGTEXT         COMMENT 'Stack trace ou payload brut',
    cree_le         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_log_tech_niveau (niveau),
    INDEX idx_log_tech_date   (cree_le),
    INDEX idx_log_tech_source (source)
) ENGINE=InnoDB;


-- ----------------------------------------------------------------------------
-- log_metier : qualifications, actions utilisateur
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_metier (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    id_marche       INT UNSIGNED     NOT NULL,
    action          VARCHAR(100)     NOT NULL  COMMENT 'Ex: INSERTION, SCORE_UPDATE',
    ancienne_valeur TEXT,
    nouvelle_valeur TEXT,
    operateur       VARCHAR(100)     COMMENT 'Utilisateur ou procédure',
    cree_le         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_log_metier_marche
        FOREIGN KEY (id_marche) REFERENCES marche(id) ON DELETE CASCADE,
    INDEX idx_log_metier_marche (id_marche),
    INDEX idx_log_metier_date   (cree_le),
    INDEX idx_log_metier_action (action)
) ENGINE=InnoDB;


-- ----------------------------------------------------------------------------
-- notification : alertes générées pour les marchés à haute priorité
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification (
    id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    id_marche       INT UNSIGNED     NOT NULL,
    type            ENUM('EMAIL','WEBHOOK','SMS') NOT NULL DEFAULT 'EMAIL',
    destinataire    VARCHAR(255)     NOT NULL,
    sujet           VARCHAR(255),
    corps           TEXT,
    statut          ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
    tentatives      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    envoye_le       DATETIME,
    cree_le         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_notif_marche
        FOREIGN KEY (id_marche) REFERENCES marche(id) ON DELETE CASCADE,
    INDEX idx_notif_statut (statut),
    INDEX idx_notif_marche (id_marche),
    INDEX idx_notif_date   (cree_le)
) ENGINE=InnoDB;


-- ----------------------------------------------------------------------------
-- sauvegarde_log : journal des sauvegardes (succès et échecs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sauvegarde_log (
    id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    type            ENUM('FULL','INCREMENTAL','STRUCTURE') NOT NULL DEFAULT 'FULL',
    statut          ENUM('SUCCES','ECHEC')                 NOT NULL,
    chemin_fichier  VARCHAR(500),
    taille_octets   BIGINT UNSIGNED,
    duree_secondes  SMALLINT UNSIGNED,
    message_erreur  TEXT,
    cree_le         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_sauvegarde_date   (cree_le),
    INDEX idx_sauvegarde_statut (statut)
) ENGINE=InnoDB;


-- =============================================================================
-- DONNÉES DE RÉFÉRENCE INITIALES
-- =============================================================================

INSERT IGNORE INTO mot_cle (terme, poids) VALUES
    ('modulaire',              5),
    ('préfabriqué',            5),
    ('bâtiment kit',           5),
    ('assemblage rapide',      5),
    ('base vie',               4),
    ('structure démontable',   4),
    ('classe temporaire',      4),
    ('extension rapide',       4),
    ('construction hors-site', 3),
    ('bâtiment provisoire',    3),
    ('chantier',               2),
    ('hébergement temporaire', 2);

