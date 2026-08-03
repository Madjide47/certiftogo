-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Pièces justificatives des dossiers
--
-- Jusqu'ici, l'établissement transmettait des DONNÉES : nom, matricule,
-- moyenne, mention. Le ministère validait sur cette seule foi. Or une
-- délibération s'appuie sur des actes — relevés de notes, procès-verbal
-- de jury, rapport de stage — et c'est en les consultant qu'un agent
-- instruit réellement un dossier. Sans eux, la validation ministérielle
-- ne fait qu'entériner ce que l'établissement affirme.
--
-- Deux portées, parce que les actes n'ont pas tous la même :
--
--   INDIVIDUELLE (candidat_id)  le relevé de notes, le rapport de stage,
--                               l'acte de naissance : un par étudiant.
--   COLLECTIVE (promotion_id)   le procès-verbal de délibération,
--                               l'arrêté du jury : un pour la promotion
--                               entière. Le faire déposer 250 fois
--                               n'ajouterait aucune information et
--                               multiplierait les versions divergentes.
--
-- Le fichier lui-même vit hors de `uploads/`, qui est servi en statique :
-- un relevé de notes n'est pas un QR code, il ne doit être lisible que
-- par l'établissement émetteur, le ministère instructeur et l'audit.
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS pieces_jointes CASCADE;

CREATE TABLE pieces_jointes (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Portée : exactement l'une des deux colonnes est renseignée.
    candidat_id        UUID REFERENCES candidats(id)   ON DELETE CASCADE,
    promotion_id       UUID REFERENCES promotions(id)  ON DELETE CASCADE,

    -- Toujours connu : sert l'isolation inter-établissements sans jointure.
    etablissement_id   UUID NOT NULL REFERENCES etablissements(id) ON DELETE RESTRICT,

    type_piece         VARCHAR(30) NOT NULL
                       CHECK (type_piece IN ('releve_notes', 'rapport_stage',
                                             'acte_naissance', 'piece_identite',
                                             'attestation', 'proces_verbal',
                                             'arrete_jury', 'autre')),
    libelle            VARCHAR(255),

    nom_fichier        VARCHAR(255) NOT NULL,   -- nom d'origine, restitué au téléchargement
    chemin             VARCHAR(500) NOT NULL,   -- relatif au dossier de stockage privé
    type_mime          VARCHAR(120) NOT NULL,
    taille_octets      INTEGER NOT NULL CHECK (taille_octets > 0),
    -- Empreinte du contenu : ce que le ministère ouvre est bien ce que
    -- l'établissement a déposé. Sans elle, une substitution de fichier
    -- sur le disque ne laisserait aucune trace.
    empreinte          CHAR(64) NOT NULL,

    statut             VARCHAR(20) NOT NULL DEFAULT 'deposee'
                       CHECK (statut IN ('deposee', 'vue', 'validee', 'rejetee')),
    motif_rejet        TEXT,

    deposee_par_id     UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    agent_ministere_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,

    date_depot         TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_consultation  TIMESTAMPTZ,
    date_decision      TIMESTAMPTZ,

    -- Une pièce rattachée à rien serait invisible ; rattachée aux deux,
    -- on ne saurait pas laquelle des deux portées fait foi.
    CONSTRAINT chk_piece_portee CHECK (
        (candidat_id IS NOT NULL AND promotion_id IS NULL)
     OR (candidat_id IS NULL AND promotion_id IS NOT NULL)
    ),
    -- Un rejet sans motif renverrait l'établissement à la devinette.
    CONSTRAINT chk_piece_rejet CHECK (statut <> 'rejetee' OR motif_rejet IS NOT NULL)
);

CREATE INDEX idx_pieces_candidat ON pieces_jointes(candidat_id);
CREATE INDEX idx_pieces_promotion ON pieces_jointes(promotion_id);
CREATE INDEX idx_pieces_etablissement ON pieces_jointes(etablissement_id);
CREATE INDEX idx_pieces_statut ON pieces_jointes(statut);

-- Le même acte ne se dépose pas deux fois pour la même personne : c'est
-- la seconde version qui remplace la première, explicitement.
CREATE UNIQUE INDEX idx_piece_unique_candidat
    ON pieces_jointes (candidat_id, type_piece, nom_fichier)
    WHERE candidat_id IS NOT NULL;

COMMENT ON TABLE pieces_jointes IS
    'Actes justificatifs déposés par l''établissement et instruits par le ministère.';
COMMENT ON COLUMN pieces_jointes.empreinte IS
    'SHA-256 du contenu au dépôt : garantit que la pièce consultée est celle déposée.';
COMMENT ON COLUMN pieces_jointes.statut IS
    'deposee → vue (ouverte par le ministère) → validee ou rejetee.';
COMMENT ON COLUMN pieces_jointes.promotion_id IS
    'Portée collective : procès-verbal de délibération, arrêté de jury.';

-- ───────────────────────────────────────────────────────────────────
-- Permissions internes — reflet de la matrice codée dans
-- permissions.service.js, qui reste la source d'autorité.
--
-- Déposer une pièce, c'est produire de la donnée : l'agent de saisie le
-- fait. La retirer engage davantage — on efface un acte du dossier —
-- donc à partir du chef de scolarité.
-- ───────────────────────────────────────────────────────────────────
INSERT INTO permissions (code, domaine, libelle) VALUES
    ('piece.deposer',   'pieces', 'Déposer une pièce justificative'),
    ('piece.supprimer', 'pieces', 'Retirer une pièce justificative')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles_permissions (role, sous_role, permission_code)
SELECT 'etablissement', 'agent_saisie', 'piece.deposer'
ON CONFLICT DO NOTHING;

INSERT INTO roles_permissions (role, sous_role, permission_code)
SELECT 'etablissement', sous_role, code
  FROM (VALUES ('chef_scolarite'), ('directeur')) AS r(sous_role),
       (VALUES ('piece.deposer'), ('piece.supprimer')) AS p(code)
ON CONFLICT DO NOTHING;
