// ─────────────────────────────────────────────────────────────
// Champs d'état civil d'un étudiant — formulaire partagé.
//
// La saisie existait à un seul endroit, l'écran « Étudiants ». Depuis
// une promotion, on ne pouvait que CHOISIR dans une liste : inscrire un
// étudiant qui n'existait pas encore obligeait à quitter l'écran, aller
// le créer, revenir, retrouver sa promotion, puis le sélectionner. Pour
// une scolarité qui saisit une cohorte à la main, c'est le geste répété
// deux cents fois.
//
// Ces champs vivent donc ici, et les deux écrans les montent — ce qui
// garantit au passage qu'un champ ajouté d'un côté n'est pas oublié de
// l'autre.
// ─────────────────────────────────────────────────────────────
import { Champ, Saisie, Liste } from './ui/index.jsx';

export const ETUDIANT_VIDE = {
  numero_etudiant: '',
  nom: '',
  prenom: '',
  date_naissance: '',
  lieu_naissance: '',
  sexe: '',
  telephone: '',
  email: '',
};

const OPTIONS_SEXE = [
  { value: 'M', label: 'Masculin' },
  { value: 'F', label: 'Féminin' },
];

/**
 * @param {object}   props
 * @param {object}   props.valeurs   état contrôlé
 * @param {Function} props.onChange  (champ, valeur) => void
 * @param {string}   [props.prefixe] préfixe des `id`, pour monter deux
 *                                   fois le formulaire sans collision
 */
export default function ChampsEtudiant({ valeurs, onChange, prefixe = 'e' }) {
  const id = (nom) => `${prefixe}-${nom}`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ
          label="N° étudiant"
          htmlFor={id('numero')}
          requis
          aide="Unique dans votre établissement."
        >
          <Saisie
            id={id('numero')}
            required
            value={valeurs.numero_etudiant}
            onChange={(e) => onChange('numero_etudiant', e.target.value)}
          />
        </Champ>
        <Champ label="Sexe" htmlFor={id('sexe')}>
          <Liste
            id={id('sexe')}
            value={valeurs.sexe}
            onChange={(e) => onChange('sexe', e.target.value)}
            options={OPTIONS_SEXE}
          />
        </Champ>
        <Champ label="Nom" htmlFor={id('nom')} requis>
          <Saisie
            id={id('nom')}
            required
            value={valeurs.nom}
            onChange={(e) => onChange('nom', e.target.value)}
          />
        </Champ>
        <Champ label="Prénom" htmlFor={id('prenom')} requis>
          <Saisie
            id={id('prenom')}
            required
            value={valeurs.prenom}
            onChange={(e) => onChange('prenom', e.target.value)}
          />
        </Champ>
        <Champ
          label="Date de naissance"
          htmlFor={id('naissance')}
          aide="Figure sur le diplôme : c'est elle qui distingue deux homonymes."
        >
          <Saisie
            id={id('naissance')}
            type="date"
            value={valeurs.date_naissance}
            onChange={(e) => onChange('date_naissance', e.target.value)}
          />
        </Champ>
        <Champ label="Lieu de naissance" htmlFor={id('lieu')}>
          <Saisie
            id={id('lieu')}
            value={valeurs.lieu_naissance}
            onChange={(e) => onChange('lieu_naissance', e.target.value)}
          />
        </Champ>
      </div>

      {/* Le téléphone est marqué requis parce qu'il l'est en pratique :
          la transmission d'une promotion est refusée si un admis n'en a
          pas (A-17). Le présenter comme facultatif reviendrait à laisser
          l'agent découvrir l'obstacle des semaines plus tard, au moment
          d'envoyer la promotion entière. */}
      <Champ
        label="Téléphone"
        htmlFor={id('telephone')}
        requis
        aide="Sans numéro, le diplômé ne sera pas averti de sa certification, n'ouvrira jamais son portefeuille — et la promotion ne pourra pas être transmise."
      >
        <Saisie
          id={id('telephone')}
          placeholder="+228 90 00 00 00"
          value={valeurs.telephone}
          onChange={(e) => onChange('telephone', e.target.value)}
        />
      </Champ>

      <Champ label="Email" htmlFor={id('email')} aide="Facultatif.">
        <Saisie
          id={id('email')}
          type="email"
          value={valeurs.email}
          onChange={(e) => onChange('email', e.target.value)}
        />
      </Champ>
    </>
  );
}
