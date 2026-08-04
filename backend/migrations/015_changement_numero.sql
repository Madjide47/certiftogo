-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Changement volontaire de numéro (A-14)
--
-- À ne pas confondre avec la RÉCUPÉRATION (ERR-003, migration 013) :
--
--   RÉCUPÉRATION  le titulaire a PERDU l'accès à son numéro. Il ne peut
--                 rien prouver à distance ; un agent tranche en le voyant,
--                 pièce d'identité en main.
--   CHANGEMENT    le titulaire a ENCORE ses deux numéros. Il peut donc
--                 prouver qu'il détient l'ancien ET le nouveau, sans
--                 déranger personne.
--
-- D'où la double confirmation : un code sur l'ancien numéro établit que
-- le demandeur est bien le titulaire actuel ; un code sur le nouveau
-- établit que le numéro visé lui appartient réellement. Confirmer
-- seulement le nouveau permettrait à quiconque a volé une session de
-- déplacer le compte vers son propre téléphone. Confirmer seulement
-- l'ancien permettrait d'envoyer le compte vers un numéro saisi de
-- travers — et de le perdre définitivement.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS changements_numero CASCADE;

CREATE TABLE changements_numero (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id     UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,

    ancien_telephone   VARCHAR(30) NOT NULL,
    nouveau_telephone  VARCHAR(30) NOT NULL,

    statut             VARCHAR(25) NOT NULL DEFAULT 'ancien_a_confirmer'
                       CHECK (statut IN ('ancien_a_confirmer', 'nouveau_a_confirmer',
                                         'applique', 'abandonne')),

    -- Codes conservés en clair, comme `codes_otp` : même durée de vie de
    -- quelques minutes, même plafond de tentatives, même valeur pour un
    -- attaquant qui aurait déjà la base. Diverger ici n'apporterait
    -- qu'une fausse impression de sécurité — le vrai correctif, si on le
    -- veut un jour, est de hacher dans les DEUX tables.
    code_ancien        VARCHAR(10),
    code_nouveau       VARCHAR(10),
    tentatives         SMALLINT NOT NULL DEFAULT 0,

    date_expiration    TIMESTAMPTZ NOT NULL,
    date_creation      TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_confirmation_ancien TIMESTAMPTZ,
    date_application   TIMESTAMPTZ,

    -- Un changement appliqué doit dire quand il l'a été.
    CONSTRAINT chk_changement_applique
        CHECK (statut <> 'applique' OR date_application IS NOT NULL)
);

CREATE INDEX idx_changement_utilisateur ON changements_numero(utilisateur_id, statut);

-- Une seule demande en cours par compte : deux demandes concurrentes
-- laisseraient le titulaire ignorer vers quel numéro son compte part.
CREATE UNIQUE INDEX idx_changement_unique_en_cours
    ON changements_numero (utilisateur_id)
    WHERE statut IN ('ancien_a_confirmer', 'nouveau_a_confirmer');

COMMENT ON TABLE changements_numero IS
    'Changement volontaire de numéro à double confirmation (A-14). La récupération après perte est une autre procédure : demandes_recuperation.';
COMMENT ON COLUMN changements_numero.statut IS
    'ancien_a_confirmer → nouveau_a_confirmer → applique. Abandonné si expiré ou trop de tentatives.';
