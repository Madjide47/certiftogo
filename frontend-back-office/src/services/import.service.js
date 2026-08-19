// ─────────────────────────────────────────────────────────────
// Import d'une promotion depuis un classeur Excel ou un CSV.
//
// Le parcours est en deux temps : on SIMULE d'abord (rien n'est écrit),
// on n'exécute qu'une fois le rapport propre. L'API applique la règle du
// tout-ou-rien : une seule ligne fautive annule l'import entier.
// ─────────────────────────────────────────────────────────────
import api from './api.js';

function corps(fichier) {
  const donnees = new FormData();
  donnees.append('fichier', fichier);
  return donnees;
}

/** Analyse sans écrire. Renvoie { total, valides, erreurs[], apercu[] }. */
export async function simulerImport(promotionId, fichier) {
  const { data } = await api.post(`/promotions/${promotionId}/import`, corps(fichier), {
    params: { simulation: true },
  });
  return data.data.rapport;
}

/** Exécute l'import. Échoue en 422 si le rapport n'est pas vierge. */
export async function executerImport(promotionId, fichier) {
  const { data } = await api.post(`/promotions/${promotionId}/import`, corps(fichier));
  return data.data.rapport;
}

/** Gabarit .xlsx aux bons en-têtes — évite la moitié des erreurs de format. */
export async function telechargerModeleImport() {
  const { data } = await api.get('/promotions/modele-import', { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = 'modele-import-certiftogo.xlsx';
  lien.click();
  URL.revokeObjectURL(url);
}
