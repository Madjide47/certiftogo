/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────
// Jetons de design — registre « service public ».
//
// Trois règles qui gouvernent tout le reste :
//
//  1. UNE couleur primaire (le vert du drapeau togolais), une échelle de
//     gris, quatre couleurs d'état. Rien d'autre. Une interface
//     administrative qui multiplie les couleurs perd sa lisibilité et son
//     autorité.
//
//  2. UNE famille typographique, quatre tailles. La hiérarchie se fait par
//     la graisse et l'espacement, pas par la variété.
//
//  3. AUCUNE ombre portée, aucun dégradé, aucune animation décorative. La
//     séparation se fait par des filets de 1 px. C'est ce qui distingue un
//     portail d'État d'une application grand public.
//
// Références : DSFR (France), GOV.UK Design System.
// ─────────────────────────────────────────────────────────────

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // On REMPLACE l'échelle par défaut plutôt que de l'étendre : laisser
    // les vingt-deux couleurs de Tailwind disponibles garantit qu'elles
    // finiront par être utilisées.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',

      // Primaire — vert du drapeau togolais.
      vert: {
        DEFAULT: '#006a4e',
        fonce: '#00432f',
        clair: '#e8f2ee',
      },
      // Accent d'État, réservé au bandeau officiel et aux liserés.
      jaune: {
        DEFAULT: '#ffce00',
        fonce: '#8a6d00',
        clair: '#fff6d6',
      },
      // Rouge du drapeau. Réservé au FILET TRICOLORE, jamais à un état :
      // `erreur` est la seule couleur qui signifie qu'quelque chose ne va
      // pas. Confondre les deux ferait lire une alerte dans un liseré
      // décoratif — ou l'inverse, ce qui est pire.
      rouge: {
        DEFAULT: '#d21034',
      },

      // Échelle de gris — la structure de l'interface.
      gris: {
        900: '#16191d', // texte principal
        700: '#3a3f45', // texte secondaire
        500: '#6a7178', // libellés, méta
        300: '#d5d8dc', // filets, bordures
        200: '#e5e7ea', // bordures légères
        100: '#f2f3f4', // fonds alternés
        50: '#f7f8f9', // fond de page
      },

      // États — quatre, pas davantage.
      succes: { DEFAULT: '#18753c', clair: '#e3f4e9' },
      alerte: { DEFAULT: '#b34000', clair: '#fdf0e8' },
      erreur: { DEFAULT: '#ce0500', clair: '#fdeae9' },
      info: { DEFAULT: '#0063cb', clair: '#e8f1fc' },
    },

    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    },

    // Quatre tailles utiles, plus une pour les mentions.
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1.1rem' }], // 12 — mentions, méta
      sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13 — tableaux
      base: ['0.875rem', { lineHeight: '1.375rem' }], // 14 — corps
      lg: ['1.125rem', { lineHeight: '1.5rem' }], // 18 — titre de section
      xl: ['1.5rem', { lineHeight: '1.875rem' }], // 24 — titre de page
    },

    borderRadius: {
      none: '0',
      DEFAULT: '2px',
      md: '4px',
      full: '9999px',
    },

    // Pas d'ombre portée : seul l'anneau de focus subsiste, parce qu'il
    // est fonctionnel et non décoratif.
    boxShadow: {
      none: 'none',
      focus: '0 0 0 2px #ffffff, 0 0 0 4px #0063cb',
    },

    extend: {
      spacing: { 18: '4.5rem', 72: '18rem' },
      maxWidth: { contenu: '78rem' },
    },
  },
  plugins: [],
};
