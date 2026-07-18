// ─────────────────────────────────────────────────────────────
// Icône Material Symbols (police chargée dans index.html).
//   <Icon name="dashboard" /> · <Icon name="check" filled size={28} />
// ─────────────────────────────────────────────────────────────
export default function Icon({ name, filled = false, size, className = '', style }) {
  return (
    <span
      className={`material-symbols-outlined${filled ? ' filled' : ''} ${className}`}
      style={{ ...(size ? { fontSize: `${size}px` } : null), ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
