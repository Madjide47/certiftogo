-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Référentiel académique (module M2)
--
-- Introduit la hiérarchie académique qui manquait au schéma initial :
--
--   etablissement → faculte → filiere → promotion → inscription → candidat
--                                          ↑
--                          annee_academique + session_academique
--
-- Migration ADDITIVE : aucune table de 001 n'est modifiée. Le lien vers les
-- étudiants passe par `inscriptions` plutôt que par une colonne sur
-- `candidats`, ce qui permet de retracer le parcours complet d'un étudiant
-- (L1 → L2 → L3) au lieu de n'en garder que la dernière promotion.
--
-- Convention (identique à 001) : snake_case, tables au pluriel, énumérations
-- par contraintes CHECK.
-- ═══════════════════════════════════════════════════════════════════

-- Rejouable : on repart d'un référentiel propre (ordre inverse des dépendances).
DROP TABLE IF EXISTS inscriptions          CASCADE;
DROP TABLE IF EXISTS promotions            CASCADE;
DROP TABLE IF EXISTS filieres              CASCADE;
DROP TABLE IF EXISTS facultes              CASCADE;
DROP TABLE IF EXISTS sessions_academiques  CASCADE;
DROP TABLE IF EXISTS annees_academiques    CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- annees_academiques (référentiel national, partagé par tous les
-- établissements : c'est le ministère qui ouvre et clôture une année)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE annees_academiques (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    libelle       VARCHAR(9)  NOT NULL UNIQUE,   -- format AAAA-AAAA, ex "2024-2025"
    date_debut    DATE        NOT NULL,
    date_fin      DATE        NOT NULL,
    statut        VARCHAR(20) NOT NULL DEFAULT 'preparation'
                  CHECK (statut IN ('preparation', 'ouverte', 'cloturee')),
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_annee_libelle CHECK (libelle ~ '^\d{4}-\d{4}$'),
    CONSTRAINT chk_annee_periode CHECK (date_fin > date_debut)
);

-- Règle métier : une seule année académique « ouverte » à la fois.
CREATE UNIQUE INDEX idx_annee_unique_ouverte
    ON annees_academiques (statut) WHERE statut = 'ouverte';

-- ───────────────────────────────────────────────────────────────────
-- sessions_academiques (normale / rattrapage / exceptionnelle)
-- Une session appartient à une année et disparaît avec elle.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE sessions_academiques (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_id      UUID        NOT NULL REFERENCES annees_academiques(id) ON DELETE CASCADE,
    type          VARCHAR(20) NOT NULL CHECK (type IN ('normale', 'rattrapage', 'exceptionnelle')),
    libelle       VARCHAR(120),
    date_debut    DATE,
    date_fin      DATE,
    statut        VARCHAR(20) NOT NULL DEFAULT 'preparation'
                  CHECK (statut IN ('preparation', 'ouverte', 'cloturee')),
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_session_periode CHECK (date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut)
);

-- Une seule session normale et une seule session de rattrapage par année ;
-- les sessions exceptionnelles ne sont pas limitées en nombre.
CREATE UNIQUE INDEX idx_session_unique_par_annee
    ON sessions_academiques (annee_id, type) WHERE type IN ('normale', 'rattrapage');

CREATE INDEX idx_sessions_annee ON sessions_academiques(annee_id);

-- ───────────────────────────────────────────────────────────────────
-- facultes (subdivision d'un établissement)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE facultes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etablissement_id UUID         NOT NULL REFERENCES etablissements(id) ON DELETE RESTRICT,
    nom              VARCHAR(255) NOT NULL,
    code             VARCHAR(20)  NOT NULL,   -- ex "FST", unique dans l'établissement
    statut           VARCHAR(20)  NOT NULL DEFAULT 'active'
                     CHECK (statut IN ('active', 'archivee')),
    date_creation    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (etablissement_id, code)
);

CREATE INDEX idx_facultes_etablissement ON facultes(etablissement_id);

