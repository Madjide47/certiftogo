-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Versionnement des diplômes (CDC §13.5, ERR-001, ERR-002)
--
-- PROBLÈME RÉSOLU
-- Deux cas réels n'avaient aucune réponse :
--
--   • une diplômée se marie et change de nom — son diplôme porte encore
--     l'ancien ;
--   • une erreur est découverte après certification (mention « Bien »
--     alors que le jury avait prononcé « Très Bien »).
--
-- On ne peut pas modifier les données : le hash ancré on-chain ne
-- correspondrait plus, et c'est précisément ce que la blockchain sert à
-- empêcher. La seule réponse honnête est de produire une NOUVELLE
-- VERSION et de marquer l'ancienne comme remplacée.
--
-- DISTINCTION IMPORTANTE
-- « remplacé » n'est pas « révoqué ». Un diplôme révoqué a été retiré à
-- son titulaire — fraude, annulation. Un diplôme remplacé reste
-- légitime : c'est sa forme qui a changé. Confondre les deux ferait
-- passer une mariée pour une fraudeuse.
--
-- LIMITE ASSUMÉE DU CONTRAT
-- `RegistreDiplomes` ne connaît que certifier() et revoquer(). Un
-- remplacement se traduit donc on-chain par : révocation de l'ancien
-- hash + certification du nouveau. Le LIEN entre les deux versions vit
-- hors chaîne, dans `corrections_diplome`.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS corrections_diplome CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- Chaînage des versions
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE diplomes ADD COLUMN IF NOT EXISTS version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE diplomes ADD COLUMN IF NOT EXISTS diplome_precedent_id UUID
    REFERENCES diplomes(id) ON DELETE SET NULL;
ALTER TABLE diplomes ADD COLUMN IF NOT EXISTS motif_version TEXT;

ALTER TABLE diplomes DROP CONSTRAINT IF EXISTS diplomes_statut_check;
ALTER TABLE diplomes ADD CONSTRAINT diplomes_statut_check
    CHECK (statut IN ('en_attente_ancrage', 'actif', 'revoque', 'remplace'));

CREATE INDEX IF NOT EXISTS idx_diplomes_precedent ON diplomes(diplome_precedent_id);

COMMENT ON COLUMN diplomes.version IS
    'Numéro de version. La v1 est l''émission d''origine ; chaque correction incrémente.';
COMMENT ON COLUMN diplomes.diplome_precedent_id IS
    'Version remplacée. Permet de remonter toute la chaîne depuis n''importe quelle version.';

-- La vérification publique doit distinguer « remplacé » de « révoqué » :
-- un employeur qui scanne un ancien PDF doit être renvoyé vers la version
-- en vigueur, pas alerté d'une fraude.
ALTER TABLE verifications_log DROP CONSTRAINT IF EXISTS verifications_log_resultat_check;
ALTER TABLE verifications_log ADD CONSTRAINT verifications_log_resultat_check
    CHECK (resultat IN ('authentique', 'introuvable', 'revoque', 'en_attente_ancrage', 'remplace'));

-- ───────────────────────────────────────────────────────────────────
-- corrections_diplome — la trace de ce qui a changé, et pourquoi
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE corrections_diplome (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diplome_origine_id    UUID NOT NULL REFERENCES diplomes(id) ON DELETE RESTRICT,
    diplome_remplacant_id UUID REFERENCES diplomes(id) ON DELETE SET NULL,

    type                  VARCHAR(30) NOT NULL
                          CHECK (type IN ('changement_nom', 'erreur_donnees', 'autre')),
    motif                 TEXT NOT NULL,

    -- Ce qui a réellement changé, champ par champ. C'est la pièce qu'on
    -- présente en cas de contestation.
    valeurs_avant         JSONB NOT NULL,
    valeurs_apres         JSONB NOT NULL,

    demandeur_id          UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    demandeur_libelle     VARCHAR(255),

    hash_avant            VARCHAR(64),
    hash_apres            VARCHAR(64),
    transaction_revocation VARCHAR(120),
    transaction_emission   VARCHAR(120),

    date_correction       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_corrections_origine ON corrections_diplome(diplome_origine_id);

COMMENT ON TABLE corrections_diplome IS
    'Historique des corrections. Le lien entre versions vit ici : le contrat, lui, ne connaît que certifier et revoquer.';
