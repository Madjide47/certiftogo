# Blockchain — CertifTOGO (Phase 2)

Registre on-chain des diplômes certifiés. Smart contract Solidity déployable sur
le testnet **Polygon Amoy**, développé et testé avec **Hardhat**.

## Principe

On n'écrit **jamais** de données personnelles sur la blockchain. Le ministère
certifie un diplôme en ancrant :

- le **hash SHA-256** du snapshot signé (`diplomes.donnees_signees`) — clé `bytes32` ;
- la **référence métier** (`DIP-AAAA-XXXXX`) ;
- un **horodatage** et l'**adresse** du certificateur.

La vérification publique (Phase 5) consiste à recalculer le hash d'un diplôme et
à interroger le contrat : le diplôme est authentique s'il **existe** et n'est
**pas révoqué**.

## Contrat `RegistreDiplomes`

| Fonction | Accès | Rôle |
|----------|-------|------|
| `certifier(bytes32 hash, string ref)` | autorisé | ancre un diplôme |
| `revoquer(bytes32 hash, string motif)` | autorisé | révoque un diplôme |
| `verifier(bytes32 hash)` | public (view) | infos complètes ancrées |
| `estValide(bytes32 hash)` | public (view) | `true` si existe et non révoqué |
| `hashDeReference(string ref)` | public (view) | hash ancré pour une référence |
| `autoriser` / `retirerAutorisation` | propriétaire | gère les certificateurs |
| `transfererPropriete` | propriétaire | transfère l'administration |

Événements : `DiplomeCertifie`, `DiplomeRevoque`, `AutorisationAccordee`,
`AutorisationRetiree`, `ProprietaireTransfere`.

Anti-doublon : un hash **et** une référence ne peuvent être certifiés qu'une fois.

## Commandes

```bash
cd blockchain
npm install                 # dépendances Hardhat

npm run compile             # compile le contrat
npm test                    # exécute la suite de tests (16 tests)
npx hardhat run scripts/certifier-demo.js   # démo du cycle de vie (réseau en mémoire)
```

### Déploiement

```bash
# Réseau local (dans un 1er terminal)
npm run node
# puis, dans un 2e terminal
npm run deploy:local

# Testnet Polygon Amoy (nécessite .env renseigné + POL de test)
npm run deploy:amoy
```

## Configuration (`.env`)

Copier `.env.example` en `.env` :

- `AMOY_RPC_URL` — RPC du testnet Amoy (public par défaut).
- `DEPLOYER_PRIVATE_KEY` — clé privée d'un **compte de test** alimenté en POL de
  test ([faucet Polygon](https://faucet.polygon.technology), réseau Amoy).
- `POLYGONSCAN_API_KEY` — pour vérifier le contrat sur l'explorer (optionnel).

⚠️ Ne jamais commiter `.env` ni une clé privée de production.

## Intégration backend (Phase 4)

Après déploiement, reporter l'adresse dans `backend/.env` (`CONTRAT_ADRESSE=0x…`).
Le service de certification appellera `certifier()` puis enregistrera le
`transaction_hash`, le `block_number`, le `gas_used` et l'`adresse_contrat` dans
la table `transactions_blockchain`, et le tx hash dans `diplomes.transaction_id`.
L'ABI est généré à la compilation dans `artifacts/contracts/RegistreDiplomes.sol/`.
