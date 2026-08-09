// ─────────────────────────────────────────────────────────────
// Emblème du service — cercle vert frappé d'une étoile à cinq branches.
//
// L'en-tête portait une icône générique « verified » dans un carré vert :
// le pictogramme d'une application, pas la marque d'un État. Les portails
// publics mènent avec l'autorité émettrice, pas avec un logo produit.
//
// C'est EXACTEMENT le tracé du diplôme imprimé (`pdf.service.js`) : mêmes
// rayons, même étoile, mêmes couleurs. Un titulaire qui compare son PDF à
// l'écran de vérification doit reconnaître la même marque — c'est le
// genre de continuité qui fait la différence entre un service officiel et
// une contrefaçon plausible.
//
// Dessiné en vectoriel, sans fichier : une image absente du serveur casse
// en production et jamais en développement. Et sans usurper le sceau de
// l'État, qui ne s'emprunte pas.
// ─────────────────────────────────────────────────────────────

/** Points de l'étoile, calculés une fois — cinq branches, rayon 11. */
const ETOILE =
  '20.00,9.00 22.69,16.29 30.46,16.60 24.36,21.42 26.47,28.90 ' +
  '20.00,24.58 13.53,28.90 15.64,21.42 9.54,16.60 17.31,16.29';

export default function Embleme({ taille = 36, className = '' }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 40 40"
      className={className}
      // Décoratif : le nom du service est écrit juste à côté. L'annoncer
      // ferait dire deux fois la même chose à un lecteur d'écran.
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="20" cy="20" r="18" fill="#006a4e" />
      <circle cx="20" cy="20" r="15" fill="none" stroke="#ffce00" strokeWidth="1" />
      <polygon points={ETOILE} fill="#ffce00" />
    </svg>
  );
}
