-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Cohérence promotion ↔ session académique
--
-- La migration 002 laissait passer une incohérence : `promotions` référence
-- une année ET une session par deux clés étrangères indépendantes. Rien
-- n'empêchait donc de rattacher une promotion de l'année 2024-2025 à une
-- session appartenant à l'année 2023-2024.
--
-- On remplace la clé étrangère simple sur `session_id` par une clé composite
-- (session_id, annee_id) : la session choisie doit appartenir à l'année de la
-- promotion. Une promotion sans session reste autorisée (session_id NULL —
-- une clé étrangère composite n'est pas contrôlée si l'une des colonnes est
-- nulle).
-- ═══════════════════════════════════════════════════════════════════

-- Cible d'une clé étrangère composite : le couple doit être unique.
ALTER TABLE sessions_academiques
    DROP CONSTRAINT IF EXISTS uq_sessions_id_annee;
ALTER TABLE sessions_academiques
    ADD CONSTRAINT uq_sessions_id_annee UNIQUE (id, annee_id);

-- L'ancienne clé étrangère simple (nommée automatiquement par PostgreSQL)
-- ne portait aucune garantie de cohérence : on la retire.
ALTER TABLE promotions
    DROP CONSTRAINT IF EXISTS promotions_session_id_fkey;

ALTER TABLE promotions
    DROP CONSTRAINT IF EXISTS fk_promotions_session_annee;
ALTER TABLE promotions
    ADD CONSTRAINT fk_promotions_session_annee
    FOREIGN KEY (session_id, annee_id)
    REFERENCES sessions_academiques (id, annee_id)
    -- RESTRICT et non SET NULL : la clé composite inclut annee_id, qui est
    -- NOT NULL — une mise à nul échouerait. Une session portant des
    -- promotions doit donc être vidée avant suppression.
    ON DELETE RESTRICT;
