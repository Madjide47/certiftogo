// Préchargé via `node --import` : fixe l'environnement de test AVANT que
// src/config/database.js ne lise les variables (dotenv n'écrase pas l'existant).
process.env.NODE_ENV = 'test';
process.env.PGDATABASE = 'certiftogo_test';
process.env.PGPORT = process.env.PGPORT || '5433';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.BLOCKCHAIN_MODE = 'mock';
// Aucun appel réseau vers Meta pendant les tests.
process.env.WHATSAPP_MODE = 'mock';
// Secret de signature déterministe (aucune valeur par défaut dans le code).
process.env.MINISTERE_SIGNING_SECRET =
  process.env.MINISTERE_SIGNING_SECRET || 'secret_de_test_signature_ministere';
