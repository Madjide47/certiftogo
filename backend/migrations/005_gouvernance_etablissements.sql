-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Gouvernance des établissements (CDC chapitre 8)
--
-- Trois manques comblés :
--
-- 1. AUCUN CODE OFFICIEL. Un établissement n'était identifié que par son
--    UUID technique et son nom. Le CDC exige un code administratif
--    (IAI001, UL002) qui identifie l'institution dans les échanges, là où
--    les comptes agents servent à se connecter. Ce n'est pas l'Université
--    de Lomé qui se connecte, c'est Mme Akossiwa qui y travaille.
--
-- 2. AUCUNE HABILITATION. Rien ne disait quels diplômes un établissement
--    a le droit de délivrer. Les contrôles automatiques à la réception
--    d'un lot (« établissement habilité », « diplôme autorisé ») étaient
--    donc impossibles à écrire.
--
-- 3. AUCUNE PROCÉDURE D'ENTRÉE. Un établissement ne pouvait pas demander
--    son intégration : il fallait qu'un administrateur le crée à la main,
--    sans trace de la décision d'agrément.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS demandes_integration CASCADE;
DROP TABLE IF EXISTS habilitations        CASCADE;
ALTER TABLE etablissements DROP COLUMN IF EXISTS code;
ALTER TABLE utilisateurs   DROP COLUMN IF EXISTS est_agent_principal;

-- ───────────────────────────────────────────────────────────────────
-- Code établissement — identifiant administratif officiel
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE etablissements ADD COLUMN code VARCHAR(20);

-- Attribution déterministe aux établissements existants : initiales des
-- mots significatifs du nom, puis un compteur à trois chiffres.
--   « Institut Africain d'Informatique » → IAI001
DO $$
DECLARE
    etab      RECORD;
    initiales TEXT;
    compteur  INT;
    propose   TEXT;
BEGIN
    FOR etab IN SELECT id, nom FROM etablissements WHERE code IS NULL ORDER BY date_creation LOOP
        -- Les accents sont retirés avant extraction : un code administratif
        -- doit rester ASCII (« École Nationale » → ENA, pas ÉNA).
        SELECT COALESCE(string_agg(upper(left(mot, 1)), ''), 'ETB')
          INTO initiales
          FROM (
              SELECT regexp_split_to_table(
                         regexp_replace(
                             translate(
                                 etab.nom,
                                 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÇçÑñ',
                                 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuCcNn'
                             ),
                             '[^A-Za-z ]', ' ', 'g'
                         ), '\s+'
                     ) AS mot
          ) mots
         WHERE length(mot) > 2;

        initiales := left(COALESCE(NULLIF(initiales, ''), 'ETB'), 4);

        compteur := 1;
        LOOP
            propose := initiales || lpad(compteur::text, 3, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM etablissements WHERE code = propose);
            compteur := compteur + 1;
        END LOOP;

        UPDATE etablissements SET code = propose WHERE id = etab.id;
    END LOOP;
END $$;

ALTER TABLE etablissements ALTER COLUMN code SET NOT NULL;
ALTER TABLE etablissements ADD CONSTRAINT uq_etablissements_code UNIQUE (code);

COMMENT ON COLUMN etablissements.code IS
    'Identifiant administratif officiel (IAI001). Distinct des comptes agents, qui portent la connexion.';

-- ───────────────────────────────────────────────────────────────────
-- habilitations — quels diplômes un établissement peut délivrer
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE habilitations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etablissement_id UUID        NOT NULL REFERENCES etablissements(id) ON DELETE CASCADE,
    type_diplome     VARCHAR(20) NOT NULL
                     CHECK (type_diplome IN ('licence', 'master', 'doctorat', 'certificat', 'bts')),
    reference_arrete VARCHAR(120),          -- arrêté ministériel d'habilitation
    date_debut       DATE        NOT NULL DEFAULT CURRENT_DATE,
    date_fin         DATE,                  -- NULL = durée indéterminée
    statut           VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (statut IN ('active', 'suspendue', 'expiree')),
    date_creation    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_habilitation_periode CHECK (date_fin IS NULL OR date_fin > date_debut)
);

