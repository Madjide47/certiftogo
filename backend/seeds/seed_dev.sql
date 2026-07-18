-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Données de développement (Phase 1)
--
-- Contenu :
--   • 1 ministère (autorité de certification)
--   • 1 établissement pilote (Institut Africain d'Informatique, Lomé)
--   • 3 candidats de test
--   • Comptes utilisateurs : ministère, agent établissement, admin, 3 candidats
--
-- Les identifiants UUID sont fixes pour faciliter les tests.
-- Les numéros de téléphone sont fictifs (indicatif Togo +228).
--
-- ⚠️  À jouer APRÈS 001_init_schema.sql. Ré-exécutable (TRUNCATE en tête).
-- ═══════════════════════════════════════════════════════════════════

TRUNCATE journal_audit, verifications_log, transactions_blockchain,
         diplomes, dossiers, codes_otp, utilisateurs, candidats,
         ministeres, etablissements
    RESTART IDENTITY CASCADE;

-- ── Ministère ──────────────────────────────────────────────────────
INSERT INTO ministeres (id, nom, cle_publique, cle_privee_chiffree, email, telephone)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Ministère de l''Enseignement Supérieur du Togo',
    NULL,   -- clés cryptographiques générées en Phase 4
    NULL,
    'contact@mesr.gouv.tg',
    '+22822000000'
);

-- ── Établissement pilote ───────────────────────────────────────────
INSERT INTO etablissements (id, nom, type, ville, email, telephone, adresse, statut)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    'Institut Africain d''Informatique',
    'institut',
    'Lomé',
    'contact@iai-togo.tg',
    '+22890111111',
    'Avenue de la Libération, Lomé, Togo',
    'actif'
);

-- ── Candidats de test ──────────────────────────────────────────────
INSERT INTO candidats (id, numero_etudiant, nom, prenom, date_naissance, lieu_naissance, sexe, telephone, email, etablissement_id)
VALUES
    ('30000000-0000-0000-0000-000000000001', 'IAI-2021-001', 'AGBEKO', 'Koffi',   '2000-03-15', 'Lomé',    'M', '+22890000011', 'koffi.agbeko@example.tg',  '20000000-0000-0000-0000-000000000001'),
    ('30000000-0000-0000-0000-000000000002', 'IAI-2021-002', 'MENSAH', 'Ama',     '2001-07-22', 'Kpalimé', 'F', '+22890000012', 'ama.mensah@example.tg',    '20000000-0000-0000-0000-000000000001'),
    ('30000000-0000-0000-0000-000000000003', 'IAI-2021-003', 'DOSSEH', 'Yao',     '1999-11-05', 'Sokodé',  'M', '+22890000013', 'yao.dosseh@example.tg',    '20000000-0000-0000-0000-000000000001');

-- ── Comptes utilisateurs ───────────────────────────────────────────
-- Agent du ministère
INSERT INTO utilisateurs (id, nom, prenom, telephone, role, ministere_id)
VALUES ('40000000-0000-0000-0000-000000000001', 'ADJOVI', 'Sena', '+22890000001', 'ministere', '10000000-0000-0000-0000-000000000001');

-- Agent de l'établissement pilote
INSERT INTO utilisateurs (id, nom, prenom, telephone, role, etablissement_id)
VALUES ('40000000-0000-0000-0000-000000000002', 'KOUASSI', 'Edem', '+22890000002', 'etablissement', '20000000-0000-0000-0000-000000000001');

-- Administrateur système
INSERT INTO utilisateurs (id, nom, prenom, telephone, role)
VALUES ('40000000-0000-0000-0000-000000000003', 'ADMIN', 'Système', '+22890000003', 'admin_systeme');

-- Comptes candidats (rattachés à leur fiche candidat)
INSERT INTO utilisateurs (id, nom, prenom, telephone, role, candidat_id)
VALUES
    ('40000000-0000-0000-0000-000000000011', 'AGBEKO', 'Koffi', '+22890000011', 'candidat', '30000000-0000-0000-0000-000000000001'),
    ('40000000-0000-0000-0000-000000000012', 'MENSAH', 'Ama',   '+22890000012', 'candidat', '30000000-0000-0000-0000-000000000002'),
    ('40000000-0000-0000-0000-000000000013', 'DOSSEH', 'Yao',   '+22890000013', 'candidat', '30000000-0000-0000-0000-000000000003');

-- ═══════════════════════════════════════════════════════════════════
-- Récapitulatif des comptes de test (connexion par OTP) :
--
--   Rôle                | Téléphone
--   --------------------|---------------
--   Ministère           | +22890000001
--   Établissement (IAI) | +22890000002
--   Admin système       | +22890000003
--   Candidat (Koffi)    | +22890000011
--   Candidat (Ama)      | +22890000012
--   Candidat (Yao)      | +22890000013
-- ═══════════════════════════════════════════════════════════════════
