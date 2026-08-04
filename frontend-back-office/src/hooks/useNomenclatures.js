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

  return {
    typesDiplome: donnees.types_diplome,
    mentions: donnees.mentions,
    optionsTypeDiplome: donnees.types_diplome.map((t) => ({
      value: t.code,
      label: t.libelle,
    })),
    optionsMention: donnees.mentions.map((m) => ({ value: m.code, label: m.libelle })),
  };
}
