-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Références métier séquentielles
--
-- PROBLÈME RÉSOLU
-- Les références CT-AAAA-XXXXX et DIP-AAAA-XXXXX étaient tirées AU
-- HASARD sur cinq chiffres, soit 100 000 valeurs par an. Deux défauts,
-- que seul un banc de charge pouvait révéler :
--
--   1. COLLISIONS. Le paradoxe des anniversaires ne pardonne pas. Sur
--      2 000 dossiers, la probabilité qu'au moins deux références se
--      heurtent dépasse 99,99 % ; à 12 000 — l'Université de Lomé, cas
--      d'usage affiché du cahier des charges — elle est certaine. La
--      transmission par lot n'essayait même pas de s'en prémunir : elle
--      appelait le générateur une fois par dossier, sans contrôle. Une
--      promotion entière échouait donc sur une violation d'unicité,
--      après avoir écrit ses premiers dossiers.
--
--   2. FUITE. Le contrôle unitaire, lui, tentait cinq tirages puis
--      abandonnait — et « existe déjà ? » suivi de « insère » laisse
--      entre les deux le temps qu'une autre transaction prenne la place.
--
-- MODÈLE RETENU
-- Un compteur par (préfixe, année), incrémenté atomiquement. Un seul
-- aller-retour réserve un BLOC de n numéros : la transmission d'une
-- promotion de 12 000 dossiers demande une ligne de SQL, pas 12 000
-- tirages suivis de 12 000 vérifications.
--
--   UPDATE … SET dernier = dernier + n RETURNING dernier
--
-- L'écriture verrouille la ligne du compteur : deux établissements qui
-- transmettent en même temps obtiennent deux plages disjointes, sans
-- se voir. Aucune référence n'est jamais réattribuée, même si une
-- transaction échoue après réservation — un trou dans la numérotation
-- est sans conséquence, une collision non.
--
-- CONSÉQUENCE ASSUMÉE
-- Les références deviennent PRÉVISIBLES : CT-2026-00042 est suivie de
-- CT-2026-00043. Ce n'est pas une régression de sécurité, parce qu'une
-- référence n'a jamais été un secret — la vérification publique est
-- ouverte à tous par construction, et c'est tout l'objet du service.
-- Ce qui protège n'est pas l'ignorance de la référence, c'est que la
-- réponse ne révèle rien de plus que ce qu'un employeur a le droit de
-- savoir. La limitation de débit borne l'énumération massive.
--
-- Le format ne change pas tant qu'on reste sous 100 000 par an ; au
-- delà, la référence s'allonge naturellement (CT-2026-100001) plutôt
-- que de boucler. Aucune contrainte de format n'existe en base.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compteurs_reference (
  prefixe     TEXT    NOT NULL,
  annee       INTEGER NOT NULL,
  dernier     BIGINT  NOT NULL DEFAULT 0,
  modifie_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (prefixe, annee),
  CONSTRAINT compteurs_reference_dernier_positif CHECK (dernier >= 0)
);

COMMENT ON TABLE compteurs_reference IS
  'Compteur atomique des références métier, par préfixe (CT, DIP, DI) et par année.';
COMMENT ON COLUMN compteurs_reference.dernier IS
  'Dernier numéro attribué. Une réservation de n numéros rend la plage [dernier-n+1 ; dernier].';

-- ── Reprise de l'existant ──────────────────────────────────────────
--
-- Les références déjà attribuées sont aléatoires : on ne les renumérote
-- pas — elles sont imprimées sur des PDF, encodées dans des QR codes et,
-- pour les diplômes, couvertes par un hash ancré sur la blockchain. On
-- amorce simplement chaque compteur au-dessus du plus grand suffixe
-- observé, pour qu'aucune référence future ne retombe sur une ancienne.
INSERT INTO compteurs_reference (prefixe, annee, dernier)
SELECT 'CT', annee, MAX(suffixe)
FROM (
  SELECT (split_part(reference, '-', 2))::int AS annee,
         (split_part(reference, '-', 3))::bigint AS suffixe
  FROM dossiers
  WHERE reference ~ '^CT-[0-9]{4}-[0-9]+$'
) s
GROUP BY annee
ON CONFLICT (prefixe, annee) DO NOTHING;

INSERT INTO compteurs_reference (prefixe, annee, dernier)
SELECT 'DIP', annee, MAX(suffixe)
FROM (
  SELECT (split_part(reference, '-', 2))::int AS annee,
         (split_part(reference, '-', 3))::bigint AS suffixe
  FROM diplomes
  WHERE reference ~ '^DIP-[0-9]{4}-[0-9]+$'
) s
GROUP BY annee
ON CONFLICT (prefixe, annee) DO NOTHING;

INSERT INTO compteurs_reference (prefixe, annee, dernier)
SELECT 'DI', annee, MAX(suffixe)
FROM (
  SELECT (split_part(reference, '-', 2))::int AS annee,
         (split_part(reference, '-', 3))::bigint AS suffixe
  FROM demandes_integration
  WHERE reference ~ '^DI-[0-9]{4}-[0-9]+$'
) s
GROUP BY annee
ON CONFLICT (prefixe, annee) DO NOTHING;

INSERT INTO compteurs_reference (prefixe, annee, dernier)
SELECT 'LOT', annee, MAX(suffixe)
FROM (
  SELECT (split_part(reference, '-', 2))::int AS annee,
         (split_part(reference, '-', 3))::bigint AS suffixe
  FROM lots_transmission
  WHERE reference ~ '^LOT-[0-9]{4}-[0-9]+$'
) s
GROUP BY annee
ON CONFLICT (prefixe, annee) DO NOTHING;
