// Icône Material Symbols (police chargée dans index.html).
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
