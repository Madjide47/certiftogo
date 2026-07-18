// ─────────────────────────────────────────────────────────────
// Contrôleur d'authentification — gère requêtes/réponses HTTP.
// La logique métier est déléguée au service d'auth.
// Format de réponse cohérent :
//   Succès : { success: true, data: {...} }
//   Erreur : { success: false, error: { code, message } }
// ─────────────────────────────────────────────────────────────
import * as authService from '../services/auth.service.js';
import * as utilisateurModel from '../models/utilisateur.model.js';
import { normaliserTelephone, estTelephoneValide, estCodeOtpValide } from '../utils/validators.js';

/**
 * POST /api/auth/request-otp
 * Body : { telephone }
 */
export async function demanderOtp(req, res, next) {
  try {
    const telephone = normaliserTelephone(req.body?.telephone || '');

    if (!estTelephoneValide(telephone)) {
      return res.status(400).json({
        success: false,
        error: { code: 'TELEPHONE_INVALIDE', message: 'Numéro de téléphone invalide.' },
      });
    }

    const data = await authService.demanderOtp(telephone);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/verify-otp
 * Body : { telephone, code }
 */
export async function verifierOtp(req, res, next) {
  try {
    const telephone = normaliserTelephone(req.body?.telephone || '');
    const code = String(req.body?.code || '').trim();

    if (!estTelephoneValide(telephone)) {
      return res.status(400).json({
        success: false,
        error: { code: 'TELEPHONE_INVALIDE', message: 'Numéro de téléphone invalide.' },
      });
    }
    if (!estCodeOtpValide(code)) {
      return res.status(400).json({
        success: false,
        error: { code: 'CODE_FORMAT_INVALIDE', message: 'Le code doit contenir 6 chiffres.' },
      });
    }

    const data = await authService.verifierOtp(telephone, code);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me  (protégée)
 * Renvoie les infos de l'utilisateur connecté (issu du JWT).
 */
export async function moi(req, res, next) {
  try {
    const utilisateur = await utilisateurModel.trouverParId(req.utilisateur.utilisateur_id);
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        error: { code: 'UTILISATEUR_INTROUVABLE', message: 'Utilisateur introuvable.' },
      });
    }
    return res.status(200).json({
      success: true,
      data: { utilisateur: authService.formaterUtilisateur(utilisateur) },
    });
  } catch (err) {
    return next(err);
  }
}
