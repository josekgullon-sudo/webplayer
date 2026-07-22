const video = document.getElementById('video');
const errorBox = document.getElementById('player-error');
const retryBtn = document.getElementById('retry');
const src = video.dataset.src;
let hls = null;

function showError() {
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}

function start() {
  hideError();
  if (hls) {
    hls.destroy();
    hls = null;
  }
  // hls.js primero: en Chrome canPlayType puede decir "maybe" y no reproducir.
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

// Si hay imagen, cualquier error anterior ya no aplica: el cartel debe irse.
video.addEventListener('playing', hideError);
video.addEventListener('error', () => {
  if (!hls) showError();
});
retryBtn.addEventListener('click', start);
start();
