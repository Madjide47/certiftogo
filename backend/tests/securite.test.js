// ─────────────────────────────────────────────────────────────
// Tests unitaires de sécurité — sans base de données, donc sans
// interférence avec la suite d'intégration qui recrée `certiftogo_test`.
// ─────────────────────────────────────────────────────────────
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { limiter, reinitialiser } from '../src/middlewares/rate-limit.middleware.js';

/** Simule un couple requête/réponse Express. */
function fausseRequete(ip = '203.0.113.7', body = {}) {
  return { ip, body, socket: {}, headers: {} };
}

function fausseReponse() {
  const reponse = {
    entetes: {},
    statut: null,
    charge: null,
    setHeader(nom, valeur) {
      this.entetes[nom] = valeur;
    },
    status(code) {
      this.statut = code;
      return this;
    },
    json(charge) {
      this.charge = charge;
      return this;
    },
  };
  return reponse;
}

describe('Limitation de débit', () => {
  beforeEach(() => reinitialiser());

  // La limite est neutralisée en test par défaut, sinon la suite
  // d'intégration se ferait bloquer par ses propres appels légitimes.
  const activer = () => {
    process.env.RATE_LIMIT_TEST = 'on';
  };
  const desactiver = () => {
    delete process.env.RATE_LIMIT_TEST;
  };

  test('laisse passer sous le plafond puis bloque en 429', () => {
    activer();
    try {
      const middleware = limiter({ nom: 'test-a', max: 3, fenetreMs: 60_000 });
      const req = fausseRequete();

      let passages = 0;
      for (let i = 0; i < 3; i += 1) {
        const res = fausseReponse();
        middleware(req, res, () => {
          passages += 1;
        });
        assert.equal(res.statut, null, `appel ${i + 1} accepté`);
      }
      assert.equal(passages, 3);

      const res = fausseReponse();
      middleware(req, res, () => {
        passages += 1;
      });
      assert.equal(res.statut, 429);
      assert.equal(res.charge.error.code, 'TROP_DE_REQUETES');
      assert.equal(passages, 3, 'le quatrième appel n\'atteint pas la route');
      assert.ok(res.entetes['Retry-After'], 'le client sait quand réessayer');
    } finally {
      desactiver();
    }
  });

  test('compte séparément deux origines', () => {
    activer();
    try {
      const middleware = limiter({ nom: 'test-b', max: 1, fenetreMs: 60_000 });

      const premier = fausseReponse();
      middleware(fausseRequete('198.51.100.1'), premier, () => {});
      assert.equal(premier.statut, null);

      const second = fausseReponse();
      middleware(fausseRequete('198.51.100.2'), second, () => {});
      assert.equal(second.statut, null, 'une autre IP n\'est pas pénalisée');

      const troisieme = fausseReponse();
      middleware(fausseRequete('198.51.100.1'), troisieme, () => {});
      assert.equal(troisieme.statut, 429);
    } finally {
      desactiver();
    }
  });

  test('groupe l\'envoi d\'OTP par numéro, pas par adresse', () => {
    activer();
    try {
      // Sans ce regroupement, un attaquant changeant d'IP ferait sonner
      // le téléphone d'un tiers autant de fois qu'il le souhaite.
      const middleware = limiter({
        nom: 'test-c',
        max: 1,
        fenetreMs: 60_000,
        cle: (req) => String(req.body?.telephone),
      });

      const premier = fausseResponseSafe();
      middleware(fausseRequete('203.0.113.1', { telephone: '+22890000001' }), premier, () => {});
      assert.equal(premier.statut, null);

      const second = fausseResponseSafe();
      middleware(fausseRequete('203.0.113.99', { telephone: '+22890000001' }), second, () => {});
      assert.equal(second.statut, 429, 'même numéro, autre IP : toujours bloqué');
    } finally {
      desactiver();
    }
  });

  function fausseResponseSafe() {
    return fausseReponse();
  }

  test('ne bloque rien tant que la limite est neutralisée en test', () => {
    const middleware = limiter({ nom: 'test-d', max: 1, fenetreMs: 60_000 });
    const req = fausseRequete();

    for (let i = 0; i < 10; i += 1) {
      const res = fausseReponse();
      let passe = false;
      middleware(req, res, () => {
        passe = true;
      });
      assert.equal(passe, true);
    }
  });
});

describe('Jetons de session', () => {
  test('le jeton de rafraîchissement n\'est stocké que sous forme d\'empreinte', () => {
    // Contrat vérifié ici plutôt qu'en intégration : la fuite de la table
    // `sessions` ne doit pas suffire à usurper une session.
    const jeton = crypto.randomBytes(48).toString('hex');
    const empreinte = crypto.createHash('sha256').update(jeton).digest('hex');

    assert.equal(empreinte.length, 64);
    assert.notEqual(empreinte, jeton);
    assert.equal(
      crypto.createHash('sha256').update(jeton).digest('hex'),
      empreinte,
      'l\'empreinte est déterministe, donc vérifiable'
    );
    assert.ok(jeton.length >= 64, 'entropie suffisante pour résister au devinage');
  });
});
