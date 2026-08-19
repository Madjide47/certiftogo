-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Transmission par lot (CDC chapitres 10.4, 12.6, 33)
--
-- PROBLÈME RÉSOLU
-- `promotions.statut = 'transmise'` ne créait aucun dossier : la promotion
-- changeait d'état et le ministère ne recevait rien. Les deux moitiés du
-- système ne se parlaient pas.
--
-- Par ailleurs le ministère instruisait dossier par dossier. Avec une
-- promotion de 250 diplômés — et jusqu'à 12 000 pour l'Université de
-- Lomé — c'est irréaliste : il faut une unité de transmission.
--
-- MODÈLE RETENU
-- Le lot est l'unité de transmission ET d'instruction ; le dossier reste
-- l'unité de décision. Un lot peut donc être « partiellement traité » :
-- 247 dossiers validés, 3 renvoyés à l'établissement avec leur motif.
-- Sans cela, trois anomalies sur 250 bloqueraient toute la promotion.
--
--   promotion ──> lot_transmission ──< dossiers ──< diplomes
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE dossiers DROP COLUMN IF EXISTS lot_id;
ALTER TABLE dossiers DROP COLUMN IF EXISTS promotion_id;
DROP TABLE IF EXISTS lots_transmission CASCADE;
ALTER TABLE promotions DROP COLUMN IF EXISTS date_deliberation;

-- ───────────────────────────────────────────────────────────────────
-- Date de délibération : c'est elle qui fait foi comme date d'obtention
-- des diplômes de la promotion.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE promotions ADD COLUMN date_deliberation DATE;

COMMENT ON COLUMN promotions.date_deliberation IS
    'Date du jury. Sert de date d''obtention aux dossiers générés à la transmission.';

-- ───────────────────────────────────────────────────────────────────
-- lots_transmission
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE lots_transmission (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference          VARCHAR(20) NOT NULL UNIQUE,   -- format LOT-AAAA-XXXXX
    promotion_id       UUID NOT NULL REFERENCES promotions(id)     ON DELETE RESTRICT,
    etablissement_id   UUID NOT NULL REFERENCES etablissements(id) ON DELETE RESTRICT,
    -- Traçabilité nominative : on sait toujours QUI a transmis, et qui a
    -- instruit. Ce n'est pas « l'établissement » qui agit, c'est un agent.
    agent_emetteur_id  UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    agent_ministere_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    effectif           INTEGER NOT NULL CHECK (effectif > 0),
    statut             VARCHAR(25) NOT NULL DEFAULT 'transmis'
                       CHECK (statut IN ('transmis', 'en_examen', 'valide',
                                         'partiellement_traite', 'rejete', 'certifie')),
    motif_rejet        TEXT,
    -- Rapport des contrôles automatiques, figé au moment de l'instruction.
    rapport_controles  JSONB,
    date_transmission  TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_traitement    TIMESTAMPTZ,
    CONSTRAINT chk_lot_rejet CHECK (statut <> 'rejete' OR motif_rejet IS NOT NULL)
);

CREATE INDEX idx_lots_statut ON lots_transmission(statut);
CREATE INDEX idx_lots_etablissement ON lots_transmission(etablissement_id);
CREATE INDEX idx_lots_promotion ON lots_transmission(promotion_id);

COMMENT ON TABLE lots_transmission IS
    'Envoi groupé d''une promotion au ministère. Unité de transmission et d''instruction ; le dossier reste l''unité de décision.';

-- ───────────────────────────────────────────────────────────────────
-- Rattachement des dossiers à leur lot et à leur promotion
-- ───────────────────────────────────────────────────────────────────
-- Nullable : les dossiers antérieurs à ce mécanisme, saisis un par un,
-- restent valides et sans lot.
ALTER TABLE dossiers ADD COLUMN lot_id       UUID REFERENCES lots_transmission(id) ON DELETE SET NULL;
ALTER TABLE dossiers ADD COLUMN promotion_id UUID REFERENCES promotions(id)        ON DELETE SET NULL;

CREATE INDEX idx_dossiers_lot ON dossiers(lot_id);
CREATE INDEX idx_dossiers_promotion ON dossiers(promotion_id);

COMMENT ON COLUMN dossiers.lot_id IS
    'Lot de transmission d''origine. NULL pour les dossiers saisis individuellement.';

-- Un même étudiant ne peut pas figurer deux fois dans le même lot.
CREATE UNIQUE INDEX idx_dossier_unique_par_lot
    ON dossiers (lot_id, candidat_id) WHERE lot_id IS NOT NULL;
