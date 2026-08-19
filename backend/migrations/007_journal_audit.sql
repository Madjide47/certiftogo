-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Journalisation et audit (CDC chapitre 21)
--
-- PROBLÈME RÉSOLU
-- La table `journal_audit` existait depuis la Phase 1 mais AUCUN code ne
-- l'alimentait : zéro écriture dans tout `backend/src/`. Un système
-- national doit pouvoir répondre à « qui a fait quoi », et il ne le
-- pouvait pas.
--
-- Son format était par ailleurs insuffisant : ni valeurs avant/après, ni
-- rôle, ni user-agent, ni résultat, ni corrélation blockchain.
--
-- Trois apports :
--   1. le format complet exigé par le CDC ;
--   2. l'historique des changements de statut d'un dossier, qui mérite
--      sa propre table — c'est la pièce la plus consultée en cas de
--      litige sur un diplôme ;
--   3. une corbeille : toute suppression devient réversible.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS corbeille CASCADE;
DROP TABLE IF EXISTS historique_statuts_dossier CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- journal_audit — format complet
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS role             VARCHAR(20);
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS valeurs_avant    JSONB;
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS valeurs_apres    JSONB;
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS user_agent       TEXT;
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS resultat         VARCHAR(10) DEFAULT 'succes';
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS message          TEXT;
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS transaction_hash VARCHAR(120);
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id) ON DELETE SET NULL;

ALTER TABLE journal_audit DROP CONSTRAINT IF EXISTS chk_journal_resultat;
ALTER TABLE journal_audit ADD CONSTRAINT chk_journal_resultat
    CHECK (resultat IN ('succes', 'echec'));

-- L'auteur peut disparaître (compte supprimé) ; la trace, jamais. On
-- conserve donc son identité en clair à côté de la clé étrangère.
ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS auteur_libelle VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_journal_action ON journal_audit(action);
CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_audit(date_action DESC);
CREATE INDEX IF NOT EXISTS idx_journal_etablissement ON journal_audit(etablissement_id);

COMMENT ON TABLE journal_audit IS
    'Piste d''audit : qui a fait quoi, quand, depuis où, avec quel résultat.';
COMMENT ON COLUMN journal_audit.auteur_libelle IS
    'Identité de l''auteur figée au moment de l''action : la trace survit à la suppression du compte.';
COMMENT ON COLUMN journal_audit.transaction_hash IS
    'Corrélation avec l''ancrage blockchain, quand l''action en a produit un.';

-- ───────────────────────────────────────────────────────────────────
-- historique_statuts_dossier
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE historique_statuts_dossier (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dossier_id     UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    statut_avant   VARCHAR(20),
    statut_apres   VARCHAR(20) NOT NULL,
    utilisateur_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    auteur_libelle VARCHAR(255),
    motif          TEXT,
    lot_id         UUID REFERENCES lots_transmission(id) ON DELETE SET NULL,
    date_changement TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historique_dossier ON historique_statuts_dossier(dossier_id, date_changement);

COMMENT ON TABLE historique_statuts_dossier IS
    'Chronologie complète d''un dossier. Pièce la plus consultée en cas de litige sur un diplôme.';

-- ───────────────────────────────────────────────────────────────────
-- corbeille — suppression réversible
--
-- Plutôt qu'un `supprime_le` sur chacune des vingt tables — qui obligerait
-- à filtrer TOUTES les lectures existantes — la ligne supprimée est
-- recopiée ici en JSON. La restauration la réinsère telle quelle.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE corbeille (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_source    VARCHAR(60) NOT NULL,
    enregistrement_id UUID      NOT NULL,
    donnees         JSONB       NOT NULL,
    libelle         VARCHAR(255),               -- de quoi reconnaître la ligne
    supprime_par    UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    auteur_libelle  VARCHAR(255),
    etablissement_id UUID REFERENCES etablissements(id) ON DELETE SET NULL,
    motif           TEXT,
    restaure        BOOLEAN     NOT NULL DEFAULT FALSE,
    date_suppression TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_restauration TIMESTAMPTZ
);

CREATE INDEX idx_corbeille_table ON corbeille(table_source, restaure);
CREATE INDEX idx_corbeille_etablissement ON corbeille(etablissement_id);

COMMENT ON TABLE corbeille IS
    'Lignes supprimées, conservées en JSON pour permettre une restauration.';
