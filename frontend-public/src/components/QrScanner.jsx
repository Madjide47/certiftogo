// ─────────────────────────────────────────────────────────────
// Scanner de QR code : lecture via la caméra (jsQR sur les images
// du flux vidéo) avec repli sur l'import d'une image (photo/capture).
// Appelle `onResultat(texte)` dès qu'un QR est décodé.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Icone, Encart } from './ui.jsx';

export default function QrScanner({ onResultat, onFermer }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fichierRef = useRef(null);
  const [erreurCamera, setErreurCamera] = useState('');
  const [erreurImage, setErreurImage] = useState('');

  useEffect(() => {
    let flux = null;
    let rafId = null;
    let actif = true;

    async function demarrer() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErreurCamera("La caméra n'est pas disponible sur cet appareil ou ce navigateur.");
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        if (actif) {
          setErreurCamera(
            "Impossible d'accéder à la caméra (refusée ou absente). Vous pouvez importer une image du QR code."
          );
        }
        return;
      }
      if (!actif) {
        flux.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      video.srcObject = flux;
      await video.play().catch(() => {});
      boucle();
    }

    function boucle() {
      if (!actif) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(image.data, image.width, image.height);
        if (qr?.data) {
          actif = false;
          onResultat(qr.data);
          return;
        }
      }
      rafId = requestAnimationFrame(boucle);
    }

    demarrer();
    return () => {
      actif = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (flux) flux.getTracks().forEach((t) => t.stop());
    };
  }, [onResultat]);

  function importerImage(e) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setErreurImage('');
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(image.data, image.width, image.height);
      if (qr?.data) onResultat(qr.data);
      else setErreurImage("Aucun QR code lisible sur cette image. Essayez une image plus nette.");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErreurImage("Impossible de lire ce fichier — choisissez une image (PNG, JPG…).");
    };
    img.src = url;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gris-900/60 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Scanner un QR code"
    >
      <div className="w-full max-w-md border border-gris-300 bg-white">
        <div className="flex items-center justify-between border-b border-gris-300 px-5 py-3">
          <h2 className="flex items-center gap-2 text-lg">
            <Icone nom="qr_code_scanner" taille={22} className="text-vert" />
            Scanner un QR code
          </h2>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="rounded p-1 text-gris-500 hover:bg-gris-100 hover:text-gris-900"
          >
            <Icone nom="close" taille={20} />
          </button>
        </div>

        <div className="px-5 py-4">
          {erreurCamera ? (
            <Encart ton="alerte" titre="Caméra indisponible">
              {erreurCamera}
            </Encart>
          ) : (
            <div className="relative overflow-hidden bg-gris-900">
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-square w-full object-cover"
              />
              {/* Viseur : un simple cadre, sans effet. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-3/5 w-3/5 border-2 border-white/90" />
              </div>
              <p className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-white">
                Placez le QR code du diplôme dans le cadre
              </p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          <button
            type="button"
            onClick={() => fichierRef.current?.click()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded border border-gris-500 bg-white py-2.5 text-base font-medium text-gris-900 hover:bg-gris-100"
          >
            <Icone nom="photo_library" taille={20} /> Importer une photo du QR code
          </button>
          <input
            ref={fichierRef}
            type="file"
            accept="image/*"
            onChange={importerImage}
            className="hidden"
          />
          {erreurImage && (
            <p className="mt-2 text-sm font-medium text-erreur" role="alert">
              {erreurImage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
