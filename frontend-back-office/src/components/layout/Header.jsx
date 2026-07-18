// ─────────────────────────────────────────────────────────────
// En-tête slim (verre dépoli) : contexte de l'espace + notifications.
// L'identité utilisateur et la déconnexion vivent dans la Sidebar.
// ─────────────────────────────────────────────────────────────
import { useAuth } from '../../contexts/AuthContext.jsx';
import { LIBELLES_ROLES } from '../../config/navigation.js';
import Icon from '../ui/Icon.jsx';

export default function Header() {
  const { utilisateur } = useAuth();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-outline-variant/30 bg-white/80 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
        <Icon name="apartment" size={18} />
        Espace {LIBELLES_ROLES[utilisateur?.role]}
      </div>

      <button
        title="Notifications"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/30 bg-white text-on-surface-variant transition-colors hover:text-primary"
      >
        <Icon name="notifications" size={22} />
      </button>
    </header>
  );
}
