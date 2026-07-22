const video = document.getElementById('video');
const errorBox = document.getElementById('player-error');
const retryBtn = document.getElementById('retry');
const src = video.dataset.src;
let hls = null;

function showError() {
  errorBox.hidden = false;
}

function start() {
  errorBox.hidden = true;
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.play().catch(() => {});
    return;
  }
  if (!window.Hls || !Hls.isSupported()) {
    showError();
    return;
  }
  hls = new Hls({ manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2 });
  hls.loadSource(src);
  hls.attachMedia(video);
  hls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    else showError();
  });
}

video.addEventListener('error', () => {
  if (!hls) showError();
});
retryBtn.addEventListener('click', start);
start();
