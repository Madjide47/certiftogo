-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — File d'attente d'ancrage blockchain (CDC chapitre 33)
--
-- PROBLÈME RÉSOLU
-- La certification était synchrone : une transaction blockchain par
-- diplôme, dans le cycle HTTP. Pour l'Université de Lomé et ses 12 000
-- diplômés, à ~4 secondes de confirmation par transaction, la requête
-- durerait 13 heures. C'est intenable.
--
-- MODÈLE RETENU
-- Le diplôme existe en base dès la décision du ministère, au statut
-- « en_attente_ancrage » ; un worker consomme la file au rythme du
-- réseau et le fait passer à « actif » une fois la transaction
-- confirmée. La certification unitaire, elle, reste synchrone : sur un
-- seul diplôme, attendre quatre secondes est acceptable et le résultat
-- immédiat est plus clair pour l'agent.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS file_attente_ancrage CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- Nouveau statut de diplôme : en attente d'ancrage
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE diplomes DROP CONSTRAINT IF EXISTS diplomes_statut_check;
ALTER TABLE diplomes ADD CONSTRAINT diplomes_statut_check
    CHECK (statut IN ('en_attente_ancrage', 'actif', 'revoque'));

COMMENT ON COLUMN diplomes.statut IS
    'en_attente_ancrage : officiel en base, pas encore confirmé on-chain. actif : ancré. revoque : révoqué.';

-- La vérification publique doit pouvoir répondre honnêtement « en cours
-- d'ancrage » plutôt que de faire passer pour prouvé ce qui ne l'est pas.
ALTER TABLE verifications_log DROP CONSTRAINT IF EXISTS verifications_log_resultat_check;
ALTER TABLE verifications_log ADD CONSTRAINT verifications_log_resultat_check
    CHECK (resultat IN ('authentique', 'introuvable', 'revoque', 'en_attente_ancrage'));

-- ───────────────────────────────────────────────────────────────────
-- file_attente_ancrage
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE file_attente_ancrage (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diplome_id       UUID NOT NULL REFERENCES diplomes(id) ON DELETE CASCADE,
    lot_id           UUID REFERENCES lots_transmission(id) ON DELETE SET NULL,
    operation        VARCHAR(20) NOT NULL CHECK (operation IN ('certification', 'revocation')),

    -- Tout ce qu'il faut pour rejouer l'opération sans relire le diplôme :
    -- le worker doit pouvoir travailler même si les données ont bougé.
    charge_utile     JSONB NOT NULL,

    -- L'idempotence est portée par la base, pas par le worker : deux
    -- tentatives d'enfilement de la même opération ne créent qu'une tâche.
    cle_idempotence  VARCHAR(160) NOT NULL UNIQUE,

    statut           VARCHAR(20) NOT NULL DEFAULT 'en_attente'
                     CHECK (statut IN ('en_attente', 'en_cours', 'confirmee', 'echouee', 'abandonnee')),
    -- Plus la valeur est basse, plus la tâche passe tôt.
    priorite         SMALLINT NOT NULL DEFAULT 5 CHECK (priorite BETWEEN 1 AND 9),
    tentatives       SMALLINT NOT NULL DEFAULT 0,
    max_tentatives   SMALLINT NOT NULL DEFAULT 5,
    derniere_erreur  TEXT,
    -- Report exponentiel : une panne réseau ne doit pas être martelée.
    prochaine_tentative TIMESTAMPTZ NOT NULL DEFAULT now(),
    transaction_hash VARCHAR(120),
    date_creation    TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_traitement  TIMESTAMPTZ
);

-- Index de consommation : le worker cherche les tâches dues, par priorité.
CREATE INDEX idx_file_a_traiter
    ON file_attente_ancrage (priorite, prochaine_tentative)
    WHERE statut IN ('en_attente', 'echouee');

CREATE INDEX idx_file_lot ON file_attente_ancrage(lot_id);
CREATE INDEX idx_file_diplome ON file_attente_ancrage(diplome_id);

COMMENT ON TABLE file_attente_ancrage IS
    'Travaux d''ancrage blockchain. Statut « abandonnee » = dead letter queue, après épuisement des tentatives.';
COMMENT ON COLUMN file_attente_ancrage.cle_idempotence IS
    'Empêche qu''un même diplôme soit ancré deux fois, quelle que soit la source de l''appel.';
