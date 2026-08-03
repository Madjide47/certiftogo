// ─────────────────────────────────────────────────────────────
// Composants du socle — registre « service public ».
//
// Un seul fichier : ces composants sont courts, ils partagent les mêmes
// jetons et ils se lisent mieux ensemble qu'éclatés en quinze fichiers de
// vingt lignes.
//
// Règles communes :
//   • aucune ombre, aucun dégradé, rayon de 2 px ;
//   • tout élément interactif est atteignable au clavier ;
//   • les états (chargement, vide, erreur) sont des composants, pas des
//     bricolages répétés dans chaque page.
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';

/* ── Icône ──────────────────────────────────────────────────── */

export function Icone({ nom, taille = 20, className = '' }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: taille }}
      aria-hidden="true"
    >
      {nom}
    </span>
  );
}

/* ── Boutons ────────────────────────────────────────────────── */

const BASE_BOUTON =
  'inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-base font-medium ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTES = {
  primaire: 'bg-vert text-white hover:bg-vert-fonce',
  secondaire: 'border border-vert bg-white text-vert hover:bg-vert-clair',
  neutre: 'border border-gris-300 bg-white text-gris-900 hover:bg-gris-100',
  danger: 'bg-erreur text-white hover:bg-erreur/90',
  discret: 'text-vert underline underline-offset-2 hover:text-vert-fonce px-1 py-0.5',
};

export function Bouton({
  variante = 'primaire',
  icone,
  enCours = false,
  children,
  className = '',
  ...props
}) {
  return (
    <button
      type="button"
      className={`${BASE_BOUTON} ${VARIANTES[variante]} ${className}`}
      disabled={props.disabled || enCours}
      {...props}
    >
      {icone && <Icone nom={enCours ? 'progress_activity' : icone} taille={18} />}
      {enCours ? 'Traitement…' : children}
    </button>
  );
}

/* ── Étiquette d'état ───────────────────────────────────────────
   Plate, bordée, sans arrondi complet : elle informe, elle ne décore pas. */

const TONS = {
  neutre: 'border-gris-300 bg-gris-100 text-gris-700',
  succes: 'border-succes/30 bg-succes-clair text-succes',
  alerte: 'border-alerte/30 bg-alerte-clair text-alerte',
  erreur: 'border-erreur/30 bg-erreur-clair text-erreur',
  info: 'border-info/30 bg-info-clair text-info',
  vert: 'border-vert/30 bg-vert-clair text-vert',
};

