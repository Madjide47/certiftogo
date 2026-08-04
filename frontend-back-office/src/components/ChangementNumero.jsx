// ─────────────────────────────────────────────────────────────
// Changement volontaire de numéro (A-14).
//
// Trois écrans en un, parce que la procédure a trois temps : déclarer le
// nouveau numéro, prouver qu'on détient l'ancien, prouver qu'on détient
// le nouveau. L'ordre n'est pas cosmétique — il est ce qui empêche une
// session volée d'emporter le compte, et une faute de frappe de le
// perdre.
//
// L'étape en cours vient du serveur : un titulaire qui ferme son
// navigateur entre deux codes reprend là où il s'était arrêté.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  etatChangementNumero,
  demanderChangementNumero,
  confirmerAncienNumero,
  confirmerNouveauNumero,
  annulerChangementNumero,
} from '../services/auth.service.js';
import { messageErreur } from '../utils/libelles.js';
import { Bouton, Champ, Saisie, Encart, Etiquette, Icone } from './ui/index.jsx';

export default function ChangementNumero({ telephoneActuel, onApplique }) {
  const [demande, setDemande] = useState(null);
  const [nouveau, setNouveau] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    etatChangementNumero()
      .then(setDemande)
      .catch(() => setDemande(null));
  }, []);

  function reinitialiser() {
    setCode('');
    setNouveau('');
  }

  async function agir(action, succes) {
    setEnCours(true);
    setErreur('');
    setMessage('');
    try {
      const resultat = await action();
      setCode('');
      succes(resultat);
    } catch (err) {
      setErreur(messageErreur(err));
      // Trop de tentatives : le serveur a clos la demande, l'écran doit
      // repartir de zéro plutôt que d'attendre un code qui n'existe plus.
      if (err.response?.data?.error?.code === 'TROP_DE_TENTATIVES') {
        setDemande(null);
        reinitialiser();
      }
    } finally {
      setEnCours(false);
    }
  }

  const demarrer = (evenement) => {
    evenement.preventDefault();
    agir(
      () => demanderChangementNumero(nouveau.trim()),
      (r) => {
        setDemande(r.demande);
        setMessage(r.message);
      }
    );
  };

  const confirmerAncien = (evenement) => {
    evenement.preventDefault();
    agir(
      () => confirmerAncienNumero(demande.id, code.trim()),
      (r) => {
        setDemande(r.demande);
        setMessage(r.message);
      }
    );
  };

  const confirmerNouveau = (evenement) => {
    evenement.preventDefault();
    agir(
      () => confirmerNouveauNumero(demande.id, code.trim()),
      (r) => {
        setDemande(null);
        reinitialiser();
        setMessage(r.message);
        onApplique?.(r);
      }
    );
  };

  async function annuler() {
    await agir(
      () => annulerChangementNumero(demande.id),
      () => {
        setDemande(null);
        reinitialiser();
        setMessage('Demande annulée. Votre numéro n’a pas changé.');
      }
    );
  }

  return (
    <div className="border border-gris-300 bg-white px-5 py-4">
      {erreur && (
        <div className="mb-3">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}
      {message && (
        <div className="mb-3">
          <Encart ton="succes">{message}</Encart>
        </div>
      )}

      {!demande && (
        <form onSubmit={demarrer}>
          <p className="mb-3 text-base text-gris-700">
            Votre numéro est votre identifiant de connexion. Le changer demande deux
            confirmations : une sur le numéro actuel, une sur le nouveau.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <Champ
                label="Nouveau numéro"
                htmlFor="nouveau-numero"
                requis
                aide={`Actuel : ${telephoneActuel || '—'}`}
              >
                <Saisie
                  id="nouveau-numero"
                  required
                  placeholder="+228 90 00 00 00"
                  value={nouveau}
                  onChange={(e) => setNouveau(e.target.value)}
                />
              </Champ>
            </div>
            <Bouton type="submit" icone="send" enCours={enCours} disabled={!nouveau.trim()}>
              Envoyer le premier code
            </Bouton>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
            <Icone nom="info" taille={16} className="mt-0.5 shrink-0" />
            Vous n’avez plus accès à votre numéro actuel ? Cette procédure ne convient pas :
            présentez-vous à votre établissement avec une pièce d’identité pour une récupération.
          </p>
        </form>
      )}

      {demande?.statut === 'ancien_a_confirmer' && (
        <form onSubmit={confirmerAncien}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Etiquette ton="info">Étape 1 sur 2</Etiquette>
            <span className="text-base text-gris-700">
              Code envoyé à votre numéro actuel {telephoneActuel}
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem]">
              <Champ label="Code reçu" htmlFor="code-ancien" requis>
                <Saisie
                  id="code-ancien"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="tabulaire"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Champ>
            </div>
            <Bouton type="submit" icone="check" enCours={enCours} disabled={!code.trim()}>
              Confirmer
            </Bouton>
            <Bouton variante="neutre" onClick={annuler}>
              Annuler
            </Bouton>
          </div>

          <p className="mt-2 text-sm text-gris-500">
            Ce code prouve que la demande vient de vous, et non de quelqu’un qui aurait pris la
            main sur votre session. {demande.tentatives_restantes} tentative(s) restante(s).
          </p>
        </form>
      )}

      {demande?.statut === 'nouveau_a_confirmer' && (
        <form onSubmit={confirmerNouveau}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Etiquette ton="info">Étape 2 sur 2</Etiquette>
            <span className="text-base text-gris-700">
              Code envoyé au {demande.nouveau_telephone}
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem]">
              <Champ label="Code reçu sur le nouveau numéro" htmlFor="code-nouveau" requis>
                <Saisie
                  id="code-nouveau"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="tabulaire"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Champ>
            </div>
            <Bouton type="submit" icone="check" enCours={enCours} disabled={!code.trim()}>
              Appliquer le changement
            </Bouton>
            <Bouton variante="neutre" onClick={annuler}>
              Annuler
            </Bouton>
          </div>

          <p className="mt-2 text-sm text-gris-500">
            Ce second code vérifie que le numéro saisi est bien le vôtre — une faute de frappe
            ici vous ferait perdre l’accès à votre compte. {demande.tentatives_restantes}{' '}
            tentative(s) restante(s).
          </p>
        </form>
      )}
    </div>
  );
}
