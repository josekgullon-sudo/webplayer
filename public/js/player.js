const video = document.getElementById('video');
const src = video.dataset.src;

let hls = null;

function irAlDirecto() {
  if (hls && hls.liveSyncPosition != null && isFinite(hls.liveSyncPosition)) {
    video.currentTime = hls.liveSyncPosition;
  } else if (video.seekable.length) {
    video.currentTime = video.seekable.end(video.seekable.length - 1);
  }
}

function arrancar() {
  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      manifestLoadingMaxRetry: 6,
      manifestLoadingRetryDelay: 1000,
      levelLoadingMaxRetry: 6,
      fragLoadingMaxRetry: 8,
      fragLoadingRetryDelay: 1000,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (!data.fatal) return;
      // Recuperacion silenciosa: nunca molestar al usuario con avisos.
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
          setTimeout(arrancar, 1500);
        } else {
          hls.startLoad();
        }
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        setTimeout(arrancar, 1500);
      }
    });
    return;
  }

  // Safari/iOS reproduce HLS de forma nativa.
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.play().catch(() => {});
  }
}

// Vigilante: si el video se queda parado, vuelve al directo y recarga solo.
let ultimoTiempo = -1;
let segundosParado = 0;
const vigilante = setInterval(() => {
  const avanza = video.currentTime > ultimoTiempo + 0.1;
  ultimoTiempo = video.currentTime;
  if (avanza || video.paused) {
    segundosParado = 0;
    return;
  }
  segundosParado += 1;
  if (segundosParado === 3) {
    irAlDirecto();
    if (hls) hls.startLoad();
  } else if (segundosParado >= 8) {
    segundosParado = 0;
    arrancar();
  }
}, 1000);

// Al salir de la pagina (cambiar de canal, volver al menu, cerrar) hay que
// apagar el reproductor. Si no, el navegador conserva la pagina en memoria y
// su audio sigue sonando por detras encima del canal siguiente.
function apagar() {
  clearInterval(vigilante);
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.pause();
  video.removeAttribute('src');
  video.load();
}
window.addEventListener('pagehide', apagar);

// Si el navegador restaura esta pagina desde memoria (boton atras), recargar
// limpio en vez de reanudar un reproductor a medio apagar.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

arrancar();
