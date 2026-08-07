-- ═══════════════════════════════════════════════════════════════════
-- CertifTOGO — Pièces du mémoire de fin de cycle
--
-- La liste des types de pièces (migration 014) avait été écrite pour un
-- dossier administratif : relevé de notes, acte de naissance, pièce
-- d'identité. Elle ignorait ce qui fonde réellement un diplôme de fin de
-- cycle dans les établissements togolais — le MÉMOIRE, et sa PAGE DE
-- GARDE, celle que le jury signe et qui porte le titre du travail, le
-- nom du directeur de mémoire et la date de soutenance.
--
-- Sans elles, un agent n'avait qu'un fourre-tout : « Autre document ».
-- Un fourre-tout ne se contrôle pas — le ministère ne peut pas exiger
-- une pièce qui n'a pas de nom, ni vérifier qu'elle a été fournie.
-- Nommer la pièce, c'est pouvoir la réclamer.
--
-- La page de garde et le mémoire restent FACULTATIFS : toutes les
-- filières ne soutiennent pas de mémoire (licences professionnelles,
-- cursus courts). Les rendre obligatoires bloquerait des promotions
-- entières pour une pièce qui n'existe pas chez elles.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE pieces_jointes
    DROP CONSTRAINT IF EXISTS pieces_jointes_type_piece_check;

ALTER TABLE pieces_jointes
    ADD CONSTRAINT pieces_jointes_type_piece_check
    CHECK (type_piece IN ('releve_notes', 'rapport_stage',
                          'page_garde_memoire', 'memoire',
                          'acte_naissance', 'piece_identite',
                          'attestation', 'proces_verbal',
                          'arrete_jury', 'autre'));

COMMENT ON COLUMN pieces_jointes.type_piece IS
    'Nature de l''acte. Liste tenue côté service (TYPES_PIECE) et bornée ici.';
