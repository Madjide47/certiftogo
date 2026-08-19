// ─────────────────────────────────────────────────────────────
// Demande d'intégration d'un établissement — la seule porte d'entrée.
//
// Tout le reste de la plateforme suppose un compte ; ici, par
// construction, il n'y en a pas : un établissement non agréé ne peut pas
// se connecter pour demander à l'être. Le dépôt est donc public, et ne
// crée aucun accès — il crée un dossier, que le ministère instruit.
//
// Trois étapes, dans cet ordre, parce que c'est l'ordre de la pensée :
//   1. l'établissement se déclare (formulaire) ;
//   2. il désigne qui l'engage et qui répond (responsables) ;
//   3. il PROUVE ce qu'il a déclaré (pièces).
// Les documents ne servent qu'à établir des données déjà saisies : on ne
// fait pas lire une adresse au fond d'un PDF.
//
// Les pièces ne sont pas une liste à composer mais une CHECKLIST : une
// case par document attendu, l'obligatoire séparé du facultatif, et la
// transmission fermée tant qu'il manque une pièce exigée.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  typesDiplome,
  cataloguePieces,
  ouvrirDossier,
  listerPieces,
  deposerPiece,
  retirerPiece,
  transmettreDossier,
  suivreDemande,
  memoriser,
  dossierEnCours,
  oublier,
} from '../services/demande.service.js';
import { messageErreur } from '../utils/libelles.js';
import { Icone, Bouton, Encart, ChampSaisie, Saisie, Zone, Liste } from '../components/ui.jsx';

const TYPES_ETABLISSEMENT = [
  { value: 'universite', label: 'Université' },
  { value: 'institut', label: 'Institut' },
  { value: 'ecole', label: 'École' },
  { value: 'lycee', label: 'Lycée' },
];

const STATUTS_JURIDIQUES = [
  { value: 'public', label: 'Public' },
  { value: 'prive', label: 'Privé' },
];

const STATUTS = {
  soumise: { ton: 'info', libelle: 'Déposée, en attente d’instruction' },
  en_examen: { ton: 'alerte', libelle: 'En cours d’instruction' },
  acceptee: { ton: 'succes', libelle: 'Acceptée' },
  refusee: { ton: 'erreur', libelle: 'Refusée' },
};

const VIDE = {
  nom: '',
  type: '',
  statut_juridique: '',
  ville: '',
  adresse: '',
  telephone: '',
  email: '',
  site_web: '',
  representant_nom: '',
  representant_prenom: '',
  representant_fonction: '',
  representant_telephone: '',
  representant_email: '',
  responsable_nom: '',
  responsable_prenom: '',
  responsable_telephone: '',
  contact_technique_nom: '',
  contact_technique_telephone: '',
  contact_technique_email: '',
  message: '',
};

const poids = (o) =>
  o < 1024 ? `${o} o` : o < 1024 * 1024 ? `${Math.round(o / 1024)} ko` : `${(o / (1024 * 1024)).toFixed(1)} Mo`;

const horodatage = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');