export function Etiquette({ ton = 'neutre', children }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${TONS[ton]}`}
    >
      {children}
    </span>
  );
}

/* ── Encart d'information ───────────────────────────────────────
   Bordure épaisse à gauche : le repère visuel des portails d'État. */

const ENCARTS = {
  info: { bord: 'border-l-info', fond: 'bg-info-clair', icone: 'info', texte: 'text-info' },
  succes: { bord: 'border-l-succes', fond: 'bg-succes-clair', icone: 'check_circle', texte: 'text-succes' },
  alerte: { bord: 'border-l-alerte', fond: 'bg-alerte-clair', icone: 'warning', texte: 'text-alerte' },
  erreur: { bord: 'border-l-erreur', fond: 'bg-erreur-clair', icone: 'error', texte: 'text-erreur' },
};

export function Encart({ ton = 'info', titre, children }) {
  const style = ENCARTS[ton];
  return (
    <div
      className={`flex gap-3 border-l-4 ${style.bord} ${style.fond} px-4 py-3`}
      role={ton === 'erreur' ? 'alert' : 'status'}
    >
      <Icone nom={style.icone} taille={20} className={`mt-0.5 shrink-0 ${style.texte}`} />
      <div className="text-base text-gris-900">
        {titre && <p className="font-bold">{titre}</p>}
        {children && <div className={titre ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

/* ── En-tête de page ────────────────────────────────────────── */

export function FilAriane({ elements = [] }) {
  if (elements.length === 0) return null;
  return (
    <nav aria-label="Fil d'Ariane" className="mb-3 text-sm text-gris-500">
      <ol className="flex flex-wrap items-center gap-1">
        {elements.map((e, i) => (
          <li key={e.libelle} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {e.chemin && i < elements.length - 1 ? (
              <Link to={e.chemin} className="underline underline-offset-2 hover:text-vert">
                {e.libelle}
              </Link>
            ) : (
              <span aria-current={i === elements.length - 1 ? 'page' : undefined}>{e.libelle}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EnTetePage({ titre, description, fil, children }) {
  return (
    <header className="mb-6 border-b border-gris-300 pb-4">
      <FilAriane elements={fil} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl">{titre}</h1>
          {description && <p className="mt-1 text-base text-gris-500">{description}</p>}
        </div>
        {children && <div className="flex flex-wrap gap-2 sans-impression">{children}</div>}
      </div>
    </header>
  );
}

/* ── Section ────────────────────────────────────────────────── */

export function Section({ titre, description, actions, children }) {
  return (
    <section className="mb-8">
      {(titre || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {titre && <h2 className="text-lg">{titre}</h2>}
            {description && <p className="mt-0.5 text-sm text-gris-500">{description}</p>}
          </div>
          {actions && <div className="flex gap-2 sans-impression">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ── États transverses ──────────────────────────────────────────
   Chargement, vide et erreur sont des composants : les rebricoler dans
   chaque page produirait quinze variantes du même message. */

export function Chargement({ libelle = 'Chargement…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-base text-gris-500">
      <Icone nom="progress_activity" taille={20} />
      {libelle}
    </div>
  );
}

export function EtatVide({ icone = 'inbox', titre, children, action }) {
  return (
    <div className="border border-dashed border-gris-300 bg-white px-6 py-10 text-center">
      <Icone nom={icone} taille={32} className="text-gris-300" />
      <p className="mt-2 text-base font-bold text-gris-900">{titre}</p>
      {/* Un état vide dit ce qu'il faut faire, pas seulement qu'il n'y a rien. */}
      {children && <p className="mx-auto mt-1 max-w-xl text-base text-gris-500">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ── Tableau ────────────────────────────────────────────────────
   Dense, bordé, en-tête figé. `colonnes` décrit la structure ;
   `lignes` fournit les données. */

export function Tableau({
  colonnes,
  lignes,
  cle = (l) => l.id,
  chargement = false,
  vide,
  legende,
}) {
  if (chargement) return <Chargement />;
  if (!lignes || lignes.length === 0) {
    return vide || <EtatVide titre="Aucun élément à afficher." />;
  }

  return (
    <div className="overflow-x-auto border border-gris-300 bg-white">
      <table>
        {legende && <caption className="sr-only">{legende}</caption>}
        <thead>
          <tr className="border-b border-gris-300 bg-gris-100">
            {colonnes.map((c) => (
              <th
                key={c.cle}
                scope="col"
                className={`px-3 py-2 text-sm font-bold text-gris-700 ${
                  c.alignement === 'droite' ? 'text-right' : 'text-left'
                } ${c.classe || ''}`}
              >
                {c.libelle}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, i) => (
            <tr
              key={cle(ligne, i)}
              className={`border-b border-gris-200 last:border-0 ${
                i % 2 === 1 ? 'bg-gris-50' : ''
              } hover:bg-vert-clair/40`}
            >
              {colonnes.map((c) => (
                <td
                  key={c.cle}
                  className={`px-3 py-2 text-sm text-gris-900 ${
                    c.alignement === 'droite' ? 'text-right' : ''
                  } ${c.tabulaire ? 'tabulaire' : ''} ${c.classe || ''}`}
                >
                  {c.rendu ? c.rendu(ligne) : ligne[c.cle]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Formulaire ─────────────────────────────────────────────── */

const CHAMP_BASE =
  'w-full rounded border border-gris-500 bg-white px-3 py-2 text-base text-gris-900 ' +
  'placeholder:text-gris-500 focus:border-vert disabled:bg-gris-100 disabled:text-gris-500';

export function Champ({ label, aide, erreur, requis, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-base font-medium text-gris-900">
        {label}
        {requis && (
          <span className="text-erreur" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {/* L'aide vient AVANT le champ : elle sert à le remplir, pas à
          expliquer après coup pourquoi c'est raté. */}
      {aide && <p className="mt-0.5 text-sm text-gris-500">{aide}</p>}
      <div className="mt-1">{children}</div>
      {erreur && (
        <p className="mt-1 text-sm font-medium text-erreur" role="alert">
          {erreur}
        </p>
      )}
    </div>
  );
}

export function Saisie({ erreur, className = '', ...props }) {
  return (
    <input
      className={`${CHAMP_BASE} ${erreur ? 'border-erreur' : ''} ${className}`}
      aria-invalid={erreur ? 'true' : undefined}
      {...props}
    />
  );
}

export function Liste({ options = [], vide = '—', erreur, className = '', ...props }) {
  return (
    <select
      className={`${CHAMP_BASE} ${erreur ? 'border-erreur' : ''} ${className}`}
      aria-invalid={erreur ? 'true' : undefined}
      {...props}
    >
      {vide !== null && <option value="">{vide}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Zone({ erreur, className = '', ...props }) {
  return (
    <textarea
      rows={3}
      className={`${CHAMP_BASE} ${erreur ? 'border-erreur' : ''} ${className}`}
      aria-invalid={erreur ? 'true' : undefined}
      {...props}
    />
  );
}

/* ── Modale ──────────────────────────────────────────────────── */

export function Modale({ ouvert, titre, onFermer, largeur = 'max-w-2xl', children }) {
  if (!ouvert) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gris-900/50 p-4 sm:p-8"
      onClick={onFermer}
      role="presentation"
    >
      <div
        className={`w-full ${largeur} border border-gris-300 bg-white`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
      >
        <div className="flex items-center justify-between border-b border-gris-300 px-5 py-3">
          <h2 className="text-lg">{titre}</h2>
          <button
            type="button"
            onClick={onFermer}
            className="rounded p-1 text-gris-500 hover:bg-gris-100 hover:text-gris-900"
            aria-label="Fermer"
          >
            <Icone nom="close" taille={20} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Statistique ────────────────────────────────────────────────
   Un chiffre et son libellé. Pas de carte ombrée : un filet suffit. */

export function Chiffre({ libelle, valeur, precision, ton = 'neutre' }) {
  const couleurs = {
    neutre: 'text-gris-900',
    vert: 'text-vert',
    alerte: 'text-alerte',
    erreur: 'text-erreur',
  };
  return (
    <div className="border border-gris-300 bg-white px-4 py-3">
      <p className="text-sm text-gris-500">{libelle}</p>
      <p className={`tabulaire mt-1 text-xl font-bold ${couleurs[ton]}`}>{valeur}</p>
      {precision && <p className="mt-0.5 text-xs text-gris-500">{precision}</p>}
    </div>
  );
}

/* ── Onglets ─────────────────────────────────────────────────── */

export function Onglets({ onglets, actif, onChanger }) {
  return (
    <div className="mb-5 border-b border-gris-300">
      <div role="tablist" className="flex flex-wrap gap-1">
        {onglets.map((o) => {
          const selectionne = o.cle === actif;
          return (
            <button
              key={o.cle}
              type="button"
              role="tab"
              aria-selected={selectionne}
              onClick={() => onChanger(o.cle)}
              className={`-mb-px border-b-2 px-4 py-2 text-base font-medium ${
                selectionne
                  ? 'border-vert text-vert'
                  : 'border-transparent text-gris-500 hover:border-gris-300 hover:text-gris-900'
              }`}
            >
              {o.libelle}
              {o.compteur !== undefined && (
                <span className="tabulaire ml-1.5 text-sm text-gris-500">({o.compteur})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