-- Une seule habilitation active par (établissement, type de diplôme).
-- L'historique reste consultable via les habilitations expirées.
CREATE UNIQUE INDEX idx_habilitation_active
    ON habilitations (etablissement_id, type_diplome) WHERE statut = 'active';

CREATE INDEX idx_habilitations_etablissement ON habilitations(etablissement_id);

COMMENT ON TABLE habilitations IS
    'Droit accordé par le ministère à un établissement de délivrer un type de diplôme.';

-- Reprise : on habilite chaque établissement pour les types de diplômes
-- qu'il a effectivement délivrés, sinon la licence par défaut. Sans cela
-- les contrôles automatiques rejetteraient toutes les données existantes.
INSERT INTO habilitations (etablissement_id, type_diplome, reference_arrete)
SELECT DISTINCT d.etablissement_id, d.type_diplome, 'REPRISE-AUTOMATIQUE'
  FROM dossiers d
 WHERE d.type_diplome IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO habilitations (etablissement_id, type_diplome, reference_arrete)
SELECT e.id, 'licence', 'REPRISE-AUTOMATIQUE'
  FROM etablissements e
 WHERE NOT EXISTS (SELECT 1 FROM habilitations h WHERE h.etablissement_id = e.id)
ON CONFLICT DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- demandes_integration — porte d'entrée d'un établissement
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE demandes_integration (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference              VARCHAR(20) NOT NULL UNIQUE,   -- format DI-AAAA-XXXXX
    nom                    VARCHAR(255) NOT NULL,
    type                   VARCHAR(20)  NOT NULL
                           CHECK (type IN ('institut', 'universite', 'ecole', 'lycee')),
    ville                  VARCHAR(120) NOT NULL,
    adresse                TEXT,
    email                  VARCHAR(180) NOT NULL,
    telephone              VARCHAR(30)  NOT NULL,
    responsable_nom        VARCHAR(120) NOT NULL,
    responsable_prenom     VARCHAR(120) NOT NULL,
    responsable_telephone  VARCHAR(30)  NOT NULL,
    types_diplomes_demandes TEXT,                          -- liste séparée par des virgules
    message                TEXT,
    statut                 VARCHAR(20)  NOT NULL DEFAULT 'soumise'
                           CHECK (statut IN ('soumise', 'en_examen', 'acceptee', 'refusee')),
    motif_refus            TEXT,
    -- Renseigné à l'acceptation : trace le lien demande → établissement créé.
    etablissement_id       UUID REFERENCES etablissements(id) ON DELETE SET NULL,
    agent_ministere_id     UUID REFERENCES utilisateurs(id)   ON DELETE SET NULL,
    date_soumission        TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_traitement        TIMESTAMPTZ,
    CONSTRAINT chk_demande_refus CHECK (statut <> 'refusee' OR motif_refus IS NOT NULL)
);

CREATE INDEX idx_demandes_statut ON demandes_integration(statut);

COMMENT ON TABLE demandes_integration IS
    'Demande officielle d''un établissement souhaitant rejoindre CertifTOGO. Instruite par le ministère.';

-- ───────────────────────────────────────────────────────────────────
-- Agent principal — peut créer les autres agents de son établissement
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE utilisateurs ADD COLUMN est_agent_principal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN utilisateurs.est_agent_principal IS
    'Agent créé par le ministère avec l''établissement. Seul habilité à créer d''autres agents de son établissement.';

-- Reprise : le plus ancien agent de chaque établissement devient principal,
-- sinon aucun établissement existant ne pourrait créer de nouveaux comptes.
UPDATE utilisateurs u
   SET est_agent_principal = TRUE
  FROM (
      SELECT DISTINCT ON (etablissement_id) id
        FROM utilisateurs
       WHERE role = 'etablissement' AND etablissement_id IS NOT NULL
       ORDER BY etablissement_id, date_creation
  ) premiers
 WHERE u.id = premiers.id;
