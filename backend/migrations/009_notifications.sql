-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Notifications (CDC chapitre 20)
--
-- PROBLÈME RÉSOLU
-- Le système n'envoyait qu'une seule chose : le code OTP. Un
-- établissement ne savait pas que son lot avait été rejeté, un diplômé
-- ignorait que son diplôme était certifié, l'administrateur n'était pas
-- averti qu'un ancrage blockchain avait échoué. Toute l'information
-- circulait par consultation manuelle de l'interface.
--
-- MODÈLE
-- Une notification est d'abord une LIGNE EN BASE, ensuite seulement un
-- envoi. Ainsi le centre de notifications in-app fonctionne même quand
-- WhatsApp est indisponible, et un envoi échoué reste rejouable.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS preferences_notification CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;

CREATE TABLE notifications (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evenement      VARCHAR(60) NOT NULL,
    canal          VARCHAR(20) NOT NULL CHECK (canal IN ('in_app', 'whatsapp', 'sms', 'email')),
    priorite       VARCHAR(10) NOT NULL DEFAULT 'normale'
                   CHECK (priorite IN ('haute', 'normale', 'basse')),

    destinataire_id        UUID REFERENCES utilisateurs(id) ON DELETE CASCADE,
    -- Conservés en clair : un destinataire peut ne pas avoir de compte
    -- (établissement candidat), ou son compte peut disparaître ensuite.
    destinataire_telephone VARCHAR(30),
    destinataire_email     VARCHAR(180),

    sujet          VARCHAR(180) NOT NULL,
    corps          TEXT NOT NULL,
    donnees        JSONB,

    entite         VARCHAR(60),
    entite_id      UUID,
    etablissement_id UUID REFERENCES etablissements(id) ON DELETE SET NULL,

    statut         VARCHAR(20) NOT NULL DEFAULT 'en_attente'
                   CHECK (statut IN ('en_attente', 'envoyee', 'echouee', 'abandonnee')),
    lue            BOOLEAN NOT NULL DEFAULT FALSE,
    tentatives     SMALLINT NOT NULL DEFAULT 0,
    max_tentatives SMALLINT NOT NULL DEFAULT 3,
    derniere_erreur TEXT,

    date_creation  TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_envoi     TIMESTAMPTZ,
    date_lecture   TIMESTAMPTZ
);

CREATE INDEX idx_notifications_destinataire ON notifications(destinataire_id, lue, date_creation DESC);
CREATE INDEX idx_notifications_a_envoyer ON notifications(statut) WHERE statut IN ('en_attente', 'echouee');
CREATE INDEX idx_notifications_evenement ON notifications(evenement);

COMMENT ON TABLE notifications IS
    'Une notification est une ligne en base avant d''être un envoi : le centre in-app fonctionne même si WhatsApp tombe.';

-- ───────────────────────────────────────────────────────────────────
-- preferences_notification — désabonnement par événement et par canal
--
-- L'absence de ligne vaut ACCEPTATION : on n'impose pas à chaque
-- utilisateur de tout activer à la main. Seuls les refus sont stockés.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE preferences_notification (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    evenement      VARCHAR(60) NOT NULL,
    canal          VARCHAR(20) NOT NULL CHECK (canal IN ('in_app', 'whatsapp', 'sms', 'email')),
    actif          BOOLEAN NOT NULL DEFAULT TRUE,
    date_maj       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (utilisateur_id, evenement, canal)
);

COMMENT ON TABLE preferences_notification IS
    'Refus explicites. L''absence de ligne vaut acceptation — on ne demande pas à l''utilisateur de tout activer.';

-- Certaines notifications ne se désactivent jamais : elles portent une
-- information dont l'utilisateur ne peut pas se passer.
COMMENT ON COLUMN preferences_notification.actif IS
    'Faux = refus. Sans effet sur les événements critiques (diplôme certifié, diplôme révoqué, sécurité).';
