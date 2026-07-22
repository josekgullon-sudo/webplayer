const video = document.getElementById('video');
const errorBox = document.getElementById('player-error');
const retryBtn = document.getElementById('retry');
const src = video.dataset.src;
let hls = null;

function reproduciendo() {
  return !video.paused && !video.ended && video.readyState >= 3;
}

function hideError() {
  errorBox.hidden = true;
}

// Nunca tapar un canal que se esta viendo: hls.js emite errores puntuales
// (un segmento que falla, un cambio de nivel) mientras la imagen sigue fina.
function showError() {
  if (reproduciendo()) return;
  errorBox.hidden = false;
}

function start() {
  hideError();
  if (hls) {
    hls.destroy();
    hls = null;
  }
  // hls.js primero: en Chrome canPlayType puede decir "maybe" y luego no reproducir.
  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({ manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 6 });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else showError();
    });
    return;
  }
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.play().catch(() => {});
    return;
  }
  showError();
}

// Mientras el tiempo avance hay imagen, asi que fuera cualquier aviso anterior.
video.addEventListener('timeupdate', () => {
  if (!errorBox.hidden && reproduciendo()) hideError();
});
video.addEventListener('playing', hideError);
video.addEventListener('error', () => {
  if (!hls) showError();
});
retryBtn.addEventListener('click', start);
start();