export default function IntegrationPage() {
  const [form, setForm] = useState(VIDE);
  const [types, setTypes] = useState([]);
  const [diplomes, setDiplomes] = useState([]);
  const [catalogue, setCatalogue] = useState([]);

  const [dossier, setDossier] = useState(dossierEnCours());
  const [pieces, setPieces] = useState([]);
  const [manquants, setManquants] = useState([]);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState('');
  const [depose, setDepose] = useState(null);

  const [reference, setReference] = useState('');
  const [suivi, setSuivi] = useState(null);
  const [erreurSuivi, setErreurSuivi] = useState('');

  useEffect(() => {
    typesDiplome()
      .then(setTypes)
      .catch(() => setTypes([]));
    cataloguePieces()
      .then((c) => setCatalogue(c.types))
      .catch(() => setCatalogue([]));
  }, []);

  useEffect(() => {
    if (!dossier) return;
    rafraichir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier?.reference]);

  async function rafraichir() {
    try {
      const data = await listerPieces(dossier.reference, dossier.jeton_depot);
      setPieces(data.pieces);
      setManquants(data.manquants);
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  const modifier = (champ) => (e) => setForm({ ...form, [champ]: e.target.value });

  function basculerDiplome(code) {
    setDiplomes((l) => (l.includes(code) ? l.filter((c) => c !== code) : [...l, code]));
  }

  async function ouvrir(e) {
    e.preventDefault();
    setEnCours('dossier');
    setErreur('');
    try {
      const ouvert = await ouvrirDossier({ ...form, types_diplomes_demandes: diplomes });
      // Le nom et le statut juridique sont conservés côté navigateur : la
      // réponse ne renvoie que l'identification du dossier, et l'étape
      // suivante a besoin du statut pour savoir quelles pièces exiger.
      const complet = { ...ouvert, nom: form.nom, statut_juridique: form.statut_juridique };
      memoriser(complet);
      setDossier(complet);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours('');
    }
  }

  async function joindre(code, fichier) {
    if (!fichier) return;
    setEnCours(code);
    setErreur('');
    try {
      const data = await deposerPiece(dossier.reference, dossier.jeton_depot, {
        type_piece: code,
        fichier,
      });
      setManquants(data.manquants);
      await rafraichir();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours('');
    }
  }

  async function retirer(piece) {
    setErreur('');
    try {
      const data = await retirerPiece(dossier.reference, dossier.jeton_depot, piece.id);
      setManquants(data.manquants);
      await rafraichir();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function transmettre() {
    setEnCours('transmission');
    setErreur('');
    try {
      setDepose(await transmettreDossier(dossier.reference, dossier.jeton_depot));
      oublier();
      setDossier(null);
      setPieces([]);
      setForm(VIDE);
      setDiplomes([]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours('');
    }
  }

  async function chercher(e) {
    e.preventDefault();
    setErreurSuivi('');
    setSuivi(null);
    try {
      setSuivi(await suivreDemande(reference.trim()));
    } catch (err) {
      setErreurSuivi(messageErreur(err, 'Aucune demande ne porte cette référence.'));
    }
  }

  // Le statut juridique commande les pièces exigibles : un établissement
  // public n'a ni registre de commerce ni identifiant fiscal.
  const juridique = dossier ? dossier.statut_juridique : form.statut_juridique;
  const exigible = (t) => t.exigence === 'toujours' || (t.exigence === 'prive' && juridique === 'prive');
  const obligatoires = catalogue.filter(exigible);
  const facultatives = catalogue.filter((t) => !exigible(t));
  const deposee = (code) => pieces.find((p) => p.type_piece === code);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl">Demander l’intégration d’un établissement</h1>
      <p className="mt-2 text-base text-gris-700">
        Réservé aux établissements d’enseignement souhaitant délivrer leurs diplômes via
        CertifTOGO. Le dossier est instruit par le ministère : il n’ouvre aucun accès tant qu’il
        n’a pas été accepté.
      </p>

      {depose && (
        <div className="mt-5">
          <Encart ton="succes" titre="Dossier transmis au ministère">
            <p>
              Conservez cette référence, elle permet d’en suivre l’instruction :{' '}
              <strong className="tabulaire">{depose.reference}</strong>
            </p>
            <p className="mt-1 text-sm">
              En cas d’acceptation, un compte est créé pour le responsable des certifications : il
              se connectera par code reçu sur son numéro.
            </p>
          </Encart>
        </div>
      )}

      {erreur && (
        <div className="mt-5">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}

      {/* Le suivi d'abord : la plupart des visites sont des retours. */}
      <section className="mt-6 border border-gris-300 bg-white p-5">
        <h2 className="text-lg">Suivre une demande déjà déposée</h2>
        <form onSubmit={chercher} className="mt-3 flex flex-wrap gap-2">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="DI-2026-00042"
            aria-label="Référence de la demande"
            className="tabulaire min-w-[14rem] flex-1 rounded border border-gris-500 bg-white px-3 py-2.5 text-base text-gris-900 placeholder:text-gris-500 focus:border-vert"
          />
          <Bouton type="submit" variante="secondaire" icone="search" disabled={!reference.trim()}>
            Suivre
          </Bouton>
        </form>

        {erreurSuivi && (
          <div className="mt-3">
            <Encart ton="erreur">{erreurSuivi}</Encart>
          </div>
        )}

        {suivi && (
          <div className="mt-3">
            <Encart
              ton={STATUTS[suivi.statut]?.ton || 'info'}
              titre={`${suivi.nom} — ${STATUTS[suivi.statut]?.libelle || suivi.statut}`}
            >
              <p className="text-sm">
                Déposée le {horodatage(suivi.date_soumission)}
                {suivi.date_traitement && ` · instruite le ${horodatage(suivi.date_traitement)}`}
              </p>
              {suivi.motif_refus && (
                <p className="mt-1 text-sm">
                  <strong>Motif du refus :</strong> {suivi.motif_refus}
                </p>
              )}
            </Encart>
          </div>
        )}
      </section>

      {/* ── Étapes 1 et 2 : déclaration ── */}
      {!dossier ? (
        <form onSubmit={ouvrir} className="mt-6 border border-gris-300 bg-white p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-gris-500">Étape 1 sur 2</p>
          <h2 className="text-lg">Informations générales</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ChampSaisie label="Nom officiel de l’établissement" htmlFor="nom" requis>
              <Saisie
                id="nom"
                required
                value={form.nom}
                onChange={modifier('nom')}
                placeholder="Université de Lomé"
              />
            </ChampSaisie>

            <ChampSaisie label="Type" htmlFor="type" requis>
              <Liste
                id="type"
                required
                vide="— Choisir —"
                value={form.type}
                onChange={modifier('type')}
                options={TYPES_ETABLISSEMENT}
              />
            </ChampSaisie>

            <ChampSaisie
              label="Statut"
              htmlFor="juridique"
              requis
              aide="Un établissement privé doit joindre son registre de commerce et son attestation fiscale."
            >
              <Liste
                id="juridique"
                required
                vide="— Choisir —"
                value={form.statut_juridique}
                onChange={modifier('statut_juridique')}
                options={STATUTS_JURIDIQUES}
              />
            </ChampSaisie>

            <ChampSaisie label="Ville" htmlFor="ville" requis>
              <Saisie id="ville" required value={form.ville} onChange={modifier('ville')} />
            </ChampSaisie>

            <ChampSaisie label="Adresse" htmlFor="adresse">
              <Saisie id="adresse" value={form.adresse} onChange={modifier('adresse')} />
            </ChampSaisie>

            <ChampSaisie label="Téléphone" htmlFor="telephone" requis aide="Format +228…">
              <Saisie
                id="telephone"
                required
                value={form.telephone}
                onChange={modifier('telephone')}
                placeholder="+22890000000"
              />
            </ChampSaisie>

            <ChampSaisie label="E-mail officiel" htmlFor="email" requis>
              <Saisie
                id="email"
                type="email"
                required
                value={form.email}
                onChange={modifier('email')}
              />
            </ChampSaisie>

            <ChampSaisie label="Site web" htmlFor="site">
              <Saisie
                id="site"
                value={form.site_web}
                onChange={modifier('site_web')}
                placeholder="https://…"
              />
            </ChampSaisie>
          </div>

          {/* Trois rôles distincts : celui qui ENGAGE, celui qui EXPLOITE,
              celui qui RÉPARE. Souvent trois personnes — les confondre,
              c'est écrire au mauvais. */}
          <h2 className="mt-8 text-lg">Responsables et contacts</h2>

          <h3 className="mt-4 text-base font-bold text-gris-900">Représentant légal</h3>
          <p className="mt-0.5 text-sm text-gris-500">
            Celui qui engage l’établissement et signe la lettre de demande.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <ChampSaisie label="Nom" htmlFor="rep-nom">
              <Saisie
                id="rep-nom"
                value={form.representant_nom}
                onChange={modifier('representant_nom')}
              />
            </ChampSaisie>
            <ChampSaisie label="Prénom" htmlFor="rep-prenom">
              <Saisie
                id="rep-prenom"
                value={form.representant_prenom}
                onChange={modifier('representant_prenom')}
              />
            </ChampSaisie>
            <ChampSaisie label="Fonction" htmlFor="rep-fonction">
              <Saisie
                id="rep-fonction"
                value={form.representant_fonction}
                onChange={modifier('representant_fonction')}
                placeholder="Recteur, Directeur général…"
              />
            </ChampSaisie>
            <ChampSaisie label="Téléphone" htmlFor="rep-tel">
              <Saisie
                id="rep-tel"
                value={form.representant_telephone}
                onChange={modifier('representant_telephone')}
              />
            </ChampSaisie>
            <ChampSaisie label="E-mail" htmlFor="rep-email">
              <Saisie
                id="rep-email"
                type="email"
                value={form.representant_email}
                onChange={modifier('representant_email')}
              />
            </ChampSaisie>
          </div>

          <h3 className="mt-6 text-base font-bold text-gris-900">
            Responsable des certifications
          </h3>
          <p className="mt-0.5 text-sm text-gris-500">
            En cas d’acceptation, c’est cette personne qui reçoit le premier compte : la connexion
            se fait par code envoyé sur son numéro.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <ChampSaisie label="Nom" htmlFor="res-nom" requis>
              <Saisie
                id="res-nom"
                required
                value={form.responsable_nom}
                onChange={modifier('responsable_nom')}
              />
            </ChampSaisie>
            <ChampSaisie label="Prénom" htmlFor="res-prenom" requis>
              <Saisie
                id="res-prenom"
                required
                value={form.responsable_prenom}
                onChange={modifier('responsable_prenom')}
              />
            </ChampSaisie>
            <ChampSaisie label="Téléphone" htmlFor="res-tel" requis>
              <Saisie
                id="res-tel"
                required
                value={form.responsable_telephone}
                onChange={modifier('responsable_telephone')}
                placeholder="+22890000000"
              />
            </ChampSaisie>
          </div>

          <h3 className="mt-6 text-base font-bold text-gris-900">Contact informatique</h3>
          <p className="mt-0.5 text-sm text-gris-500">
            Qui joindre quand l’intégration technique pose problème. Facultatif.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <ChampSaisie label="Nom" htmlFor="tec-nom">
              <Saisie
                id="tec-nom"
                value={form.contact_technique_nom}
                onChange={modifier('contact_technique_nom')}
              />
            </ChampSaisie>
            <ChampSaisie label="Téléphone" htmlFor="tec-tel">
              <Saisie
                id="tec-tel"
                value={form.contact_technique_telephone}
                onChange={modifier('contact_technique_telephone')}
              />
            </ChampSaisie>
            <ChampSaisie label="E-mail" htmlFor="tec-email">
              <Saisie
                id="tec-email"
                type="email"
                value={form.contact_technique_email}
                onChange={modifier('contact_technique_email')}
              />
            </ChampSaisie>
          </div>

          <h3 className="mt-6 text-base font-bold text-gris-900">Diplômes concernés</h3>
          <p className="mt-0.5 text-sm text-gris-500">
            Le ministère habilite ensuite type par type, sur la base de l’arrêté d’agrément.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {types.map((t) => (
              <label key={t.code} className="flex items-center gap-2 text-base text-gris-900">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={diplomes.includes(t.code)}
                  onChange={() => basculerDiplome(t.code)}
                />
                {t.libelle}
              </label>
            ))}
          </div>

          <div className="mt-6">
            <ChampSaisie
              label="Message"
              htmlFor="message"
              aide="Facultatif : référence de l’arrêté, effectifs, précisions utiles."
            >
              <Zone id="message" value={form.message} onChange={modifier('message')} />
            </ChampSaisie>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gris-300 pt-4">
            <p className="flex items-start gap-1.5 text-sm text-gris-500">
              <Icone nom="lock" taille={16} className="mt-0.5 shrink-0" />
              Rien n’est transmis au ministère à cette étape : les pièces viennent ensuite.
            </p>
            <Bouton type="submit" icone="arrow_forward" disabled={enCours === 'dossier'}>
              {enCours === 'dossier' ? 'Ouverture…' : 'Continuer vers les pièces'}
            </Bouton>
          </div>
        </form>
      ) : (
        /* ── Étape 3 : les pièces ── */
        <section className="mt-6 border border-gris-300 bg-white p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-gris-500">Étape 2 sur 2</p>
          <h2 className="text-lg">Pièces justificatives</h2>
          <p className="mt-1 text-base text-gris-700">
            Dossier <strong className="tabulaire">{dossier.reference}</strong> — {dossier.nom}. Il
            n’est pas encore parti : il ne sera transmis qu’à la dernière étape.
          </p>

          <h3 className="mt-6 text-base font-bold text-gris-900">
            Documents obligatoires
            <span className="ml-2 font-normal text-gris-500">
              {obligatoires.length - manquants.length} sur {obligatoires.length}
            </span>
          </h3>
          <ul className="mt-2 border-t border-gris-200">
            {obligatoires.map((t) => (
              <CasePiece
                key={t.code}
                type={t}
                piece={deposee(t.code)}
                occupe={enCours === t.code}
                onJoindre={(f) => joindre(t.code, f)}
                onRetirer={retirer}
              />
            ))}
          </ul>

          <h3 className="mt-8 text-base font-bold text-gris-900">Documents facultatifs</h3>
          <ul className="mt-2 border-t border-gris-200">
            {facultatives.map((t) => (
              <CasePiece
                key={t.code}
                type={t}
                piece={deposee(t.code)}
                occupe={enCours === t.code}
                onJoindre={(f) => joindre(t.code, f)}
                onRetirer={retirer}
              />
            ))}
          </ul>

          <div className="mt-6">
            {manquants.length > 0 ? (
              <Encart ton="alerte" titre="Dossier incomplet">
                Il manque {manquants.length} pièce(s) obligatoire(s) :{' '}
                {manquants.map((m) => m.libelle).join(', ')}. La transmission reste fermée tant
                qu’elles ne sont pas jointes.
              </Encart>
            ) : (
              <Encart ton="succes" titre="Dossier complet">
                Toutes les pièces obligatoires sont jointes. Vous pouvez transmettre le dossier au
                ministère — après quoi il ne sera plus modifiable.
              </Encart>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gris-300 pt-4">
            <button
              type="button"
              onClick={() => {
                oublier();
                setDossier(null);
              }}
              className="text-sm text-gris-500 underline underline-offset-2"
            >
              Abandonner ce dossier
            </button>
            <Bouton
              icone="send"
              onClick={transmettre}
              disabled={manquants.length > 0 || enCours === 'transmission'}
            >
              {enCours === 'transmission' ? 'Envoi…' : 'Transmettre au ministère'}
            </Bouton>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Une case par document attendu.
 *
 * Un menu déroulant « nature du document » obligerait à savoir ce qu'on
 * doit fournir avant de le fournir, et ne dirait jamais ce qui manque.
 * Ici la liste des pièces EST la liste des cases : ce qui est vide se
 * voit.
 */
function CasePiece({ type, piece, occupe, onJoindre, onRetirer }) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-gris-200 py-3">
      <Icone
        nom={piece ? 'check_circle' : 'radio_button_unchecked'}
        taille={22}
        className={`mt-0.5 shrink-0 ${piece ? 'text-succes filled' : 'text-gris-500'}`}
      />

      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-gris-900">{type.libelle}</p>
        <p className="text-sm text-gris-500">
          {type.aide} Formats : {type.extensions.join(', ')}.
        </p>

        {piece && (
          <p className="mt-1 text-sm text-gris-700">
            {piece.nom_fichier} · {poids(piece.taille_octets)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <label className="cursor-pointer text-base text-vert underline underline-offset-2 hover:text-vert-fonce">
          {occupe ? 'Envoi…' : piece ? 'Remplacer' : 'Choisir un fichier'}
          <input
            type="file"
            className="sr-only"
            accept={type.extensions.join(',')}
            disabled={occupe}
            onChange={(e) => {
              onJoindre(e.target.files?.[0] || null);
              e.target.value = '';
            }}
          />
        </label>
        {piece && (
          <button
            type="button"
            onClick={() => onRetirer(piece)}
            className="text-base text-erreur underline underline-offset-2"
          >
            Retirer
          </button>
        )}
      </div>
    </li>
  );
}
