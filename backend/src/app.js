// ─────────────────────────────────────────────────────────────
// Point d'entrée de l'API CertifTOGO (Express).
// Configure les middlewares globaux, monte les routes et démarre
// le serveur HTTP.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { verifierConnexion } from './config/database.js';
import { logger } from './utils/logger.js';
import { nonTrouve, gestionErreurs } from './middlewares/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import candidatRoutes from './routes/candidat.routes.js';
import dossierRoutes from './routes/dossier.routes.js';
import statistiquesRoutes from './routes/statistiques.routes.js';
import ministereRoutes from './routes/ministere.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import portefeuilleRoutes from './routes/portefeuille.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { UPLOADS_DIR, UPLOADS_URL_PREFIX, assurerDossierUploads } from './config/storage.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// ── Middlewares globaux ────────────────────────────────────────────
app.use(helmet());

const originsAutorisees = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());
app.use(cors({ origin: originsAutorisees, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Fichiers générés (PDF de diplômes, QR codes) servis en statique.
assurerDossierUploads();
app.use(UPLOADS_URL_PREFIX, express.static(UPLOADS_DIR));

// ── Route de santé ─────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const dbOk = await verifierConnexion();
    return res.json({ success: true, data: { status: 'ok', db: dbOk } });
  } catch {
    return res.status(503).json({
      success: false,
      error: { code: 'DB_INDISPONIBLE', message: 'Base de données injoignable.' },
    });
  }
});

// ── Routes de l'API ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/candidats', candidatRoutes);
app.use('/api/dossiers', dossierRoutes);
app.use('/api/statistiques', statistiquesRoutes);
app.use('/api/ministere', ministereRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/candidat', portefeuilleRoutes);
app.use('/api/admin', adminRoutes);

// ── Gestion des erreurs (toujours en dernier) ──────────────────────
app.use(nonTrouve);
app.use(gestionErreurs);

// ── Démarrage du serveur ───────────────────────────────────────────
// En mode test (supertest), on n'ouvre pas de port : l'app est importée telle quelle.
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`API CertifTOGO démarrée sur http://localhost:${PORT}`);
    logger.info(`Environnement : ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
