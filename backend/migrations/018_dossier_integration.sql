-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Dossier d'intégration d'un établissement
--
-- La demande d'intégration (migration 005) tenait en douze champs : un
-- nom, une ville, un responsable. C'était une manifestation d'intérêt,
-- pas un dossier d'agrément. Le ministère devait décider d'agréer un
-- établissement sur du DÉCLARATIF pur — rien ne prouvait qu'il existe
-- légalement, ni que la personne au bout du fil le représente.
--
-- Deux ajouts, et une seule idée : le formulaire porte les DONNÉES, les
-- pièces les PROUVENT.
--
--   1. L'identité complète de l'établissement (statut juridique, site,
--      représentant légal, responsable des certifications, contact
--      informatique). Saisie une fois, elle évite d'aller lire une
--      adresse au fond d'un PDF.
--
--   2. `pieces_demande` — les actes qui fondent la déclaration. Séparée
--      de `pieces_jointes` : celle-ci exige un `etablissement_id`, et un
--      demandeur n'en a pas — c'est précisément ce qu'il demande.
--
-- Le statut « brouillon » vient de là. Une demande naît incomplète : on
-- ne peut pas déposer huit fichiers dans la même requête que le
-- formulaire, et une demande arrivée sans ses actes ferait perdre son
-- tour à l'établissement. Elle n'entre dans la file du ministère qu'une
-- fois TRANSMISE, pièces obligatoires présentes.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- Identité de l'établissement demandeur
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE demandes_integration
    -- Public ou privé : commande les pièces exigibles (registre de
    -- commerce, attestation fiscale ne valent que pour le privé).
    ADD COLUMN IF NOT EXISTS statut_juridique VARCHAR(10)
        CHECK (statut_juridique IS NULL OR statut_juridique IN ('public', 'prive')),
    ADD COLUMN IF NOT EXISTS site_web VARCHAR(255),

    -- Le représentant légal ENGAGE l'établissement ; le responsable des
    -- certifications l'EXPLOITE au quotidien ; le contact informatique
    -- répond quand l'intégration technique casse. Trois rôles, souvent
    -- trois personnes — les confondre, c'est écrire au mauvais.
    ADD COLUMN IF NOT EXISTS representant_nom VARCHAR(120),
    ADD COLUMN IF NOT EXISTS representant_prenom VARCHAR(120),
    ADD COLUMN IF NOT EXISTS representant_fonction VARCHAR(120),
    ADD COLUMN IF NOT EXISTS representant_telephone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS representant_email VARCHAR(180),

    ADD COLUMN IF NOT EXISTS contact_technique_nom VARCHAR(120),
    ADD COLUMN IF NOT EXISTS contact_technique_telephone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS contact_technique_email VARCHAR(180),

    ADD COLUMN IF NOT EXISTS date_transmission TIMESTAMPTZ,

    -- Jeton de dépôt : rendu UNE fois, à la création, et exigé pour
    -- joindre une pièce ou transmettre.
    --
    -- La référence ne peut pas jouer ce rôle : « DI-2026-00042 » se
    -- devine à partir de « DI-2026-00041 ». Sans secret, n'importe qui
    -- joindrait des pièces au dossier d'un autre établissement, ou
    -- transmettrait à sa place un dossier incomplet.
    ADD COLUMN IF NOT EXISTS jeton_depot CHAR(64);

COMMENT ON COLUMN demandes_integration.responsable_nom IS
    'Responsable des certifications — recevra le premier compte de l''établissement.';

-- ───────────────────────────────────────────────────────────────────
-- Brouillon : une demande se constitue avant d'être déposée
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE demandes_integration
    DROP CONSTRAINT IF EXISTS demandes_integration_statut_check;

ALTER TABLE demandes_integration
    ADD CONSTRAINT demandes_integration_statut_check
    CHECK (statut IN ('brouillon', 'soumise', 'en_examen', 'acceptee', 'refusee'));

-- Les demandes déjà déposées gardent leur date de soumission comme date
-- de transmission : avant cette migration, les deux gestes n'en faisaient
-- qu'un.
UPDATE demandes_integration
   SET date_transmission = date_soumission
 WHERE date_transmission IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- pieces_demande — les actes joints à une demande
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pieces_demande (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- CASCADE : une demande supprimée emporte ses pièces, qui n'ont
    -- aucune existence propre.
    demande_id    UUID NOT NULL REFERENCES demandes_integration(id) ON DELETE CASCADE,

    type_piece    VARCHAR(40) NOT NULL
                  CHECK (type_piece IN ('lettre_demande', 'acte_creation', 'agrement',
                                        'registre_commerce', 'attestation_fiscale',
                                        'presentation', 'liste_formations',
                                        'piece_identite_representant', 'logo', 'autre')),
    libelle       VARCHAR(255),

    nom_fichier   VARCHAR(255) NOT NULL,
    -- Chemin relatif dans backend/stockage/ — jamais servi en statique.
    chemin        TEXT NOT NULL,
    type_mime     VARCHAR(120) NOT NULL,
    taille_octets INTEGER NOT NULL,
    -- SHA-256 recalculé à chaque lecture : une substitution sur le
    -- disque doit se voir.
    empreinte     CHAR(64) NOT NULL,

    date_depot    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pieces_demande_demande ON pieces_demande(demande_id);

-- Une pièce par type, sauf « autre » : redéposer un acte de création
-- REMPLACE le précédent, il n'en existe pas deux versions valides.
CREATE UNIQUE INDEX IF NOT EXISTS idx_piece_demande_unique
    ON pieces_demande (demande_id, type_piece)
    WHERE type_piece <> 'autre';

COMMENT ON TABLE pieces_demande IS
    'Actes justificatifs joints à une demande d''intégration, déposés sans compte.';
