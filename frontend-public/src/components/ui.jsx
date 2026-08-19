// ─────────────────────────────────────────────────────────────
// Socle du front public — mêmes jetons que le back-office.
//
// Volontairement plus petit : ce site n'a que deux écrans. Mais il
// partage la même grammaire visuelle, parce qu'un citoyen qui arrive par
// un QR code doit reconnaître l'État, pas découvrir un site différent.
// ─────────────────────────────────────────────────────────────

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

const TONS_ENCART = {
  info: { bord: 'border-l-info', fond: 'bg-info-clair', icone: 'info', texte: 'text-info' },
  succes: { bord: 'border-l-succes', fond: 'bg-succes-clair', icone: 'check_circle', texte: 'text-succes' },
  alerte: { bord: 'border-l-alerte', fond: 'bg-alerte-clair', icone: 'warning', texte: 'text-alerte' },
  erreur: { bord: 'border-l-erreur', fond: 'bg-erreur-clair', icone: 'error', texte: 'text-erreur' },
};

export function Encart({ ton = 'info', titre, children }) {
  const style = TONS_ENCART[ton];
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

const VARIANTES = {
  primaire: 'bg-vert text-white hover:bg-vert-fonce',
  secondaire: 'border border-vert bg-white text-vert hover:bg-vert-clair',
  neutre: 'border border-gris-300 bg-white text-gris-900 hover:bg-gris-100',
};

export function Bouton({ variante = 'primaire', icone, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded px-4 py-2.5 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {icone && <Icone nom={icone} taille={18} />}
      {children}
    </button>
  );
}

// ── Saisie ─────────────────────────────────────────────────────────
// Le site n'avait qu'un champ, écrit à la main dans la page. Depuis qu'un
// établissement peut y déposer une demande d'intégration, il en a vingt :
// les répéter en ligne produirait vingt variantes du même bord gris.

const CHAMP_BASE =
  'w-full rounded border border-gris-500 bg-white px-3 py-2.5 text-base text-gris-900 ' +
  'placeholder:text-gris-500 focus:border-vert disabled:bg-gris-100 disabled:text-gris-500';

/** Étiquette + aide + champ. L'aide précède la saisie : elle sert à remplir. */
export function ChampSaisie({ label, htmlFor, aide, requis, children }) {
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
      {aide && <p className="mt-0.5 text-sm text-gris-500">{aide}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function Saisie({ className = '', ...props }) {
  return <input className={`${CHAMP_BASE} ${className}`} {...props} />;
}

export function Zone({ className = '', rows = 4, ...props }) {
  return <textarea rows={rows} className={`${CHAMP_BASE} ${className}`} {...props} />;
}

export function Liste({ options = [], vide = '—', className = '', ...props }) {
  return (
    <select className={`${CHAMP_BASE} ${className}`} {...props}>
      {vide !== null && <option value="">{vide}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Couple libellé / valeur d'un acte administratif. */
export function Champ({ label, valeur, large }) {
  if (!valeur) return null;
  return (
    <div className={large ? 'sm:col-span-2' : ''}>
      <dt className="text-sm text-gris-500">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-gris-900">{valeur}</dd>
    </div>
  );
}
