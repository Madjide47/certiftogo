// Surface carte standard du design system.
export default function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={`rounded-2xl border border-outline-variant/25 bg-white shadow-soft ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
