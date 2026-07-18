-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Schéma initial de la base de données (Phase 1)
-- PostgreSQL 13+ (utilise gen_random_uuid() natif, aucune extension requise)
--
-- Convention : tables et colonnes en snake_case, pluriel pour les tables.
-- Les énumérations métier sont gérées par des contraintes CHECK (simples à
-- faire évoluer par rapport à des types ENUM natifs).
-- ═══════════════════════════════════════════════════════════════════

-- On repart d'un schéma propre (utile en développement).
DROP TABLE IF EXISTS journal_audit          CASCADE;
DROP TABLE IF EXISTS verifications_log       CASCADE;
DROP TABLE IF EXISTS transactions_blockchain CASCADE;
DROP TABLE IF EXISTS diplomes                CASCADE;
DROP TABLE IF EXISTS dossiers                CASCADE;
DROP TABLE IF EXISTS codes_otp               CASCADE;
DROP TABLE IF EXISTS utilisateurs            CASCADE;
DROP TABLE IF EXISTS candidats               CASCADE;
DROP TABLE IF EXISTS ministeres              CASCADE;
DROP TABLE IF EXISTS etablissements          CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- etablissements
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE etablissements (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom           VARCHAR(255) NOT NULL,
    type          VARCHAR(20)  NOT NULL CHECK (type IN ('institut', 'universite', 'ecole', 'lycee')),
    ville         VARCHAR(120) NOT NULL,
    email         VARCHAR(180),
    telephone     VARCHAR(30),
    adresse       TEXT,
    statut        VARCHAR(20)  NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'suspendu', 'archive')),
    date_creation TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────
-- ministeres (autorité de certification — 1 seul pour le MVP)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE ministeres (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom                VARCHAR(255) NOT NULL,
    cle_publique       TEXT,            -- généré en Phase 4 (crypto)
    cle_privee_chiffree TEXT,           -- généré en Phase 4 (crypto)
    email              VARCHAR(180),
    telephone          VARCHAR(30),
    date_creation      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────
-- candidats
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE candidats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_etudiant VARCHAR(60)  NOT NULL,
    nom             VARCHAR(120) NOT NULL,
    prenom          VARCHAR(120) NOT NULL,
    date_naissance  DATE,
    lieu_naissance  VARCHAR(120),
    sexe            VARCHAR(1)   CHECK (sexe IN ('M', 'F')),
    telephone       VARCHAR(30),
    email           VARCHAR(180),
    etablissement_id UUID        NOT NULL REFERENCES etablissements(id) ON DELETE RESTRICT,
    date_creation   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (etablissement_id, numero_etudiant)
);

-- ───────────────────────────────────────────────────────────────────
-- utilisateurs (comptes de la plateforme, authentifiés par OTP)
-- Un utilisateur est rattaché à AU PLUS une entité selon son rôle.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE utilisateurs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom             VARCHAR(120) NOT NULL,
    prenom          VARCHAR(120) NOT NULL,
    telephone       VARCHAR(30)  NOT NULL UNIQUE,
    role            VARCHAR(20)  NOT NULL CHECK (role IN ('etablissement', 'ministere', 'candidat', 'admin_systeme')),
    etablissement_id UUID        REFERENCES etablissements(id) ON DELETE SET NULL,
    ministere_id    UUID         REFERENCES ministeres(id)     ON DELETE SET NULL,
    candidat_id     UUID         REFERENCES candidats(id)      ON DELETE SET NULL,
    actif           BOOLEAN      NOT NULL DEFAULT TRUE,
    date_creation   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Cohérence : le bon FK doit être renseigné selon le rôle.
    CONSTRAINT chk_role_rattachement CHECK (
        (role = 'etablissement' AND etablissement_id IS NOT NULL) OR
        (role = 'ministere'     AND ministere_id     IS NOT NULL) OR
        (role = 'candidat'      AND candidat_id      IS NOT NULL) OR
        (role = 'admin_systeme')
    )
);

CREATE INDEX idx_utilisateurs_telephone ON utilisateurs(telephone);

