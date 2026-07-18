// ─────────────────────────────────────────────────────────────
// Composant OTPInput : 6 cases séparées pour saisir le code.
// Gère : saisie auto-avance, retour arrière, flèches ←/→,
// collage (paste), focus initial, état d'erreur.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

const NB_CASES = 6;

export default function OTPInput({ valeur, onChange, disabled = false, erreur = false, autoFocus = true }) {
  const refs = useRef([]);

  // Représente le code sous forme de tableau de caractères de longueur fixe.
  const chiffres = valeur.padEnd(NB_CASES, ' ').slice(0, NB_CASES).split('');

  // Focus sur la première case vide à l'affichage.
  useEffect(() => {
    if (autoFocus && !disabled) {
      refs.current[Math.min(valeur.length, NB_CASES - 1)]?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, disabled]);

  function majChiffre(index, char) {
    const tab = valeur.padEnd(NB_CASES, ' ').split('');
    tab[index] = char;
    onChange(tab.join('').replace(/\s/g, ''));
  }

  function handleChange(index, e) {
    const saisie = e.target.value.replace(/\D/g, '');
    if (!saisie) return;
    if (saisie.length > 1) {
      // Plusieurs chiffres d'un coup (autocomplétion mobile, saisie rapide).
      onChange(saisie.slice(0, NB_CASES));
      refs.current[Math.min(saisie.length, NB_CASES - 1)]?.focus();
      return;
    }
    majChiffre(index, saisie);
    if (index < NB_CASES - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const tab = valeur.padEnd(NB_CASES, ' ').split('');
      if (tab[index] && tab[index] !== ' ') {
        majChiffre(index, ' ');
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        majChiffre(index - 1, ' ');
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < NB_CASES - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const colle = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, NB_CASES);
    if (colle) {
      onChange(colle);
      refs.current[Math.min(colle.length, NB_CASES - 1)]?.focus();
    }
  }

  const bordure = erreur
    ? 'border-error focus:border-error focus:ring-error/20'
    : 'border-outline-variant/60 focus:border-primary focus:ring-primary/20';

  return (
    <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
      {Array.from({ length: NB_CASES }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={NB_CASES}
          disabled={disabled}
          aria-label={`Chiffre ${i + 1} du code`}
          value={chiffres[i] === ' ' ? '' : chiffres[i]}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={`h-14 w-11 rounded-xl border-2 bg-white text-center font-display text-2xl font-bold
                      text-on-surface transition-colors focus:outline-none focus:ring-4 sm:h-16 sm:w-12
                      disabled:bg-surface-container-low disabled:text-outline ${bordure}`}
        />
      ))}
    </div>
  );
}
