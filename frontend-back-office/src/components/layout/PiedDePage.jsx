// ─────────────────────────────────────────────────────────────
// Pied de page — colonnes logiques, comme sur les portails de
// l'administration : navigation, informations juridiques, contact.
//
// Sur un service public, le pied de page n'est pas un espace résiduel :
// c'est là que se trouvent les mentions légales et le recours.
// ─────────────────────────────────────────────────────────────
const PUBLIC = adressePublique();

const COLONNES = [
  {
    titre: 'Le service',
    liens: [
      { libelle: 'Vérifier un diplôme', href: PUBLIC, externe: true },
      { libelle: 'Demander une intégration', href: `${PUBLIC}/integration`, externe: true },
    ],
  },
  {
    titre: 'Informations',
    liens: [
      { libelle: 'Mentions légales', href: '#mentions' },
      { libelle: 'Protection des données', href: '#donnees' },
      { libelle: 'Accessibilité : non conforme', href: '#accessibilite' },
    ],
  },
  {
    titre: 'Assistance',
    liens: [
      { libelle: 'Aide et procédures', href: '#aide' },
      { libelle: 'Contacter le ministère', href: 'mailto:contact@mesr.gouv.tg' },
    ],
  },
];

export default function PiedDePage() {
  return (
    <footer className="sans-impression mt-8 border-t-2 border-vert bg-white">
      <div className="mx-auto max-w-contenu px-5 py-8 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-base font-bold text-gris-900">CertifTOGO</p>
            <p className="mt-1 text-sm text-gris-500">
              Ministère de l'Enseignement Supérieur
              <br />
              République Togolaise
            </p>
          </div>

          {COLONNES.map((colonne) => (
            <nav key={colonne.titre} aria-label={colonne.titre}>
              <p className="text-sm font-bold uppercase tracking-wide text-gris-700">
                {colonne.titre}
              </p>
              <ul className="mt-2 space-y-1.5">
                {colonne.liens.map((lien) => (
                  <li key={lien.libelle}>
                    <a
                      href={lien.href}
                      className="text-sm text-gris-700 underline underline-offset-2 hover:text-vert"
                      {...(lien.externe ? { target: '_blank', rel: 'noreferrer' } : {})}
                    >
                      {lien.libelle}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-6 border-t border-gris-200 pt-4 text-xs text-gris-500">
          Plateforme nationale de certification et de traçabilité des diplômes. Les diplômes
          certifiés sont ancrés sur une chaîne de blocs publique et vérifiables par tout tiers,
          sans compte.
        </p>
      </div>
    </footer>
  );
}
