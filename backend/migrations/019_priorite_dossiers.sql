-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Priorité de traitement des dossiers
--
-- PROBLÈME RÉSOLU
-- La file du ministère était strictement chronologique : un lot arrivé
-- lundi passait avant un lot arrivé mardi, sans exception. Or tous les
-- diplômés n'attendent pas la même chose. Celui qui doit produire son
-- diplôme pour une bourse, une inscription à l'étranger ou un concours
-- a une ÉCHÉANCE ; les autres non. Sans moyen de le dire, l'urgence se
-- réglait hors du système — un appel, un courrier — et ne laissait
-- aucune trace de qui avait fait passer qui devant.
--
-- MODÈLE RETENU
-- La priorité se déclare à deux endroits, parce qu'elle se découvre à
-- deux moments :
--
--   INSCRIPTION  l'établissement connaît la situation de son étudiant
--                AVANT de transmettre. À ce stade le dossier n'existe
--                pas encore — seule l'inscription porte l'étudiant.
--   DOSSIER      le ministère peut promouvoir un dossier déjà reçu,
--                sur demande de l'intéressé ou de l'établissement.
--
-- La transmission recopie la priorité de l'inscription sur le dossier
-- qu'elle engendre : ce que l'établissement a déclaré ne se perd pas.
--
-- Un MOTIF est exigé dans les deux cas. Une urgence sans raison écrite
-- n'est pas une urgence, c'est un passe-droit : c'est précisément ce
-- que le journal doit pouvoir rendre.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- Priorité déclarée par l'établissement, avant transmission
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE inscriptions
    ADD COLUMN IF NOT EXISTS priorite      VARCHAR(10) NOT NULL DEFAULT 'normale'
                             CHECK (priorite IN ('normale', 'urgente')),
    ADD COLUMN IF NOT EXISTS motif_urgence TEXT,
    ADD COLUMN IF NOT EXISTS date_echeance DATE;

ALTER TABLE inscriptions DROP CONSTRAINT IF EXISTS chk_inscription_urgence;
ALTER TABLE inscriptions
    ADD CONSTRAINT chk_inscription_urgence
    CHECK (priorite <> 'urgente' OR motif_urgence IS NOT NULL);

COMMENT ON COLUMN inscriptions.priorite IS
    'Urgence déclarée par l''établissement ; recopiée sur le dossier à la transmission.';
COMMENT ON COLUMN inscriptions.date_echeance IS
    'Date avant laquelle le diplômé a besoin de son diplôme. Sert à ordonner les urgences entre elles.';

-- ───────────────────────────────────────────────────────────────────
-- Priorité portée par le dossier, seule visible du ministère
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE dossiers
    ADD COLUMN IF NOT EXISTS priorite                VARCHAR(10) NOT NULL DEFAULT 'normale'
                             CHECK (priorite IN ('normale', 'urgente')),
    ADD COLUMN IF NOT EXISTS motif_urgence           TEXT,
    ADD COLUMN IF NOT EXISTS date_echeance           DATE,
    ADD COLUMN IF NOT EXISTS priorite_definie_par_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS date_priorite           TIMESTAMPTZ;

ALTER TABLE dossiers DROP CONSTRAINT IF EXISTS chk_dossier_urgence;
ALTER TABLE dossiers
    ADD CONSTRAINT chk_dossier_urgence
    CHECK (priorite <> 'urgente' OR motif_urgence IS NOT NULL);

COMMENT ON COLUMN dossiers.priorite IS
    'normale par défaut. « urgente » remonte le dossier en tête de la file d''instruction.';
COMMENT ON COLUMN dossiers.motif_urgence IS
    'Raison écrite de l''urgence. Obligatoire : une priorité sans motif est un passe-droit.';
COMMENT ON COLUMN dossiers.priorite_definie_par_id IS
    'Qui a déclaré l''urgence — agent d''établissement ou agent du ministère.';

-- Index partiel : les urgents sont une minorité, l'index ne porte
-- que sur eux et reste petit même à 12 000 dossiers par promotion.
CREATE INDEX IF NOT EXISTS idx_dossiers_urgents
    ON dossiers (date_echeance NULLS LAST, date_transmission)
    WHERE priorite = 'urgente';

-- Le tri courant de la file : les dossiers encore à statuer, urgents
-- d'abord. Sans cet index, chaque ouverture de lot trierait à la volée.
CREATE INDEX IF NOT EXISTS idx_dossiers_lot_priorite
    ON dossiers (lot_id, priorite, date_echeance NULLS LAST);

-- ───────────────────────────────────────────────────────────────────
-- Permission interne à l'établissement
--
-- Déclarer une urgence, c'est faire passer un étudiant devant les
-- autres : ce n'est pas de la saisie, c'est un arbitrage. L'agent de
-- saisie enregistre des faits, le chef de scolarité et le directeur
-- engagent l'établissement — ce sont eux qui priorisent.
-- ───────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, domaine, libelle) VALUES
    ('dossier.prioriser', 'dossiers', 'Déclarer un dossier urgent')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles_permissions (role, sous_role, permission_code)
SELECT 'etablissement', sous_role, 'dossier.prioriser'
  FROM (VALUES ('chef_scolarite'), ('directeur')) AS r(sous_role)
ON CONFLICT DO NOTHING;
