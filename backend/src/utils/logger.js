// ─────────────────────────────────────────────────────────────
// Logger minimal et centralisé (console pour l'instant).
// Facile à remplacer plus tard par winston/pino si besoin.
// ─────────────────────────────────────────────────────────────
function horodatage() {
  return new Date().toISOString();
}

export const logger = {
  info: (...args) => console.log(`[${horodatage()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${horodatage()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${horodatage()}] [ERROR]`, ...args),
};

export default logger;