-- ───────────────────────────────────────────────────────────────────
-- filieres (cursus rattaché à une faculté)
-- `type_diplome` reprend la nomenclature de dossiers.type_diplome.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE filieres (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculte_id    UUID         NOT NULL REFERENCES facultes(id) ON DELETE RESTRICT,
    nom           VARCHAR(255) NOT NULL,
    code          VARCHAR(20)  NOT NULL,   -- ex "GL", unique dans la faculté
    type_diplome  VARCHAR(20)  NOT NULL
                  CHECK (type_diplome IN ('licence', 'master', 'doctorat', 'certificat', 'bts')),
    duree_annees  SMALLINT     NOT NULL DEFAULT 3 CHECK (duree_annees BETWEEN 1 AND 8),
    statut        VARCHAR(20)  NOT NULL DEFAULT 'active'
                  CHECK (statut IN ('active', 'archivee')),
    date_creation TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (faculte_id, code)
);

CREATE INDEX idx_filieres_faculte ON filieres(faculte_id);

-- ───────────────────────────────────────────────────────────────────
-- promotions (cohorte : une filière, un niveau, une année académique)
--
-- C'est la future unité de transmission au ministère : un établissement
-- transmettra une promotion entière plutôt que des dossiers un par un.
-- `session_id` désigne la session au titre de laquelle la promotion est
-- présentée à la certification (NULL tant qu'elle n'est pas arrêtée).
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE promotions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filiere_id     UUID         NOT NULL REFERENCES filieres(id)            ON DELETE RESTRICT,
    annee_id       UUID         NOT NULL REFERENCES annees_academiques(id)  ON DELETE RESTRICT,
    session_id     UUID             REFERENCES sessions_academiques(id)     ON DELETE SET NULL,
    libelle        VARCHAR(180) NOT NULL,   -- ex "Licence 3 Génie Logiciel — 2024-2025"
    niveau         SMALLINT     NOT NULL CHECK (niveau BETWEEN 1 AND 8),
    effectif_prevu INTEGER      CHECK (effectif_prevu >= 0),
    statut         VARCHAR(20)  NOT NULL DEFAULT 'brouillon'
                   CHECK (statut IN ('brouillon', 'ouverte', 'transmise', 'certifiee', 'cloturee')),
    date_creation  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Une seule promotion par (filière, niveau) et par année académique.
    UNIQUE (filiere_id, annee_id, niveau)
);

CREATE INDEX idx_promotions_filiere ON promotions(filiere_id);
CREATE INDEX idx_promotions_annee   ON promotions(annee_id);
CREATE INDEX idx_promotions_statut  ON promotions(statut);

-- ───────────────────────────────────────────────────────────────────
-- inscriptions (présence d'un étudiant dans une promotion)
--
-- Table de liaison volontairement historisée : un étudiant accumule une
-- inscription par année d'études, ce qui reconstitue son parcours complet.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE inscriptions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidat_id      UUID        NOT NULL REFERENCES candidats(id)  ON DELETE RESTRICT,
    promotion_id     UUID        NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,
    statut           VARCHAR(20) NOT NULL DEFAULT 'inscrit'
                     CHECK (statut IN ('inscrit', 'admis', 'ajourne', 'abandon', 'exclu')),
    moyenne          NUMERIC(4,2) CHECK (moyenne >= 0 AND moyenne <= 20),
    mention          VARCHAR(20) CHECK (mention IN ('passable', 'assez_bien', 'bien', 'tres_bien', 'excellent')),
    date_inscription TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Un étudiant n'est inscrit qu'une fois dans une promotion donnée.
    UNIQUE (candidat_id, promotion_id),
    -- Règle métier : une mention ne se justifie que pour un étudiant admis.
    CONSTRAINT chk_inscription_mention CHECK (mention IS NULL OR statut = 'admis')
);

CREATE INDEX idx_inscriptions_candidat  ON inscriptions(candidat_id);
CREATE INDEX idx_inscriptions_promotion ON inscriptions(promotion_id);
