// ─────────────────────────────────────────────────────────────
// Tests du service d'envoi WhatsApp (mode mock et mode cloud).
// Le service lit sa configuration à l'import : chaque scénario fixe
// l'environnement puis réimporte le module avec une URL unique pour
// contourner le cache ESM. `fetch` est remplacé par un doublure.
// ─────────────────────────────────────────────────────────────
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

let compteur = 0;

/** Importe une instance neuve du service avec l'environnement donné. */
async function chargerService(env = {}) {
  const anciennes = {};
  for (const [cle, valeur] of Object.entries(env)) {
    anciennes[cle] = process.env[cle];
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  const mod = await import(`../src/services/whatsapp.service.js?t=${++compteur}`);
  return { mod, anciennes };
}

const fetchOrigine = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOrigine;
});

/** Doublure de fetch : mémorise l'appel et renvoie la réponse fournie. */
function doublureFetch({ ok = true, status = 200, corps = {} } = {}) {
  const appels = [];
  globalThis.fetch = async (url, options) => {
    appels.push({ url, options, body: JSON.parse(options.body) });
    return { ok, status, json: async () => corps };
  };
  return appels;
}

describe('WhatsApp — mode mock', () => {
  test("n'effectue aucun appel réseau et signale mock:true", async () => {
    const { mod } = await chargerService({ WHATSAPP_MODE: 'mock' });
    let appele = false;
    globalThis.fetch = async () => {
      appele = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const res = await mod.envoyerCodeOtp('+22890000001', '123456');

    assert.equal(res.success, true);
    assert.equal(res.mock, true);
    assert.equal(appele, false, 'aucun appel réseau ne doit partir en mode mock');
    assert.equal(mod.estActif(), false);
  });
});

describe('WhatsApp — mode cloud', () => {
  const envCloud = {
    WHATSAPP_MODE: 'cloud',
    WHATSAPP_TOKEN: 'jeton_test',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_TEMPLATE_NOM: 'certiftogo_code_otp',
    WHATSAPP_TEMPLATE_LANGUE: 'fr',
    WHATSAPP_AVEC_BOUTON: 'true',
  };

  test('construit la requête attendue par Meta et renvoie le message id', async () => {
    const { mod } = await chargerService(envCloud);
    const appels = doublureFetch({
      corps: { messages: [{ id: 'wamid.TEST123' }] },
    });

    const res = await mod.envoyerCodeOtp('+228 90 00 00 01', '654321');

    assert.equal(res.success, true);
    assert.equal(res.mock, false);
    assert.equal(res.messageId, 'wamid.TEST123');
    assert.equal(mod.estActif(), true);

    assert.equal(appels.length, 1);
    const { url, options, body } = appels[0];

    assert.match(url, /graph\.facebook\.com\/v[\d.]+\/123456789\/messages$/);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer jeton_test');

    // Numéro normalisé : chiffres seuls, sans "+" ni espaces.
    assert.equal(body.to, '22890000001');
    assert.equal(body.messaging_product, 'whatsapp');
    assert.equal(body.type, 'template');
    assert.equal(body.template.name, 'certiftogo_code_otp');
    assert.equal(body.template.language.code, 'fr');

    // Le code doit figurer dans le corps ET dans le bouton de copie.
    const corpsComposant = body.template.components.find((c) => c.type === 'body');
    const bouton = body.template.components.find((c) => c.type === 'button');
    assert.equal(corpsComposant.parameters[0].text, '654321');
    assert.equal(bouton.parameters[0].text, '654321');
  });

  test('omet le composant bouton si le template n’en a pas', async () => {
    const { mod } = await chargerService({ ...envCloud, WHATSAPP_AVEC_BOUTON: 'false' });
    const appels = doublureFetch({ corps: { messages: [{ id: 'wamid.X' }] } });

    await mod.envoyerCodeOtp('+22890000001', '111222');

    const composants = appels[0].body.template.components;
    assert.equal(composants.length, 1);
    assert.equal(composants[0].type, 'body');
  });

  test('remonte une ErreurWhatsapp avec le code Meta sur réponse en erreur', async () => {
    const { mod } = await chargerService(envCloud);
    doublureFetch({
      ok: false,
      status: 400,
      corps: { error: { message: 'Template name does not exist', code: 132001 } },
    });

    await assert.rejects(
      () => mod.envoyerCodeOtp('+22890000001', '123456'),
      (err) => {
        assert.equal(err.name, 'ErreurWhatsapp');
        assert.equal(err.code, 132001);
        assert.match(err.message, /Template name does not exist/);
        return true;
      }
    );
  });

  test('échoue explicitement si la configuration est incomplète', async () => {
    const { mod } = await chargerService({
      ...envCloud,
      WHATSAPP_TOKEN: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
    });

    await assert.rejects(
      () => mod.envoyerCodeOtp('+22890000001', '123456'),
      (err) => {
        assert.equal(err.code, 'CONFIG_INCOMPLETE');
        return true;
      }
    );
  });

  test('rejette un numéro de téléphone invalide', async () => {
    const { mod } = await chargerService(envCloud);
    doublureFetch();

    await assert.rejects(
      () => mod.envoyerCodeOtp('123', '123456'),
      (err) => {
        assert.equal(err.name, 'ErreurWhatsapp');
        assert.match(err.message, /invalide/);
        return true;
      }
    );
  });

  test('convertit un échec réseau en ErreurWhatsapp', async () => {
    const { mod } = await chargerService(envCloud);
    globalThis.fetch = async () => {
      throw new Error('socket hang up');
    };

    await assert.rejects(
      () => mod.envoyerCodeOtp('+22890000001', '123456'),
      (err) => {
        assert.equal(err.code, 'RESEAU');
        assert.match(err.message, /socket hang up/);
        return true;
      }
    );
  });
});
