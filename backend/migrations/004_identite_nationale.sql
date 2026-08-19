-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Identité nationale de la personne
--
-- PROBLÈME RÉSOLU
-- Le schéma initial liait un compte de connexion à UNE fiche `candidats`,
-- elle-même propre à un établissement. Un diplômé de deux établissements
-- (Licence à l'IAI, Master à l'Université de Lomé) produit deux fiches
-- `candidats` — mais son téléphone étant unique, il ne pouvait posséder
-- qu'un seul compte. Son portefeuille ne montrait donc jamais plus de la
-- moitié de ses diplômes, et la création du second compte échouait.
--
-- SOLUTION
-- On sépare la PERSONNE (identité nationale, unique) de ses INSCRIPTIONS
-- dans les établissements (fiches `candidats`, multiples) :
--
--   personnes ──< candidats ──< dossiers ──< diplomes
--       ↑
--   utilisateurs (compte de connexion)
--
-- Le portefeuille remonte alors tous les diplômes de la personne, quel
-- que soit l'établissement d'origine.
--
-- ⚠️ Migration avec REPRISE DE DONNÉES : les fiches existantes sont
--    regroupées par téléphone. Deux fiches partageant un numéro sont
--    considérées comme la même personne.
-- ═══════════════════════════════════════════════════════════════════

-- Rejouable : on défait d'abord un éventuel passage précédent.
ALTER TABLE utilisateurs DROP COLUMN IF EXISTS personne_id;
ALTER TABLE candidats    DROP COLUMN IF EXISTS personne_id;
DROP TABLE IF EXISTS personnes CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- personnes (identité, indépendante de tout établissement)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE personnes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom            VARCHAR(120) NOT NULL,
    prenom         VARCHAR(120) NOT NULL,
    date_naissance DATE,
    lieu_naissance VARCHAR(120),
    sexe           VARCHAR(1)   CHECK (sexe IN ('M', 'F')),
    -- Identifiant de connexion. NULL tant qu'aucun numéro n'est connu :
    -- un import Excel incomplet ne doit pas bloquer la saisie.
    telephone      VARCHAR(30)  UNIQUE,
    email          VARCHAR(180),
    date_creation  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_personnes_telephone ON personnes(telephone);
CREATE INDEX idx_personnes_nom ON personnes(nom, prenom);

-- ───────────────────────────────────────────────────────────────────
-- Rattachement des fiches étudiant à une personne
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE candidats ADD COLUMN personne_id UUID REFERENCES personnes(id) ON DELETE RESTRICT;

-- 1. Une personne par numéro de téléphone distinct. DISTINCT ON retient
--    la fiche la plus ancienne, considérée comme la plus fiable.
INSERT INTO personnes (nom, prenom, date_naissance, lieu_naissance, sexe, telephone, email)
SELECT DISTINCT ON (telephone)
       nom, prenom, date_naissance, lieu_naissance, sexe, telephone, email
  FROM candidats
 WHERE telephone IS NOT NULL
 ORDER BY telephone, date_creation;

UPDATE candidats c
   SET personne_id = p.id
  FROM personnes p
 WHERE c.telephone = p.telephone
   AND c.personne_id IS NULL;

-- 2. Les fiches sans téléphone ne peuvent pas être regroupées : chacune
--    devient une personne distincte. Un rapprochement manuel restera
--    possible plus tard, quand le numéro sera connu.
DO $$
DECLARE
    fiche    RECORD;
    nouvelle UUID;
BEGIN
    FOR fiche IN SELECT * FROM candidats WHERE personne_id IS NULL LOOP
        INSERT INTO personnes (nom, prenom, date_naissance, lieu_naissance, sexe, email)
        VALUES (fiche.nom, fiche.prenom, fiche.date_naissance,
                fiche.lieu_naissance, fiche.sexe, fiche.email)
        RETURNING id INTO nouvelle;

        UPDATE candidats SET personne_id = nouvelle WHERE id = fiche.id;
    END LOOP;
END $$;

ALTER TABLE candidats ALTER COLUMN personne_id SET NOT NULL;
CREATE INDEX idx_candidats_personne ON candidats(personne_id);

-- ───────────────────────────────────────────────────────────────────
-- Le compte de connexion pointe désormais la personne, plus la fiche
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE utilisateurs ADD COLUMN personne_id UUID REFERENCES personnes(id) ON DELETE SET NULL;

UPDATE utilisateurs u
   SET personne_id = c.personne_id
  FROM candidats c
 WHERE u.candidat_id = c.id;

-- La contrainte de cohérence rôle ↔ rattachement doit tomber avant la
-- colonne qu'elle référence.
ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS chk_role_rattachement;
ALTER TABLE utilisateurs DROP COLUMN IF EXISTS candidat_id;

ALTER TABLE utilisateurs ADD CONSTRAINT chk_role_rattachement CHECK (
    (role = 'etablissement' AND etablissement_id IS NOT NULL) OR
    (role = 'ministere'     AND ministere_id     IS NOT NULL) OR
    (role = 'candidat'      AND personne_id      IS NOT NULL) OR
    (role = 'admin_systeme')
);

CREATE INDEX idx_utilisateurs_personne ON utilisateurs(personne_id);

-- ───────────────────────────────────────────────────────────────────
-- Compte candidat créé dès la saisie, activé à la certification.
-- `utilisateurs.actif` porte déjà cette sémantique : un compte inactif
-- ne peut pas demander d'OTP (403 COMPTE_INACTIF).
-- ───────────────────────────────────────────────────────────────────
COMMENT ON COLUMN utilisateurs.actif IS
    'Pour un candidat : faux tant qu''aucun diplôme n''est certifié. La certification active le compte.';

COMMENT ON TABLE personnes IS
    'Identité nationale d''un diplômé, indépendante des établissements fréquentés.';
COMMENT ON COLUMN personnes.telephone IS
    'Identifiant de connexion. Peut changer ; l''UUID, lui, ne change jamais.';
COMMENT ON COLUMN candidats.personne_id IS
    'Une personne possède autant de fiches candidat que d''établissements fréquentés.';
