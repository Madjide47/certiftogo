// ─────────────────────────────────────────────────────────────
// Comptes de la plateforme.
//
// Deux rôles seulement se créent ici : administrateur système et agent
// d'établissement. Les comptes MINISTÈRE se créent aussi par cette voie
// — c'est l'admin qui ouvre l'accès —, mais les comptes CANDIDAT non :
// ils naissent de la saisie d'un étudiant et s'activent à la
// certification. Les créer à la main produirait des portefeuilles vides
// rattachés à personne.
//
// Désactiver n'est pas supprimer : les actes déjà posés restent au
// journal sous le nom de leur auteur.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  listerUtilisateurs,
  creerUtilisateur,
  definirActifUtilisateur,
  listerEtablissements,
} from '../../services/admin.service.js';
import { LIBELLES_ROLE, messageErreur } from '../../utils/libelles.js';
import {
  EnTetePage,
  Tableau,
  Etiquette,
  Encart,
  EtatVide,
  Bouton,
  Champ,
  Saisie,
  Liste,
  Modale,
  Chiffre,
  Icone,
} from '../../components/ui/index.jsx';

const ROLES_CREABLES = [
  { value: 'etablissement', label: 'Agent d’établissement' },
  { value: 'ministere', label: 'Agent du ministère' },
  { value: 'admin_systeme', label: 'Administrateur système' },
];

const SOUS_ROLES = [
  { value: 'agent_saisie', label: 'Agent de saisie' },
  { value: 'chef_scolarite', label: 'Chef de scolarité' },
  { value: 'directeur', label: 'Directeur (transmet au ministère)' },
];

const FORM_VIDE = {
  nom: '',
  prenom: '',
  telephone: '',
  role: 'etablissement',
  etablissement_id: '',
  sous_role: 'agent_saisie',
};

function rattachement(u) {
  if (u.role === 'etablissement') return u.etablissement_nom || '—';
  if (u.role === 'ministere') return u.ministere_nom || 'Ministère';
  if (u.role === 'candidat') return 'Diplômé';
  return 'Plateforme';
}

