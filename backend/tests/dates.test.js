// ─────────────────────────────────────────────────────────────
// Tests des formats de date et d'année académique.
//
// Ces règles décident si un classeur de 300 lignes passe ou repart en
// correction manuelle. Elles méritent d'être verrouillées : une date lue
// à l'envers ne lève aucune erreur, elle inscrit simplement une mauvaise
// date de naissance sur un diplôme certifié.
// ─────────────────────────────────────────────────────────────
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canoniserDate,
  estDateValide,
  canoniserLibelleAnnee,
  estLibelleAnneeValide,
} from '../src/utils/validators.js';

describe('canoniserDate — formes acceptées', () => {
  test('conserve la forme canonique', () => {
    assert.equal(canoniserDate('2000-03-15'), '2000-03-15');
  });

  test('accepte l’usage francophone, jour en tête', () => {
    assert.equal(canoniserDate('15/03/2000'), '2000-03-15');
    assert.equal(canoniserDate('15-03-2000'), '2000-03-15');
    assert.equal(canoniserDate('15.03.2000'), '2000-03-15');
  });

  test('lit « 03/05/2000 » comme le 3 mai, pas le 5 mars', () => {
    // L'inversion à l'américaine passerait inaperçue : les deux dates
    // existent. C'est le pire cas — une erreur qui ne se signale pas.
    assert.equal(canoniserDate('03/05/2000'), '2000-05-03');
  });

  test('tolère un jour ou un mois sur un seul chiffre', () => {
    assert.equal(canoniserDate('5/3/2000'), '2000-03-05');
    assert.equal(canoniserDate('2000-3-5'), '2000-03-05');
  });

  test('ne garde que le jour d’un horodatage ISO', () => {
    assert.equal(canoniserDate('2000-03-15T22:30:00.000Z'), '2000-03-15');
  });

  test('accepte une cellule Excel réellement typée date', () => {
    assert.equal(canoniserDate(new Date(Date.UTC(2000, 2, 15))), '2000-03-15');
  });
});

describe('canoniserDate — refus', () => {
  test('distingue l’absence (undefined) de l’illisible (null)', () => {
    assert.equal(canoniserDate(''), undefined);
    assert.equal(canoniserDate(null), undefined);
    assert.equal(canoniserDate('hier'), null);
  });

  test('refuse un jour qui n’existe pas', () => {
    assert.equal(canoniserDate('2000-02-31'), null);
    assert.equal(canoniserDate('31/02/2000'), null);
    assert.equal(canoniserDate('2001-02-29'), null);
  });

  test('accepte le 29 février d’une année bissextile', () => {
    assert.equal(canoniserDate('29/02/2000'), '2000-02-29');
  });

  test('refuse un mois supérieur à douze', () => {
    assert.equal(canoniserDate('2000-13-01'), null);
  });

  test('estDateValide reste tolérante sur la forme, stricte sur le jour', () => {
    assert.equal(estDateValide('15/03/2000'), true);
    assert.equal(estDateValide('2000-02-31'), false);
    assert.equal(estDateValide(''), true); // facultatif
  });
});

describe('Libellé d’année académique', () => {
  test('canonise les séparateurs rencontrés en pratique', () => {
    assert.equal(canoniserLibelleAnnee('2025-2026'), '2025-2026');
    assert.equal(canoniserLibelleAnnee('2025/2026'), '2025-2026');
    assert.equal(canoniserLibelleAnnee('2025 - 2026'), '2025-2026');
    assert.equal(canoniserLibelleAnnee('2025 2026'), '2025-2026');
  });

  test('exige deux années consécutives', () => {
    assert.equal(canoniserLibelleAnnee('2025-2027'), null);
    assert.equal(canoniserLibelleAnnee('2026-2025'), null);
    assert.equal(estLibelleAnneeValide('2025'), false);
  });
});
