-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Sessions, anti-force brute et double validation
-- (CDC chapitre 23)
--
-- TROIS FAIBLESSES CORRIGÉES
--
-- 1. AUCUNE SESSION. Le JWT valait 24 h et rien ne pouvait l'annuler :
--    désactiver un compte ne fermait pas ses accès en cours, et un
--    téléphone volé restait exploitable une journée entière.
--
-- 2. OTP SANS LIMITE D'ESSAIS. Un code à 6 chiffres, c'est un million de
--    possibilités : sans plafond de tentatives, il tombe en quelques
--    minutes avec un script.
--
-- 3. AUCUN CONTRÔLE À QUATRE YEUX. Un seul agent pouvait révoquer un
--    diplôme ou certifier des milliers de dossiers. Comme toute
--    l'authentification repose sur le téléphone, un appareil volé donne
--    tous les droits de son titulaire : le second facteur utile n'est
--    pas un second appareil, c'est une SECONDE PERSONNE.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS validations_critiques CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- sessions — un accès révocable, et la liste des appareils connectés
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,

    -- Le jeton de rafraîchissement n'est JAMAIS stocké en clair : la
    -- fuite de cette table ne doit pas permettre d'usurper une session.
    jeton_hash     CHAR(64) NOT NULL UNIQUE,

    adresse_ip     VARCHAR(60),
    user_agent     TEXT,
    date_creation  TIMESTAMPTZ NOT NULL DEFAULT now(),
    derniere_activite TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_expiration TIMESTAMPTZ NOT NULL,
    date_revocation TIMESTAMPTZ,
    revoquee_par   UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    motif_revocation VARCHAR(60)
);

CREATE INDEX idx_sessions_utilisateur ON sessions(utilisateur_id)
    WHERE date_revocation IS NULL;
CREATE INDEX idx_sessions_expiration ON sessions(date_expiration);

COMMENT ON TABLE sessions IS
    'Sessions actives. Permet la révocation immédiate d''un accès et la liste des appareils connectés.';
COMMENT ON COLUMN sessions.jeton_hash IS
    'SHA-256 du jeton de rafraîchissement. Le jeton en clair n''existe que chez le client.';

-- ───────────────────────────────────────────────────────────────────
-- Anti-force brute sur l'OTP
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE codes_otp ADD COLUMN IF NOT EXISTS tentatives SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE codes_otp ADD COLUMN IF NOT EXISTS bloque BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN codes_otp.tentatives IS
    'Essais infructueux. Au-delà du plafond, le code est brûlé : il faut en redemander un.';

-- ───────────────────────────────────────────────────────────────────
-- validations_critiques — contrôle à quatre yeux
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE validations_critiques (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action        VARCHAR(60) NOT NULL,
    entite        VARCHAR(60),
    entite_id     UUID,

    -- Tout ce qu'il faut pour rejouer l'action une fois approuvée.
    charge_utile  JSONB NOT NULL,
    motif         TEXT,

    demandeur_id  UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
    demandeur_libelle VARCHAR(255),
    approbateur_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    approbateur_libelle VARCHAR(255),

    statut        VARCHAR(20) NOT NULL DEFAULT 'en_attente'
                  CHECK (statut IN ('en_attente', 'approuvee', 'refusee', 'expiree', 'executee')),
    motif_refus   TEXT,
    resultat      JSONB,

    date_demande  TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_expiration TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '48 hours',
    date_decision TIMESTAMPTZ,

    -- Le demandeur ne peut pas être son propre approbateur : c'est tout
    -- l'intérêt du dispositif.
    CONSTRAINT chk_quatre_yeux CHECK (approbateur_id IS NULL OR approbateur_id <> demandeur_id)
);

CREATE INDEX idx_validations_statut ON validations_critiques(statut, date_expiration);

COMMENT ON TABLE validations_critiques IS
    'Actions sensibles en attente d''un second agent. Le second facteur n''est pas un appareil, c''est une personne.';
