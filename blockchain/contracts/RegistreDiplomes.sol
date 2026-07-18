// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RegistreDiplomes
 * @notice Registre on-chain des diplômes certifiés par le ministère (CertifTOGO).
 *
 * Principe : on n'écrit JAMAIS de données personnelles sur la blockchain.
 * Seul le hash SHA-256 du diplôme (donnees_signees) est ancré, accompagné
 * de la référence métier (format DIP-AAAA-XXXXX) et d'un horodatage.
 *
 * Le hash SHA-256 fait 32 octets, il est donc stocké tel quel en `bytes32`.
 * La vérification publique se fait par ce hash : un diplôme est authentique
 * s'il existe dans le registre et qu'il n'a pas été révoqué.
 */
contract RegistreDiplomes {
    // ── Structure d'un diplôme ancré ──────────────────────────────
    struct Diplome {
        string refDiplome; // référence métier DIP-AAAA-XXXXX
        uint256 dateCertification; // horodatage bloc (secondes epoch)
        address certificateur; // adresse ayant certifié (ministère)
        bool existe; // vrai si le hash a été enregistré
        bool revoque; // vrai si le diplôme a été révoqué
        string motifRevocation; // motif si révoqué (sinon vide)
    }

    // ── État ──────────────────────────────────────────────────────
    address public proprietaire; // administrateur du contrat (déployeur)
    uint256 public nombreDiplomes; // compteur de diplômes certifiés

    mapping(address => bool) public autorises; // adresses autorisées à certifier
    mapping(bytes32 => Diplome) private diplomes; // hash SHA-256 => diplôme
    mapping(string => bytes32) private hashParReference; // référence => hash (anti-doublon)

    // ── Événements ────────────────────────────────────────────────
    event DiplomeCertifie(
        bytes32 indexed hashSha256,
        string refDiplome,
        address indexed certificateur,
        uint256 dateCertification
    );
    event DiplomeRevoque(bytes32 indexed hashSha256, string motif, address indexed certificateur);
    event AutorisationAccordee(address indexed compte);
    event AutorisationRetiree(address indexed compte);
    event ProprietaireTransfere(address indexed ancien, address indexed nouveau);

    // ── Modificateurs ─────────────────────────────────────────────
    modifier seulementProprietaire() {
        require(msg.sender == proprietaire, "Reserve au proprietaire");
        _;
    }

    modifier seulementAutorise() {
        require(autorises[msg.sender], "Adresse non autorisee a certifier");
        _;
    }

    // ── Constructeur ──────────────────────────────────────────────
    constructor() {
        proprietaire = msg.sender;
        autorises[msg.sender] = true; // le déployeur peut certifier par défaut
        emit AutorisationAccordee(msg.sender);
    }

    // ── Gestion des autorisations ─────────────────────────────────
    function autoriser(address compte) external seulementProprietaire {
        require(compte != address(0), "Adresse invalide");
        require(!autorises[compte], "Deja autorise");
        autorises[compte] = true;
        emit AutorisationAccordee(compte);
    }

    function retirerAutorisation(address compte) external seulementProprietaire {
        require(autorises[compte], "Compte non autorise");
        autorises[compte] = false;
        emit AutorisationRetiree(compte);
    }

    function transfererPropriete(address nouveau) external seulementProprietaire {
        require(nouveau != address(0), "Adresse invalide");
        address ancien = proprietaire;
        proprietaire = nouveau;
        autorises[nouveau] = true;
        emit ProprietaireTransfere(ancien, nouveau);
        emit AutorisationAccordee(nouveau);
    }

    // ── Certification ─────────────────────────────────────────────
    /**
     * @notice Ancre un diplôme dans le registre.
     * @param hashSha256 hash SHA-256 (32 octets) du snapshot signé du diplôme.
     * @param refDiplome référence métier unique (DIP-AAAA-XXXXX).
     */
    function certifier(bytes32 hashSha256, string calldata refDiplome) external seulementAutorise {
        require(hashSha256 != bytes32(0), "Hash invalide");
        require(bytes(refDiplome).length > 0, "Reference requise");
        require(!diplomes[hashSha256].existe, "Diplome deja certifie");
        require(hashParReference[refDiplome] == bytes32(0), "Reference deja utilisee");

        diplomes[hashSha256] = Diplome({
            refDiplome: refDiplome,
            dateCertification: block.timestamp,
            certificateur: msg.sender,
            existe: true,
            revoque: false,
            motifRevocation: ""
        });
        hashParReference[refDiplome] = hashSha256;
        nombreDiplomes += 1;

        emit DiplomeCertifie(hashSha256, refDiplome, msg.sender, block.timestamp);
    }

    // ── Révocation ────────────────────────────────────────────────
    /**
     * @notice Révoque un diplôme déjà certifié (fraude, erreur, annulation).
     */
    function revoquer(bytes32 hashSha256, string calldata motif) external seulementAutorise {
        Diplome storage d = diplomes[hashSha256];
        require(d.existe, "Diplome introuvable");
        require(!d.revoque, "Diplome deja revoque");
        require(bytes(motif).length > 0, "Motif requis");

        d.revoque = true;
        d.motifRevocation = motif;

        emit DiplomeRevoque(hashSha256, motif, msg.sender);
    }

    // ── Lecture publique ──────────────────────────────────────────
    /**
     * @notice Renvoie l'intégralité des informations ancrées pour un hash.
     */
    function verifier(bytes32 hashSha256)
        external
        view
        returns (
            bool existe,
            bool revoque,
            string memory refDiplome,
            uint256 dateCertification,
            address certificateur,
            string memory motifRevocation
        )
    {
        Diplome storage d = diplomes[hashSha256];
        return (d.existe, d.revoque, d.refDiplome, d.dateCertification, d.certificateur, d.motifRevocation);
    }

    /**
     * @notice Raccourci : vrai si le diplôme existe et n'est pas révoqué.
     */
    function estValide(bytes32 hashSha256) external view returns (bool) {
        Diplome storage d = diplomes[hashSha256];
        return d.existe && !d.revoque;
    }

    /**
     * @notice Retrouve le hash ancré à partir de la référence métier.
     */
    function hashDeReference(string calldata refDiplome) external view returns (bytes32) {
        return hashParReference[refDiplome];
    }
}
