// ─────────────────────────────────────────────────────────────
// Frontière d'erreur React.
//
// Sans elle, une exception pendant le rendu démonte l'arbre entier : la
// page devient blanche, sans message ni bouton. L'agent ne peut ni
// comprendre, ni signaler, ni revenir en arrière — et sur un poste de
// scolarité, cela se traduit par « l'application ne marche plus ».
//
// Le composant ne prétend pas réparer : il rend l'incident lisible et
// laisse une porte de sortie.
// ─────────────────────────────────────────────────────────────
import { Component } from 'react';

export default class FrontiereErreur extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, infos) {
    // Trace console : c'est ce que l'agent enverra au support.
    // eslint-disable-next-line no-console
    console.error('[CertifTOGO] Erreur d’affichage :', erreur, infos?.componentStack);
  }

  render() {
    if (!this.state.erreur) return this.props.children;

    return (
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="border-l-4 border-l-erreur bg-erreur-clair px-5 py-4">
          <h1 className="text-xl">L’écran n’a pas pu s’afficher</h1>
          <p className="mt-2 text-base text-gris-900">
            Une erreur est survenue pendant l’affichage. Vos données ne sont pas perdues : rien
            n’a été enregistré par cette page.
          </p>
          <p className="mt-2 text-sm text-gris-700">
            Détail technique : <code className="font-mono">{this.state.erreur?.message || '—'}</code>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 border border-vert bg-vert px-4 py-2 text-base font-medium text-white hover:bg-vert-fonce"
          >
            Recharger l’écran
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/';
            }}
            className="inline-flex items-center gap-2 border border-gris-500 bg-white px-4 py-2 text-base font-medium text-gris-900 hover:bg-gris-100"
          >
            Revenir au tableau de bord
          </button>
        </div>
      </div>
    );
  }
}
