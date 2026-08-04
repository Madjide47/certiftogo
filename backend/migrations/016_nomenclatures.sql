-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Nomenclatures en base (P-11)
--
-- Les types de diplôme et les mentions vivaient dans des contraintes
-- CHECK, répétées à l'identique dans quatre tables. Conséquence : créer
-- un « DUT » ou un « master professionnel » demandait une migration, un
-- redéploiement, et la mise à jour de cinq CHECK sans en oublier un.
-- Une nomenclature nationale ne bouge pas tous les jours, mais elle
-- bouge — un arrêté suffit — et cela ne peut pas dépendre d'une
-- livraison de code.
--
-- Le contrôle reste FORT : on remplace le CHECK par une clé étrangère.
-- Ce n'est pas un assouplissement, c'est un déplacement — la base refuse
-- toujours une valeur inconnue, mais la liste des valeurs connues est
-- désormais une donnée.
--
-- On ne SUPPRIME jamais une entrée de nomenclature : des diplômes
-- certifiés y font référence, et leur hash est ancré sur la blockchain.
-- On la désactive, ce qui la retire des formulaires sans toucher au passé.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS types_diplome (
    code      VARCHAR(30) PRIMARY KEY,
    libelle   VARCHAR(120) NOT NULL,
    -- Rang dans le cursus : sert à trier, et à repérer une incohérence
    -- (un master délivré avant la licence du même titulaire).
    niveau    SMALLINT NOT NULL DEFAULT 0,
    actif     BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentions (
    code      VARCHAR(30) PRIMARY KEY,
    libelle   VARCHAR(120) NOT NULL,
    -- Seuil indicatif sur 20. Il documente la nomenclature ; il ne
    -- s'impose pas au jury, qui reste souverain.
    seuil_min NUMERIC(4,2),
    ordre     SMALLINT NOT NULL DEFAULT 0,
    actif     BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO types_diplome (code, libelle, niveau) VALUES
    ('bts',        'Brevet de technicien supérieur', 2),
    ('licence',    'Licence',                        3),
    ('master',     'Master',                         5),
    ('doctorat',   'Doctorat',                       8),
    ('certificat', 'Certificat',                     1)
ON CONFLICT (code) DO NOTHING;

INSERT INTO mentions (code, libelle, seuil_min, ordre) VALUES
    ('passable',   'Passable',    10.00, 1),
    ('assez_bien', 'Assez bien',  12.00, 2),
    ('bien',       'Bien',        14.00, 3),
    ('tres_bien',  'Très bien',   16.00, 4),
    ('excellent',  'Excellent',   18.00, 5)
ON CONFLICT (code) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────
-- Remplacement des CHECK par des clés étrangères.
--
-- ON DELETE RESTRICT est volontaire et redondant avec la règle « on ne
-- supprime pas » : deux garde-fous valent mieux qu'une consigne.
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE dossiers DROP CONSTRAINT IF EXISTS dossiers_type_diplome_check;
ALTER TABLE dossiers DROP CONSTRAINT IF EXISTS dossiers_mention_check;
ALTER TABLE dossiers DROP CONSTRAINT IF EXISTS fk_dossiers_type_diplome;
ALTER TABLE dossiers DROP CONSTRAINT IF EXISTS fk_dossiers_mention;
ALTER TABLE dossiers
    ADD CONSTRAINT fk_dossiers_type_diplome
        FOREIGN KEY (type_diplome) REFERENCES types_diplome(code) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_dossiers_mention
        FOREIGN KEY (mention) REFERENCES mentions(code) ON DELETE RESTRICT;

ALTER TABLE filieres DROP CONSTRAINT IF EXISTS filieres_type_diplome_check;
ALTER TABLE filieres DROP CONSTRAINT IF EXISTS fk_filieres_type_diplome;
ALTER TABLE filieres
    ADD CONSTRAINT fk_filieres_type_diplome
        FOREIGN KEY (type_diplome) REFERENCES types_diplome(code) ON DELETE RESTRICT;

ALTER TABLE inscriptions DROP CONSTRAINT IF EXISTS inscriptions_mention_check;
ALTER TABLE inscriptions DROP CONSTRAINT IF EXISTS fk_inscriptions_mention;
ALTER TABLE inscriptions
    ADD CONSTRAINT fk_inscriptions_mention
        FOREIGN KEY (mention) REFERENCES mentions(code) ON DELETE RESTRICT;

ALTER TABLE habilitations DROP CONSTRAINT IF EXISTS habilitations_type_diplome_check;
ALTER TABLE habilitations DROP CONSTRAINT IF EXISTS fk_habilitations_type_diplome;
ALTER TABLE habilitations
    ADD CONSTRAINT fk_habilitations_type_diplome
        FOREIGN KEY (type_diplome) REFERENCES types_diplome(code) ON DELETE RESTRICT;

COMMENT ON TABLE types_diplome IS
    'Nomenclature des diplômes délivrables. Ajouter un type est un INSERT, plus une migration.';
COMMENT ON TABLE mentions IS
    'Nomenclature des mentions. `seuil_min` documente l''usage ; le jury reste souverain.';
COMMENT ON COLUMN types_diplome.actif IS
    'Faux = retiré des formulaires. On ne supprime pas : des diplômes ancrés y font référence.';
