-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Cas exceptionnels (CDC chapitre 29)
--
-- Quatre situations qui n'avaient aucune réponse :
--
--   ERR-003  un diplômé perd son téléphone — donc son seul moyen de
--            connexion. La procédure de changement de numéro suppose
--            l'ancien numéro accessible : ici il ne l'est pas.
--   ERR-004  un agent quitte son établissement en laissant des dossiers
--            en cours à son nom.
--   ERR-005  un établissement est suspendu : que deviennent ses
--            transmissions, ses dossiers, ses diplômes déjà certifiés ?
--   ERR-006  la clé de signature du ministère est compromise.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS demandes_recuperation CASCADE;
DROP TABLE IF EXISTS cles_signature CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- cles_signature — registre des clés du ministère (ERR-006)
--
-- On ne stocke JAMAIS la clé, seulement son empreinte : ce registre sert
-- à savoir quels diplômes ont été signés avec quelle clé, donc lesquels
-- sont à re-signer si l'une d'elles est compromise.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE cles_signature (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ministere_id    UUID REFERENCES ministeres(id) ON DELETE SET NULL,
    empreinte       CHAR(64) NOT NULL UNIQUE,
    algorithme      VARCHAR(40) NOT NULL DEFAULT 'HMAC-SHA256',
    -- Où la clé vit réellement. Le CDC exige qu'elle soit hors du serveur
    -- applicatif ; la colonne rend ce choix explicite et auditable.
    emplacement     VARCHAR(40) NOT NULL DEFAULT 'variable_environnement'
                    CHECK (emplacement IN ('variable_environnement', 'kms', 'hsm_logiciel',
                                           'hsm_materiel', 'cold_wallet_multisig')),
    statut          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (statut IN ('active', 'retiree', 'compromise')),
    motif_retrait   TEXT,
    diplomes_signes INTEGER NOT NULL DEFAULT 0,
    date_activation TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_retrait    TIMESTAMPTZ
);

-- Une seule clé active à la fois : deux clés valides simultanément
-- rendraient impossible de dire laquelle fait foi.
CREATE UNIQUE INDEX idx_cle_active ON cles_signature (statut) WHERE statut = 'active';

COMMENT ON TABLE cles_signature IS
    'Registre des clés de signature. Seule l''empreinte est stockée — jamais la clé.';
COMMENT ON COLUMN cles_signature.diplomes_signes IS
    'Compteur figé au retrait : dit combien de diplômes seraient à re-signer en cas de compromission.';

-- Rattachement d'un diplôme à la clé qui l'a signé.
ALTER TABLE diplomes ADD COLUMN IF NOT EXISTS cle_signature_id UUID
    REFERENCES cles_signature(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_diplomes_cle ON diplomes(cle_signature_id);

-- ───────────────────────────────────────────────────────────────────
-- demandes_recuperation — ERR-003
--
-- Le changement de numéro volontaire s'auto-vérifie : OTP sur l'ancien
-- puis sur le nouveau. La PERTE, elle, ne le permet pas — c'est
-- précisément l'ancien numéro qui a disparu. Il faut donc un tiers de
-- confiance : un agent de l'établissement d'origine, ou le ministère.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE demandes_recuperation (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference          VARCHAR(20) NOT NULL UNIQUE,   -- format REC-AAAA-XXXXX

    -- Éléments d'identification fournis par le demandeur. Ils ne prouvent
    -- rien à eux seuls : c'est l'agent qui tranche, pièce en main.
    telephone_ancien   VARCHAR(30),
    telephone_nouveau  VARCHAR(30) NOT NULL,
    nom                VARCHAR(120) NOT NULL,
    prenom             VARCHAR(120) NOT NULL,
    numero_etudiant    VARCHAR(60),
    date_naissance     DATE,
    reference_diplome  VARCHAR(20),

    personne_id        UUID REFERENCES personnes(id)     ON DELETE SET NULL,
    utilisateur_id     UUID REFERENCES utilisateurs(id)  ON DELETE SET NULL,
    etablissement_id   UUID REFERENCES etablissements(id) ON DELETE SET NULL,

    statut             VARCHAR(20) NOT NULL DEFAULT 'soumise'
                       CHECK (statut IN ('soumise', 'acceptee', 'refusee')),
    motif_refus        TEXT,
    piece_justificative TEXT,          -- référence du document présenté

    agent_validateur_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    agent_libelle      VARCHAR(255),

    date_demande       TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_decision      TIMESTAMPTZ,
    CONSTRAINT chk_recuperation_refus CHECK (statut <> 'refusee' OR motif_refus IS NOT NULL)
);

CREATE INDEX idx_recuperation_statut ON demandes_recuperation(statut);

COMMENT ON TABLE demandes_recuperation IS
    'Récupération d''accès après perte du téléphone. Validée par un agent : l''ancien numéro étant perdu, aucune vérification automatique n''est possible.';