-- ───────────────────────────────────────────────────────────────────
-- codes_otp
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE codes_otp (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id  UUID        NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    code            VARCHAR(6)  NOT NULL,
    telephone       VARCHAR(30) NOT NULL,
    utilise         BOOLEAN     NOT NULL DEFAULT FALSE,
    date_expiration TIMESTAMPTZ NOT NULL,
    date_creation   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_codes_otp_telephone ON codes_otp(telephone);
CREATE INDEX idx_codes_otp_utilisateur ON codes_otp(utilisateur_id);

-- ───────────────────────────────────────────────────────────────────
-- dossiers (candidature de diplôme saisie par un établissement)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE dossiers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference             VARCHAR(20) NOT NULL UNIQUE,   -- format CT-AAAA-XXXXX
    etablissement_id      UUID NOT NULL REFERENCES etablissements(id) ON DELETE RESTRICT,
    candidat_id           UUID NOT NULL REFERENCES candidats(id)      ON DELETE RESTRICT,
    filiere               VARCHAR(180),
    parcours              VARCHAR(180),
    mention               VARCHAR(20) CHECK (mention IN ('passable', 'assez_bien', 'bien', 'tres_bien', 'excellent')),
    date_obtention        DATE,
    type_diplome          VARCHAR(20) CHECK (type_diplome IN ('licence', 'master', 'doctorat', 'certificat', 'bts')),
    annee_academique      VARCHAR(9),                    -- ex "2024-2025"
    notes                 JSONB,                         -- détail des notes par matière
    statut                VARCHAR(20) NOT NULL DEFAULT 'brouillon'
                          CHECK (statut IN ('brouillon', 'soumis', 'en_examen', 'valide', 'rejete', 'certifie', 'revoque')),
    motif_rejet           TEXT,
    date_transmission     TIMESTAMPTZ,
    date_traitement       TIMESTAMPTZ,
    agent_etablissement_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    agent_ministere_id    UUID REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE INDEX idx_dossiers_statut ON dossiers(statut);
CREATE INDEX idx_dossiers_etablissement ON dossiers(etablissement_id);

-- ───────────────────────────────────────────────────────────────────
-- diplomes (diplôme certifié issu d'un dossier validé)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE diplomes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference           VARCHAR(20) NOT NULL UNIQUE,   -- format DIP-AAAA-XXXXX
    dossier_id          UUID NOT NULL REFERENCES dossiers(id)       ON DELETE RESTRICT,
    candidat_id         UUID NOT NULL REFERENCES candidats(id)      ON DELETE RESTRICT,
    etablissement_id    UUID NOT NULL REFERENCES etablissements(id) ON DELETE RESTRICT,
    ministere_id        UUID NOT NULL REFERENCES ministeres(id)     ON DELETE RESTRICT,
    donnees_signees     JSONB,                         -- snapshot des données signées
    hash_sha256         VARCHAR(64),
    signature_numerique TEXT,
    transaction_id      VARCHAR(120),                  -- tx hash blockchain
    qr_code_url         TEXT,
    pdf_url             TEXT,
    statut              VARCHAR(20) NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'revoque')),
    motif_revocation    TEXT,
    date_certification  TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_revocation     TIMESTAMPTZ
);

CREATE INDEX idx_diplomes_hash ON diplomes(hash_sha256);
CREATE INDEX idx_diplomes_candidat ON diplomes(candidat_id);

-- ───────────────────────────────────────────────────────────────────
-- transactions_blockchain
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE transactions_blockchain (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diplome_id       UUID NOT NULL REFERENCES diplomes(id) ON DELETE CASCADE,
    transaction_hash VARCHAR(120),
    block_number     BIGINT,
    adresse_contrat  VARCHAR(120),
    gas_used         VARCHAR(60),
    gas_price        VARCHAR(60),
    statut           VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'confirmee', 'echouee')),
    date_transaction TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────
-- verifications_log (traçabilité des vérifications publiques)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE verifications_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diplome_id       UUID REFERENCES diplomes(id) ON DELETE SET NULL,  -- NULL si introuvable
    hash_recherche   VARCHAR(120),
    methode          VARCHAR(10) CHECK (methode IN ('hash', 'qr', 'pdf')),
    adresse_ip       VARCHAR(60),
    user_agent       TEXT,
    pays_origine     VARCHAR(80),
    resultat         VARCHAR(20) CHECK (resultat IN ('authentique', 'introuvable', 'revoque')),
    date_verification TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────
-- journal_audit (piste d'audit des actions sensibles)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE journal_audit (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    action         VARCHAR(60) NOT NULL,
    entite         VARCHAR(60),
    entite_id      UUID,
    details        JSONB,
    adresse_ip     VARCHAR(60),
    date_action    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_audit_utilisateur ON journal_audit(utilisateur_id);
CREATE INDEX idx_journal_audit_entite ON journal_audit(entite, entite_id);