export default function UtilisateursPage() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [etablissements, setEtablissements] = useState([]);
  const [filtreRole, setFiltreRole] = useState('');
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [erreurForm, setErreurForm] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  async function charger() {
    setChargement(true);
    setErreur('');
    try {
      setUtilisateurs(await listerUtilisateurs({ role: filtreRole }));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreRole]);

  useEffect(() => {
    listerEtablissements()
      .then(setEtablissements)
      .catch(() => setEtablissements([]));
  }, []);

  const affiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return utilisateurs;
    return utilisateurs.filter((u) =>
      `${u.nom} ${u.prenom} ${u.telephone}`.toLowerCase().includes(q)
    );
  }, [utilisateurs, recherche]);

  const compte = (role) => utilisateurs.filter((u) => u.role === role).length;
  const desactives = utilisateurs.filter((u) => !u.actif).length;

  function ouvrirCreation() {
    setForm(FORM_VIDE);
    setErreurForm('');
    setModaleOuverte(true);
  }

  const majChamp = (nom, valeur) => setForm((f) => ({ ...f, [nom]: valeur }));

  async function soumettre(evenement) {
    evenement.preventDefault();
    setEnregistrement(true);
    setErreurForm('');
    try {
      const charge = {
        nom: form.nom,
        prenom: form.prenom,
        telephone: form.telephone,
        role: form.role,
      };
      if (form.role === 'etablissement') {
        charge.etablissement_id = form.etablissement_id;
        charge.sous_role = form.sous_role;
      }
      const cree = await creerUtilisateur(charge);
      setModaleOuverte(false);
      setMessage(
        `Compte créé pour ${cree.prenom} ${cree.nom}. La connexion se fait par code envoyé au ${cree.telephone} — aucun mot de passe à transmettre.`
      );
      await charger();
    } catch (err) {
      setErreurForm(messageErreur(err));
    } finally {
      setEnregistrement(false);
    }
  }

  async function basculerActif(u) {
    setErreur('');
    setMessage('');
    try {
      await definirActifUtilisateur(u.id, !u.actif);
      setMessage(
        u.actif
          ? `${u.prenom} ${u.nom} est désactivé : ses sessions ouvertes ont été fermées.`
          : `${u.prenom} ${u.nom} peut de nouveau se connecter.`
      );
      await charger();
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  return (
    <div>
      <EnTetePage
        titre="Utilisateurs"
        description="Comptes d’accès à la plateforme. La connexion se fait par téléphone et code à usage unique."
        fil={[{ libelle: 'Comptes' }, { libelle: 'Utilisateurs' }]}
      >
        <Bouton icone="person_add" onClick={ouvrirCreation}>
          Nouveau compte
        </Bouton>
      </EnTetePage>

      {erreur && (
        <div className="mb-4">
          <Encart ton="erreur">{erreur}</Encart>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Encart ton="succes">{message}</Encart>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Chiffre libelle="Comptes" valeur={utilisateurs.length} />
        <Chiffre libelle="Établissements" valeur={compte('etablissement')} />
        <Chiffre libelle="Ministère" valeur={compte('ministere')} />
        <Chiffre
          libelle="Désactivés"
          valeur={desactives}
          ton={desactives > 0 ? 'alerte' : 'neutre'}
        />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Champ label="Rôle" htmlFor="f-role">
          <Liste
            id="f-role"
            vide="Tous les rôles"
            value={filtreRole}
            onChange={(e) => setFiltreRole(e.target.value)}
            options={[
              { value: 'etablissement', label: 'Établissement' },
              { value: 'ministere', label: 'Ministère' },
              { value: 'candidat', label: 'Diplômé' },
              { value: 'admin_systeme', label: 'Administration système' },
            ]}
          />
        </Champ>
        <Champ label="Rechercher" htmlFor="f-recherche" aide="Nom, prénom ou téléphone.">
          <Saisie
            id="f-recherche"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="KOUASSI, +228…"
          />
        </Champ>
      </div>

      <Tableau
        legende="Comptes de la plateforme"
        chargement={chargement}
        lignes={affiches}
        colonnes={[
          {
            cle: 'identite',
            libelle: 'Identité',
            rendu: (u) => (
              <span>
                <span className="font-medium">
                  {u.nom?.toUpperCase()} {u.prenom}
                </span>
                {u.est_agent_principal && (
                  <span className="block text-xs text-gris-500">Agent principal</span>
                )}
              </span>
            ),
          },
          { cle: 'telephone', libelle: 'Téléphone', tabulaire: true },
          {
            cle: 'role',
            libelle: 'Rôle',
            rendu: (u) => (
              <span>
                {LIBELLES_ROLE[u.role] || u.role}
                {u.sous_role && (
                  <span className="block text-xs text-gris-500">
                    {SOUS_ROLES.find((s) => s.value === u.sous_role)?.label || u.sous_role}
                  </span>
                )}
              </span>
            ),
          },
          { cle: 'rattachement', libelle: 'Rattachement', rendu: rattachement },
          {
            cle: 'actif',
            libelle: 'État',
            rendu: (u) =>
              u.actif ? (
                <Etiquette ton="succes">Actif</Etiquette>
              ) : (
                <Etiquette ton="neutre">Désactivé</Etiquette>
              ),
          },
          {
            cle: 'actions',
            libelle: '',
            alignement: 'droite',
            rendu: (u) => (
              <Bouton
                variante="discret"
                className={u.actif ? 'text-erreur hover:text-erreur' : ''}
                onClick={() => basculerActif(u)}
              >
                {u.actif ? 'Désactiver' : 'Réactiver'}
              </Bouton>
            ),
          },
        ]}
        vide={
          <EtatVide icone="group" titre="Aucun compte">
            Aucun compte ne correspond à ces critères.
          </EtatVide>
        }
      />

      <p className="mt-3 flex items-start gap-1.5 text-sm text-gris-500">
        <Icone nom="history" taille={16} className="mt-0.5 shrink-0" />
        Désactiver ferme immédiatement les sessions ouvertes du compte. Les actions déjà commises
        restent au journal, sous le nom de leur auteur : la trace survit à la fermeture du compte.
      </p>

      <Modale
        ouvert={modaleOuverte}
        titre="Nouveau compte"
        onFermer={() => setModaleOuverte(false)}
        largeur="max-w-xl"
      >
        <form onSubmit={soumettre}>
          {erreurForm && (
            <div className="mb-4">
              <Encart ton="erreur">{erreurForm}</Encart>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Prénom" htmlFor="prenom" requis>
              <Saisie
                id="prenom"
                required
                value={form.prenom}
                onChange={(e) => majChamp('prenom', e.target.value)}
              />
            </Champ>
            <Champ label="Nom" htmlFor="nom" requis>
              <Saisie
                id="nom"
                required
                value={form.nom}
                onChange={(e) => majChamp('nom', e.target.value)}
              />
            </Champ>
          </div>

          <div className="mt-3">
            <Champ
              label="Téléphone"
              htmlFor="telephone"
              requis
              aide="C’est l’identifiant de connexion : le code à usage unique y sera envoyé."
            >
              <Saisie
                id="telephone"
                required
                placeholder="+228 90 00 00 00"
                value={form.telephone}
                onChange={(e) => majChamp('telephone', e.target.value)}
              />
            </Champ>
          </div>

          <div className="mt-3">
            <Champ label="Rôle" htmlFor="role" requis>
              <Liste
                id="role"
                vide={null}
                value={form.role}
                onChange={(e) => majChamp('role', e.target.value)}
                options={ROLES_CREABLES}
              />
            </Champ>
          </div>

          {form.role === 'etablissement' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Champ label="Établissement" htmlFor="etablissement" requis>
                <Liste
                  id="etablissement"
                  required
                  value={form.etablissement_id}
                  onChange={(e) => majChamp('etablissement_id', e.target.value)}
                  options={etablissements.map((e) => ({
                    value: e.id,
                    label: `${e.code ? `${e.code} — ` : ''}${e.nom}`,
                  }))}
                />
              </Champ>
              <Champ
                label="Fonction"
                htmlFor="sous_role"
                aide="Elle détermine ce que l’agent peut faire : saisir, contrôler, transmettre."
              >
                <Liste
                  id="sous_role"
                  vide={null}
                  value={form.sous_role}
                  onChange={(e) => majChamp('sous_role', e.target.value)}
                  options={SOUS_ROLES}
                />
              </Champ>
            </div>
          )}

          <div className="mt-4">
            <Encart ton="info">
              Aucun mot de passe n’est créé ni transmis : le titulaire se connecte avec son numéro
              et un code reçu à chaque connexion.
            </Encart>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Bouton variante="secondaire" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Bouton>
            <Bouton type="submit" icone="check" enCours={enregistrement}>
              Créer le compte
            </Bouton>
          </div>
        </form>
      </Modale>
    </div>
  );
}
