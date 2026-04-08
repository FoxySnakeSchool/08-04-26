-- =============================================================================
-- FONCTIONS SQL — Veille marchés publics unitee
-- MySQL 8+
-- =============================================================================

USE unitee_veille;

DELIMITER $$

-- =============================================================================
-- FONCTION 1 : fn_calculer_score
-- Rôle      : Calcule un score de pertinence (0-100) pour un marché donné
--             en croisant les mots-clés détectés (et leurs poids)
--             et la localisation.
-- Paramètre : p_id_marche INT UNSIGNED — identifiant du marché à scorer
-- Retour    : TINYINT UNSIGNED (0-100)
-- Hypothèses: La table marche_mot_cle est déjà alimentée avant l'appel.
-- Cas limites: Marché inexistant → retourne 0.
--              Score brut > 100 → plafonné à 100.
-- =============================================================================
DROP FUNCTION IF EXISTS fn_calculer_score$$
CREATE FUNCTION fn_calculer_score(p_id_marche INT UNSIGNED)
RETURNS TINYINT UNSIGNED
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_score_mots    INT DEFAULT 0;
    DECLARE v_score_final   INT DEFAULT 0;
    DECLARE v_existe        TINYINT DEFAULT 0;

    -- Vérifier que le marché existe
    SELECT COUNT(*) INTO v_existe
    FROM marche
    WHERE id = p_id_marche;

    IF v_existe = 0 THEN
        RETURN 0;
    END IF;

    -- -------------------------------------------------------------------------
    -- Composante 1 : mots-clés présents (max 90 points)
    -- Chaque mot-clé détecté contribue UNE SEULE FOIS à hauteur de son poids.
    -- nb_occurrences est ignoré dans le calcul (évite l'inflation par répétition).
    -- Score = SUM(poids) × 10, plafonné à 90.
    -- Exemple : 3 mots-clés de poids 3 → 9 × 10 = 90 pts → priorité élevée.
    -- -------------------------------------------------------------------------
    SELECT LEAST(
        COALESCE(SUM(mk.poids), 0) * 10,
        90
    ) INTO v_score_mots
    FROM marche_mot_cle mmk
    JOIN mot_cle mk ON mk.id = mmk.id_mot_cle
    WHERE mmk.id_marche = p_id_marche;

    -- -------------------------------------------------------------------------
    -- Composante 2 : localisation connue (10 points bonus)
    -- Un département renseigné indique un marché géographiquement exploitable.
    -- -------------------------------------------------------------------------
    SELECT v_score_mots +
        CASE
            WHEN departement IS NOT NULL THEN 10
            ELSE 0
        END
    INTO v_score_final
    FROM marche
    WHERE id = p_id_marche;

    RETURN v_score_final;
END$$


-- =============================================================================
-- FONCTION 2 : fn_interpreter_niveau
-- Rôle      : Convertit un score numérique (0-100) en libellé de priorité
--             métier utilisé dans la colonne marche.niveau_priorite.
-- Paramètre : p_score TINYINT UNSIGNED
-- Retour    : ENUM-compatible VARCHAR(10) : 'faible' | 'moyen' | 'eleve'
-- Hypothèses: Seuils définis avec la direction métier d'unitee.
-- Cas limites: Score NULL → 'faible'.
-- =============================================================================
DROP FUNCTION IF EXISTS fn_interpreter_niveau$$
CREATE FUNCTION fn_interpreter_niveau(p_score TINYINT UNSIGNED)
RETURNS VARCHAR(10)
NO SQL
DETERMINISTIC
BEGIN
    IF p_score IS NULL THEN
        RETURN 'faible';
    END IF;

    RETURN CASE
        WHEN p_score >= 60 THEN 'eleve'
        WHEN p_score >= 30 THEN 'moyen'
        ELSE 'faible'
    END;
END$$


-- =============================================================================
-- FONCTION 3 : fn_marche_expire
-- Rôle      : Indique si un marché est expiré (date limite dépassée).
--             Utilisée dans les procédures de purge et les triggers.
-- Paramètre : p_date_limite DATETIME
-- Retour    : TINYINT (1 = expiré, 0 = actif, -1 = date inconnue)
-- Cas limites: Date NULL → retourne -1 (indéterminé, pas de purge forcée).
-- =============================================================================
DROP FUNCTION IF EXISTS fn_marche_expire$$
CREATE FUNCTION fn_marche_expire(p_date_limite DATETIME)
RETURNS TINYINT
NO SQL
DETERMINISTIC
BEGIN
    IF p_date_limite IS NULL THEN
        RETURN -1;
    END IF;

    IF p_date_limite < NOW() THEN
        RETURN 1;
    END IF;

    RETURN 0;
END$$


DELIMITER ;

