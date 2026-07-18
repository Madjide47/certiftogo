// Pastille de statut (pill). La couleur est passée via className.
export default function Badge({ className = '', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}
