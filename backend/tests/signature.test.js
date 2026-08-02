// ─────────────────────────────────────────────────────────────
// Tests du service de signature.
// Le secret est résolu à l'import : chaque scénario fixe l'environnement
// puis réimporte le module avec une URL unique (contournement du cache ESM).
// ─────────────────────────────────────────────────────────────
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

let compteur = 0;

/** Importe une instance neuve du service avec l'environnement donné. */
async function chargerService(env = {}) {
  const sauvegarde = { ...process.env };
  for (const [cle, valeur] of Object.entries(env)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  try {
    return await import(`../src/services/signature.service.js?t=${++compteur}`);
  } finally {
    process.env = sauvegarde;
  }
}

const HASH = 'a'.repeat(64);

describe('Signature — secret fourni', () => {
  test('signe de façon déterministe et vérifie sa propre signature', async () => {
    const mod = await chargerService({
      MINISTERE_SIGNING_SECRET: 'un_secret_suffisamment_long',
      NODE_ENV: 'test',
    });

    const s1 = mod.signer(HASH);
    const s2 = mod.signer(HASH);

    assert.equal(s1, s2, 'la signature doit être stable');
    assert.match(s1, /^[0-9a-f]{64}$/);
    assert.equal(mod.verifier(HASH, s1), true);
  });

  test('rejette une signature falsifiée ou malformée', async () => {
    const mod = await chargerService({
      MINISTERE_SIGNING_SECRET: 'un_secret_suffisamment_long',
      NODE_ENV: 'test',
    });

    assert.equal(mod.verifier(HASH, 'b'.repeat(64)), false);
    assert.equal(mod.verifier(HASH, ''), false);
    assert.equal(mod.verifier(HASH, undefined), false);
    assert.equal(mod.verifier(HASH, 'trop_court'), false);
  });

  test('deux secrets différents produisent des signatures différentes', async () => {
    const a = await chargerService({
      MINISTERE_SIGNING_SECRET: 'premier_secret_de_test_long',
      NODE_ENV: 'test',
    });
    const b = await chargerService({
      MINISTERE_SIGNING_SECRET: 'second_secret_de_test_long',
      NODE_ENV: 'test',
    });

    assert.notEqual(a.signer(HASH), b.signer(HASH));
    // Une signature d'un secret ne doit pas passer la vérification de l'autre.
    assert.equal(b.verifier(HASH, a.signer(HASH)), false);
  });
});

describe('Signature — secret absent ou faible', () => {
  test('refuse de démarrer en production sans secret', async () => {
    await assert.rejects(
      () => chargerService({ MINISTERE_SIGNING_SECRET: undefined, NODE_ENV: 'production' }),
      (err) => {
        assert.match(err.message, /MINISTERE_SIGNING_SECRET est absent/);
        return true;
      }
    );
  });

  test('refuse de démarrer en production avec un secret trop court', async () => {
    await assert.rejects(
      () => chargerService({ MINISTERE_SIGNING_SECRET: 'court', NODE_ENV: 'production' }),
      (err) => {
        assert.match(err.message, /moins de 16 caractères/);
        return true;
      }
    );
  });

  test('hors production : secret éphémère, différent à chaque chargement', async () => {
    const a = await chargerService({ MINISTERE_SIGNING_SECRET: undefined, NODE_ENV: 'test' });
    const b = await chargerService({ MINISTERE_SIGNING_SECRET: undefined, NODE_ENV: 'test' });

    // Le service reste fonctionnel…
    assert.equal(a.verifier(HASH, a.signer(HASH)), true);
    // …mais aucun secret constant n'est partagé entre deux démarrages.
    assert.notEqual(a.signer(HASH), b.signer(HASH));
  });

  test("l'ancien secret codé en dur ne signe plus rien", async () => {
    const mod = await chargerService({
      MINISTERE_SIGNING_SECRET: 'un_secret_suffisamment_long',
      NODE_ENV: 'test',
    });

    // Signature qu'aurait produite l'ancienne valeur de repli publique.
    const crypto = await import('node:crypto');
    const ancienne = crypto
      .createHmac('sha256', 'certiftogo_ministere_dev_secret')
      .update(HASH, 'utf8')
      .digest('hex');

    assert.equal(mod.verifier(HASH, ancienne), false);
  });
});
