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
import demandeRoutes from './routes/demande.routes.js';
import referentielRoutes from './routes/referentiel.routes.js';
import structureRoutes from './routes/structure.routes.js';
import promotionRoutes from './routes/promotion.routes.js';
import lotRoutes from './routes/lot.routes.js';
import pieceRoutes from './routes/piece.routes.js';
import { journalRouter, corbeilleRouter } from './routes/journal.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import tableauBordRoutes from './routes/tableau-bord.routes.js';
import { recuperationRouter, departRouter, clesRouter } from './routes/exceptions.routes.js';
import { metriques } from './middlewares/metriques.middleware.js';
import { contexteRequete } from './config/contexte.js';
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

// Contexte de requête : transporte auteur, IP et user-agent jusqu'aux
// services, sans polluer leurs signatures. Doit précéder les routes.
app.set('trust proxy', 1);
// Mesure des temps de réponse : doit envelopper les routes, donc venir tôt.
app.use(metriques);
app.use(contexteRequete);

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
app.use('/api/demandes-integration', demandeRoutes);
app.use('/api/referentiel', referentielRoutes);
app.use('/api/structure', structureRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/pieces', pieceRoutes);
app.use('/api/journal', journalRouter);
app.use('/api/corbeille', corbeilleRouter);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tableau-bord', tableauBordRoutes);
app.use('/api/recuperation', recuperationRouter);
app.use('/api/agents', departRouter);
app.use('/api/admin/cles', clesRouter);

// ── Gestion des erreurs (toujours en dernier) ──────────────────────
app.use(nonTrouve);
app.use(gestionErreurs);

// ── Démarrage du serveur ───────────────────────────────────────────
// En mode test (supertest), on n'ouvre pas de port : l'app est importée telle quelle.
/**
 * Worker d'ancrage : vide la file au rythme du réseau blockchain.
 *
 * Intégré au processus applicatif tant qu'un service dédié n'est pas
 * justifié (voir chapitre 37 : `ancrage` est le premier candidat à
 * l'extraction). `unref()` pour ne pas empêcher l'arrêt du processus.
 */
function demarrerWorkerAncrage() {
  const intervalle = Number(process.env.ANCRAGE_INTERVALLE_MS || 30_000);
  if (process.env.ANCRAGE_WORKER === 'off') {
    logger.info("Worker d'ancrage désactivé (ANCRAGE_WORKER=off).");
    return;
  }

  const minuteur = setInterval(async () => {
    try {
      const { traiterTranche } = await import('./services/ancrage.service.js');
      const bilan = await traiterTranche();
      if (bilan.traitees > 0) {
        logger.info(
          `[ancrage] ${bilan.confirmees} confirmée(s), ${bilan.echouees} en échec sur ${bilan.traitees}.`
        );
      }
    } catch (err) {
      // Le worker ne doit jamais faire tomber le serveur.
      logger.error(`[ancrage] Tranche en échec : ${err.message}`);
    }
  }, intervalle);

  minuteur.unref?.();
  logger.info(`Worker d'ancrage actif (toutes les ${intervalle / 1000} s).`);
}

/**
 * Défaillances hors requête HTTP.
 *
 * Une promesse rejetée dans un worker, un minuteur ou un flux ne passe
 * par aucun middleware : sans ces gardes, elle tue le processus sans que
 * rien n'en garde trace, et l'API disparaît en silence. On journalise
 * toujours ; on ne quitte que sur `uncaughtException`, où l'état du
 * processus n'est plus fiable — et en laissant au superviseur (Render,
 * systemd, Docker) le soin de relancer.
 */
function surveillerLeProcessus() {
  process.on('unhandledRejection', (raison) => {
    logger.error('Promesse rejetée sans traitement :', raison?.stack || raison);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Exception non capturée :', err?.stack || err?.message);
    // Un arrêt propre vaut mieux qu'un processus dans un état inconnu qui
    // continuerait à certifier des diplômes.
    setTimeout(() => process.exit(1), 100).unref?.();
  });
}

if (process.env.NODE_ENV !== 'test') {
  surveillerLeProcessus();
  demarrerWorkerAncrage();
  app.listen(PORT, () => {
    logger.info(`API CertifTOGO démarrée sur http://localhost:${PORT}`);
    logger.info(`Environnement : ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
