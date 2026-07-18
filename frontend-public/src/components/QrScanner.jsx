// ─────────────────────────────────────────────────────────────
// Scanner de QR code : lecture via la caméra (jsQR sur les images
// du flux vidéo) avec repli sur l'import d'une image (photo/capture).
// Appelle `onResultat(texte)` dès qu'un QR est décodé.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import Icon from './Icon.jsx';

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-soft-md">
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4">
          <div className="flex items-center gap-2 font-display font-bold text-on-surface">
            <Icon name="qr_code_scanner" size={22} className="text-primary" />
            Scanner un QR code
          </div>
          <button
            onClick={onFermer}
            title="Fermer"
            className="rounded-full p-1.5 text-outline transition-colors hover:bg-surface-variant hover:text-on-surface"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="p-5">
          {erreurCamera ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-on-surface-variant">
              <Icon name="videocam_off" size={30} className="text-secondary" />
              {erreurCamera}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
              {/* Viseur */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-3/5 w-3/5 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/90">
                Placez le QR code du diplôme dans le cadre
              </p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          <button
            onClick={() => fichierRef.current?.click()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant/40 py-3 text-sm font-semibold text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Icon name="photo_library" size={20} /> Importer une image du QR code
          </button>
          <input ref={fichierRef} type="file" accept="image/*" onChange={importerImage} className="hidden" />
          {erreurImage && <p className="mt-2 text-center text-sm text-error">{erreurImage}</p>}
        </div>
      </div>
    </div>
  );
}
