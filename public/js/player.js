const video = document.getElementById('video');
const errorBox = document.getElementById('player-error');
const retryBtn = document.getElementById('retry');
const src = video.dataset.src;

let hls = null;
let reinicios = 0;          // reinicios completos seguidos sin recuperar
const MAX_REINICIOS = 6;

function hayImagen() {
  return !video.paused && !video.ended && video.readyState >= 3;
}

function hideError() {
  errorBox.hidden = true;
}

function showError() {
  errorBox.hidden = false;
}

// Recrea el reproductor desde cero. Se usa como ultimo recurso ante un error
// fatal del que hls.js no puede recuperarse en caliente.
function reiniciar() {
  if (reinicios >= MAX_REINICIOS) {
    showError();
    return;
  }
  reinicios += 1;
  arrancar();
}

function irAlDirecto() {
  if (hls && hls.liveSyncPosition != null && isFinite(hls.liveSyncPosition)) {
    video.currentTime = hls.liveSyncPosition;
  } else if (video.seekable.length) {
    video.currentTime = video.seekable.end(video.seekable.length - 1);
  }
}

function arrancar() {
  hideError();
  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({
      // Ajustes para directo: mantenerse cerca del borde y reintentar mucho.
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
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      reinicios = 0;
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.FRAG_BUFFERED, () => { reinicios = 0; });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        // Reintenta cargar; si el manifest entero falla, reinicio completo.
        if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
          setTimeout(reiniciar, 1500);
        } else {
          hls.startLoad();
        }
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        setTimeout(reiniciar, 1500);
      }
    });
    return;
  }

  // Safari/iOS reproduce HLS de forma nativa.
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.play().catch(() => {});
    return;
  }
  showError();
}

// Vigilante: mientras el tiempo avance hay imagen -> nunca mostrar el aviso, y
// contamos los reinicios como exito. Si se queda parado varios segundos, se
// intenta volver al directo y recargar antes de rendirse.
let ultimoTiempo = -1;
let segundosParado = 0;
setInterval(() => {
  const avanza = video.currentTime > ultimoTiempo + 0.1;
  ultimoTiempo = video.currentTime;

  if (avanza) {
    segundosParado = 0;
    reinicios = 0;
    if (!errorBox.hidden) hideError();
    return;
  }

  // No avanza: si deberia estar reproduciendo, algo se atasco.
  if (!video.paused) {
    segundosParado += 1;
    if (segundosParado === 3) {
      irAlDirecto();
      if (hls) hls.startLoad();
    } else if (segundosParado >= 8) {
      segundosParado = 0;
      reiniciar();
    }
  }
}, 1000);

retryBtn.addEventListener('click', () => {
  reinicios = 0;
  segundosParado = 0;
  arrancar();
});

arrancar();
