// ─────────────────────────────────────────────────────────────
// Prépare la pile de démonstration pour un réseau partagé.
//
// POURQUOI CE SCRIPT EXISTE
// Les QR codes encodent l'adresse de la page publique de vérification.
// Par défaut c'est `http://localhost:5174/verifier/…` — parfait sur la
// machine, inutilisable ailleurs : sur le téléphone du jury, `localhost`
// désigne le téléphone lui-même. Le QR ne mène nulle part, et l'argument
// le plus fort de la démonstration tombe.
//
// Il faut donc que les QR portent l'adresse de la machine DANS le réseau
// partagé. Cette adresse change à chaque réseau — Wi-Fi de l'école un
// jour, partage de connexion le lendemain. La coder en dur garantit
// qu'elle sera fausse le jour J : on la détecte.
//
// CE QUE FAIT LE SCRIPT
//   1. détecte les adresses IPv4 de la machine et retient la plus
//      plausible (ou celle qu'on lui donne) ;
//   2. écrit `HOTE_DEMO` dans le `.env` de la racine, que Docker Compose
//      lit tout seul ;
//   3. régénère les PDF et les QR avec la bonne adresse ;
//   4. rappelle les deux commandes qui restent — la reconstruction des
//      images et la copie des fichiers dans le conteneur.
//
// La régénération est SANS DANGER : le hash et la signature portent sur
// les DONNÉES du diplôme, jamais sur le fichier. La vérification publique
// répond exactement comme avant.
//
// USAGE
//   node scripts/preparer-demo.mjs                 # détecte l'adresse
//   node scripts/preparer-demo.mjs 192.168.43.17   # impose une adresse
//   node scripts/preparer-demo.mjs --localhost     # revient au défaut
//   node scripts/preparer-demo.mjs --sans-fichiers # n'écrit que le .env
// ─────────────────────────────────────────────────────────────
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
const ENV_RACINE = path.join(RACINE, '.env');

const args = process.argv.slice(2);
const RETOUR_LOCALHOST = args.includes('--localhost');
const SANS_FICHIERS = args.includes('--sans-fichiers');
const adresseImposee = args.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));

const PORT_PUBLIC = process.env.PORT_PUBLIC || '5174';

/**
 * Les adresses IPv4 réelles de la machine, la plus plausible en tête.
 *
 * Une machine de développement Windows en expose facilement six : WSL,
 * deux adaptateurs VMware, VirtualBox, le commutateur Hyper-V… et une
 * seule mène quelque part. On écarte les interfaces virtuelles par leur
 * nom, puis on privilégie le Wi-Fi — c'est par lui que passe un partage
 * de connexion.
 */
function adressesPlausibles() {
  const virtuelles = /(vEthernet|VMware|VirtualBox|Loopback|Hyper-V|WSL|Docker|vboxnet)/i;
  const candidates = [];

  for (const [nom, liens] of Object.entries(os.networkInterfaces())) {
    for (const lien of liens || []) {
      if (lien.family !== 'IPv4' || lien.internal) continue;
      if (lien.address.startsWith('169.254.')) continue; // auto-attribuée : sans réseau
      candidates.push({ nom, adresse: lien.address, virtuelle: virtuelles.test(nom) });
    }
  }

  const score = (c) => {
    if (c.virtuelle) return 3;
    if (/wi-?fi|wlan|sans fil/i.test(c.nom)) return 0; // le partage de connexion passe par là
    if (/ethernet|eth/i.test(c.nom)) return 1;
    return 2;
  };
  return candidates.sort((a, b) => score(a) - score(b));
}

/** Pose ou remplace une clé dans le .env de la racine, sans toucher au reste. */
function ecrireHote(valeur) {
  let contenu = fs.existsSync(ENV_RACINE) ? fs.readFileSync(ENV_RACINE, 'utf8') : '';
  const ligne = `HOTE_DEMO=${valeur}`;

  if (/^HOTE_DEMO=.*$/m.test(contenu)) {
    contenu = contenu.replace(/^HOTE_DEMO=.*$/m, ligne);
  } else {
    const entete =
      '# Adresse de cette machine dans le réseau partagé avec le jury.\n' +
      '# Posée par `node backend/scripts/preparer-demo.mjs`. Docker Compose\n' +
      '# lit ce fichier tout seul. `localhost` = comportement par défaut.\n';
    contenu = contenu ? `${contenu.replace(/\n*$/, '\n')}\n${entete}${ligne}\n` : `${entete}${ligne}\n`;
  }
  fs.writeFileSync(ENV_RACINE, contenu, 'utf8');
}

// ── 1. Choisir l'adresse ───────────────────────────────────────────

let hote;
if (RETOUR_LOCALHOST) {
  hote = 'localhost';
} else if (adresseImposee) {
  hote = adresseImposee;
} else {
  const candidates = adressesPlausibles();
  if (!candidates.length) {
    console.error(
      "Aucune adresse IPv4 utilisable.\n" +
        "La machine n'est sur aucun réseau : connecte-toi au partage de connexion, puis relance."
    );
    process.exit(1);
  }
  hote = candidates[0].adresse;

  console.log('Adresses détectées :');
  for (const c of candidates) {
    const marque = c.adresse === hote ? '→' : ' ';
    const note = c.virtuelle ? '  (interface virtuelle — sans doute pas celle-là)' : '';
    console.log(`  ${marque} ${c.adresse.padEnd(16)} ${c.nom}${note}`);
  }
  console.log('');
  if (candidates.length > 1) {
    console.log('Si le choix est mauvais, impose-le : node scripts/preparer-demo.mjs <adresse>\n');
  }
}

const urlVerification = `http://${hote}:${PORT_PUBLIC}/verifier`;

ecrireHote(hote);
console.log(`HOTE_DEMO=${hote} écrit dans ${ENV_RACINE}`);
console.log(`Les QR codes mèneront à : ${urlVerification}/<empreinte>\n`);

// ── 2. Régénérer PDF et QR ─────────────────────────────────────────

if (SANS_FICHIERS) {
  console.log('(--sans-fichiers : PDF et QR inchangés)');
} else {
  console.log('Régénération des PDF et des QR…');
  const r = spawnSync(process.execPath, [path.join(ICI, 'regenerer-pdf.mjs')], {
    cwd: path.resolve(ICI, '..'),
    env: { ...process.env, PUBLIC_VERIFY_URL: urlVerification },
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('\nLa régénération a échoué. Le .env est posé ; corrige puis relance.');
    process.exit(r.status || 1);
  }
}

// ── 3. Ce qu'il reste à faire ──────────────────────────────────────

console.log(`
─────────────────────────────────────────────────────────────
Il reste deux commandes, depuis la racine du dépôt :

  docker compose --profile complet up -d --build
  docker cp backend/uploads/. certiftogo_api:/app/uploads/

Le --build n'est pas optionnel : Vite fige l'adresse de l'API dans le
bundle. Sans reconstruction, le téléphone qui ouvre la page appellerait
« localhost:4000 », c'est-à-dire lui-même.

Puis, DEPUIS UN TÉLÉPHONE du réseau partagé, vérifier :

  http://${hote}:${PORT_PUBLIC}

Si la page ne s'ouvre pas alors que la machine y accède, c'est le
pare-feu Windows : autoriser les ports ${PORT_PUBLIC} et 4000 en entrée,
profil « réseau privé ».
─────────────────────────────────────────────────────────────`);
