// ─────────────────────────────────────────────────────────────
// Nomenclatures nationales, partagées par tous les écrans.
//
// Types de diplôme et mentions viennent de la base (P-11). Les recopier
// dans le front les ferait diverger au premier arrêté qui ajoute un
// type : l'écran proposerait une liste, le serveur en refuserait une
// autre.
//
// Un cache de module suffit : ces listes changent quelques fois par
// décennie, et l'application est rechargée bien plus souvent. Les
// options de repli ne servent qu'au tout premier rendu, avant la
// réponse — jamais à décider ce qui est valable.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { nomenclatures } from '../services/referentiel.service.js';

let cache = null;
let enVol = null;

function charger() {
  if (cache) return Promise.resolve(cache);
  if (!enVol) {
    enVol = nomenclatures()
      .then((donnees) => {
        cache = donnees;
        return cache;
      })
      .finally(() => {
        enVol = null;
      });
  }
  return enVol;
}

/** Force la relecture après un ajout côté ministère. */
export function invaliderNomenclatures() {
  cache = null;
}

const VIDE = { types_diplome: [], mentions: [] };

export function useNomenclatures() {
  const [donnees, setDonnees] = useState(cache || VIDE);

  useEffect(() => {
    let vivant = true;
    charger()
      .then((d) => vivant && setDonnees(d))
      .catch(() => {
        /* l'écran reste utilisable : le serveur tranchera à la soumission */
      });
    return () => {
      vivant = false;
    };
  }, []);

  /**
   * Mention correspondant à une moyenne, d'après le barème national.
   *
   * Le serveur applique la même règle et reste seul juge : ceci ne sert
   * qu'à montrer à l'agent, pendant qu'il tape, ce qui sera enregistré.
   */
  function mentionPourMoyenne(moyenne) {
    if (moyenne === '' || moyenne === null || moyenne === undefined) return null;
    const note = Number(moyenne);
    if (!Number.isFinite(note)) return null;

    return (
      donnees.mentions
        .filter((m) => m.seuil_min !== null && m.seuil_min !== undefined)
        .sort((a, b) => Number(b.seuil_min) - Number(a.seuil_min))
        .find((m) => note >= Number(m.seuil_min)) || null
    );
  }

  return {
    typesDiplome: donnees.types_diplome,
    mentions: donnees.mentions,
    mentionPourMoyenne,
    optionsTypeDiplome: donnees.types_diplome.map((t) => ({
      value: t.code,
      label: t.libelle,
    })),
    optionsMention: donnees.mentions.map((m) => ({ value: m.code, label: m.libelle })),
  };
}
