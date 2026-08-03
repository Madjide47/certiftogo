-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Sous-rôles et workflow interne (CDC chapitre 9.2)
--
-- PROBLÈME RÉSOLU
-- « L'établissement » était traité comme un acteur unique : n'importe
-- quel agent pouvait saisir, corriger ET transmettre au ministère. Dans
-- une université réelle, celui qui saisit n'est pas celui qui engage
-- l'institution.
--
-- TROIS SOUS-RÔLES
--   • agent de saisie    — crée candidats et promotions ;
--   • chef de scolarité  — contrôle, corrige, saisit les résultats ;
--   • directeur          — seul à pouvoir transmettre au ministère.
--
-- MODE SIMPLE
-- Beaucoup d'établissements n'ont qu'une personne à la scolarité.
-- `etablissements.mode_workflow = 'simple'` (défaut) : tous les agents
-- disposent de toutes les permissions, et la promotion passe directement
-- de « ouverte » à « transmise ». Imposer une hiérarchie à un
-- établissement qui n'en a pas le bloquerait purement et simplement.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS roles_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- Sous-rôle de l'agent et mode de fonctionnement de l'établissement
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS chk_sous_role;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS sous_role VARCHAR(30);
ALTER TABLE utilisateurs ADD CONSTRAINT chk_sous_role CHECK (
    sous_role IS NULL
    OR (role = 'etablissement' AND sous_role IN ('agent_saisie', 'chef_scolarite', 'directeur'))
);

COMMENT ON COLUMN utilisateurs.sous_role IS
    'Niveau hiérarchique au sein de l''établissement. Ignoré en mode workflow « simple ».';

ALTER TABLE etablissements DROP CONSTRAINT IF EXISTS chk_mode_workflow;
ALTER TABLE etablissements ADD COLUMN IF NOT EXISTS mode_workflow VARCHAR(20) NOT NULL DEFAULT 'simple';
ALTER TABLE etablissements ADD CONSTRAINT chk_mode_workflow
    CHECK (mode_workflow IN ('simple', 'hierarchique'));

COMMENT ON COLUMN etablissements.mode_workflow IS
    'simple : tous les agents peuvent tout. hierarchique : contrôle interne puis validation du directeur avant transmission.';

-- Reprise : l'agent principal devient directeur, les autres agents de
-- saisie. Sans effet tant que l'établissement reste en mode simple.
UPDATE utilisateurs
   SET sous_role = CASE WHEN est_agent_principal THEN 'directeur' ELSE 'agent_saisie' END
 WHERE role = 'etablissement' AND sous_role IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- Étapes internes de la promotion
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_statut_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_statut_check
    CHECK (statut IN ('brouillon', 'ouverte', 'controle_interne', 'validee_interne',
                      'transmise', 'certifiee', 'cloturee'));

COMMENT ON COLUMN promotions.statut IS
    'controle_interne et validee_interne n''existent qu''en mode hierarchique.';

-- ───────────────────────────────────────────────────────────────────
-- Catalogue des permissions
--
-- La matrice fait autorité dans le code (permissions.service.js) ; ces
-- tables la rendent CONSULTABLE — pour l'audit, la documentation et un
-- futur écran d'administration.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE permissions (
    code    VARCHAR(60) PRIMARY KEY,
    domaine VARCHAR(40) NOT NULL,
    libelle VARCHAR(180) NOT NULL
);

CREATE TABLE roles_permissions (
    role            VARCHAR(20) NOT NULL,
    sous_role       VARCHAR(30),
    permission_code VARCHAR(60) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role, sous_role, permission_code)
);

INSERT INTO permissions (code, domaine, libelle) VALUES
    ('candidat.creer',            'etudiants',  'Créer une fiche étudiant'),
    ('candidat.modifier',         'etudiants',  'Modifier une fiche étudiant'),
    ('candidat.supprimer',        'etudiants',  'Supprimer une fiche étudiant'),
    ('structure.gerer',           'structure',  'Gérer facultés et filières'),
    ('promotion.creer',           'promotions', 'Créer une promotion'),
    ('promotion.modifier',        'promotions', 'Modifier une promotion'),
    ('promotion.supprimer',       'promotions', 'Supprimer une promotion'),
    ('promotion.inscrire',        'promotions', 'Inscrire ou retirer un étudiant'),
    ('promotion.importer',        'promotions', 'Importer une promotion depuis un fichier'),
    ('promotion.resultat',        'promotions', 'Saisir les résultats de délibération'),
    ('promotion.controler',       'promotions', 'Soumettre au contrôle interne'),
    ('promotion.valider_interne', 'promotions', 'Valider en interne avant transmission'),
    ('promotion.transmettre',     'promotions', 'Transmettre au ministère'),
    ('agent.creer',               'comptes',    'Créer un compte agent');

-- Agent de saisie : produit la donnée, n'engage pas l'établissement.
INSERT INTO roles_permissions (role, sous_role, permission_code)
SELECT 'etablissement', 'agent_saisie', code FROM permissions
 WHERE code IN ('candidat.creer', 'candidat.modifier', 'promotion.creer',
                'promotion.modifier', 'promotion.inscrire', 'promotion.importer');

-- Chef de scolarité : tout ce que fait l'agent de saisie, plus le contrôle.
INSERT INTO roles_permissions (role, sous_role, permission_code)
SELECT 'etablissement', 'chef_scolarite', code FROM permissions
 WHERE code IN ('candidat.creer', 'candidat.modifier', 'candidat.supprimer',
                'structure.gerer', 'promotion.creer', 'promotion.modifier',
                'promotion.supprimer', 'promotion.inscrire', 'promotion.importer',
                'promotion.resultat', 'promotion.controler', 'promotion.valider_interne');

-- Directeur : seul à engager l'établissement auprès du ministère.
INSERT INTO roles_permissions (role, sous_role, permission_code)
SELECT 'etablissement', 'directeur', code FROM permissions;

COMMENT ON TABLE roles_permissions IS
    'Reflet consultable de la matrice codée dans permissions.service.js. Le code fait autorité.';
