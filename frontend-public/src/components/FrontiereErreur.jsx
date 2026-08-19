// ─────────────────────────────────────────────────────────────
// Frontière d'erreur du front public.
//
// C'est ici que ça compte le plus : un employeur qui vérifie un diplôme
// n'a ni compte, ni support, ni raison de réessayer. Une page blanche lui
// dit « ce diplôme n'est pas vérifiable », ce qui est faux et grave.
//
// Styles en ligne, volontairement : si la feuille de styles est la cause
// de l'incident, le message doit rester lisible.
// ─────────────────────────────────────────────────────────────
import { Component } from 'react';

const CADRE = {
  maxWidth: '38rem',
  margin: '3rem auto',
  padding: '1.5rem',
  border: '1px solid #d1d5db',
  borderLeft: '4px solid #b91c1c',
  background: '#fff',
  fontFamily: 'system-ui, sans-serif',
  color: '#111827',
};

const BOUTON = {
  marginTop: '1rem',
  padding: '0.5rem 1rem',
  border: '1px solid #006a4e',
  background: '#006a4e',
  color: '#fff',
  fontSize: '1rem',
  cursor: 'pointer',
};

export default class FrontiereErreur extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, infos) {
    // eslint-disable-next-line no-console
    console.error('[CertifTOGO] Erreur d’affichage :', erreur, infos?.componentStack);
  }

  render() {
    if (!this.state.erreur) return this.props.children;

    return (
      <div style={CADRE}>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Le service de vérification est momentanément indisponible</h1>
        <p style={{ marginTop: '0.75rem' }}>
          Cette page n’a pas pu s’afficher. Cela ne dit rien du diplôme que vous vérifiez :
          réessayez dans un instant.
        </p>
        <button type="button" style={BOUTON} onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </div>
    );
  }
}
