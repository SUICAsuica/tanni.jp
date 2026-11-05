'use strict';

(async function () {
  const intro = document.querySelector('#intro-screen');
  const page = document.querySelector('#page-content');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let introTimer;
  function closeIntro() {
    clearTimeout(introTimer);
    intro.hidden = true;
    page.inert = false;
  }
  if (reducedMotion) closeIntro();
  else {
    page.inert = true;
    introTimer = setTimeout(closeIntro, 2200);
    document.querySelector('#skip-intro').addEventListener('click', closeIntro);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !intro.hidden) closeIntro();
    });
  }
  const audio = document.querySelector('#audio');
  const status = document.querySelector('#player-status');
  const list = document.querySelector('#track-list');
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  let tracks = [];
  let current = 0;
  let group = 'all';
  let selection = 0;

  function time(value) {
    const seconds = Math.floor(value);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  function showTab(id, focus) {
    tabs.forEach(function (tab) {
      const active = tab.id === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('active', active);
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
      if (active && focus) tab.focus();
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { showTab(tab.id); });
    tab.addEventListener('keydown', function (event) {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        showTab(tabs[next].id, true);
      }
    });
  });

  function updatePlayback() {
    document.querySelector('#playback-state').textContent = audio.paused ? '選択中の曲' : '再生中';
    list.querySelectorAll('.track-button').forEach(function (button) {
      const index = Number(button.dataset.index);
      const active = index === current;
      button.setAttribute('aria-current', String(active));
      button.querySelector('.track-number').textContent = active && !audio.paused ? '▶' : String(index + 1).padStart(2, '0');
      button.setAttribute('aria-label', tracks[index].title + ' ' + tracks[index].version + (active && !audio.paused ? 'を一時停止' : 'を再生'));
    });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
  }

  async function play() {
    const requestedSelection = selection;
    status.textContent = '';
    try {
      await audio.play();
    } catch (error) {
      if (requestedSelection !== selection || error.name === 'AbortError') return;
      status.textContent = error.name === 'NotAllowedError'
        ? 'プレーヤーの再生ボタンを押してください。'
        : '音源を再生できませんでした。通信環境を確認して、もう一度お試しください。';
    }
  }

  function renderList() {
    list.replaceChildren();
    tracks.forEach(function (track, index) {
      if (group !== 'all' && track.group !== group) return;
      const item = document.createElement('li');
      item.className = 'track-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'track-button';
      button.dataset.index = String(index);
      const number = document.createElement('span');
      number.className = 'track-number';
      number.setAttribute('aria-hidden', 'true');
      const image = document.createElement('img');
      image.className = 'track-thumb';
      image.src = track.artwork;
      image.alt = '';
      image.width = 44;
      image.height = 44;
      image.loading = 'lazy';
      const text = document.createElement('span');
      const title = document.createElement('span');
      title.className = 'track-name';
      title.textContent = track.title;
      const version = document.createElement('span');
      version.className = 'track-detail';
      version.textContent = track.version;
      text.append(title, version);
      const duration = document.createElement('span');
      duration.className = 'track-duration';
      duration.textContent = time(track.duration);
      button.append(number, image, text, duration);
      button.addEventListener('click', function () {
        if (index === current) {
          if (audio.paused) play();
          else audio.pause();
        } else selectTrack(index, true, true);
      });
      item.append(button);
      list.append(item);
    });
    document.querySelector('#track-count').textContent = list.children.length + '曲';
    updatePlayback();
  }

  function selectTrack(index, autoplay, updateHash) {
    current = (index + tracks.length) % tracks.length;
    selection += 1;
    const track = tracks[current];
    audio.pause();
    audio.src = track.audio;
    audio.setAttribute('aria-label', track.title + ' ' + track.version + 'を再生');
    document.querySelector('#track-title').textContent = track.title;
    document.querySelector('#track-version').textContent = track.version;
    const cover = document.querySelector('#cover');
    cover.src = track.artwork;
    cover.alt = track.title + 'のジャケット';
    document.querySelector('#suno-link').href = track.source;
    document.querySelector('#lyrics-title').textContent = track.title + ' / ' + track.version;
    document.querySelector('#lyrics').textContent = track.lyrics || 'この曲の歌詞はまだ掲載していません。';
    document.querySelector('#lyrics-source').href = track.lyricsSource;
    const original = track.lyricsKind === 'original';
    document.querySelector('#lyrics-kind').textContent = original ? '原曲の歌詞（参考）' : '歌詞';
    document.querySelector('#lyrics-note').hidden = !original;
    status.textContent = '';
    document.title = track.title + ' / ' + track.version + ' | Oh-o! Tanni BGM';
    if (updateHash) {
      const url = new URL(window.location.href);
      url.hash = 'track=' + track.slug;
      history.replaceState(null, '', url);
    }
    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title + ' / ' + track.version,
        artist: 'Oh-o! Tanni',
        album: 'Oh-o! Tanni BGM',
        artwork: [{ src: new URL(track.artwork, window.location.href).href, type: 'image/jpeg' }]
      });
    }
    updatePlayback();
    if (autoplay) play();
  }

  function fromHash() {
    const slug = new URLSearchParams(window.location.hash.slice(1)).get('track');
    return tracks.findIndex(function (track) { return track.slug === slug; });
  }

  document.querySelectorAll('[data-group]').forEach(function (button) {
    button.addEventListener('click', function () {
      group = button.dataset.group;
      document.querySelectorAll('[data-group]').forEach(function (filter) {
        const active = filter === button;
        filter.classList.toggle('active', active);
        filter.setAttribute('aria-pressed', String(active));
      });
      renderList();
    });
  });
  document.querySelector('#previous').addEventListener('click', function () {
    if (tracks.length) selectTrack(current - 1, true, true);
  });
  document.querySelector('#next').addEventListener('click', function () {
    if (tracks.length) selectTrack(current + 1, true, true);
  });
  document.querySelector('#copy-link').addEventListener('click', async function () {
    if (!tracks.length) return;
    const url = new URL(window.location.href);
    url.hash = 'track=' + tracks[current].slug;
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = '曲のリンクをコピーしました。';
    } catch (_) {
      status.textContent = 'この曲のリンク：' + url.href;
    }
  });
  audio.addEventListener('play', updatePlayback);
  audio.addEventListener('pause', updatePlayback);
  audio.addEventListener('ended', function () {
    if (tracks.length) selectTrack(current + 1, true, true);
  });
  audio.addEventListener('error', function () {
    status.textContent = '音源を読み込めませんでした。ページを再読み込みしてお試しください。';
  });
  window.addEventListener('hashchange', function () {
    const index = fromHash();
    if (index >= 0 && index !== current) selectTrack(index, false, false);
  });

  try {
    const response = await fetch('tracks.json?v=20261105-3');
    if (!response.ok) throw new Error('Track list request failed');
    tracks = await response.json();
    if (!Array.isArray(tracks) || !tracks.length) throw new Error('No tracks');
    renderList();
    selectTrack(Math.max(0, fromHash()), false, false);
    if ('mediaSession' in navigator) {
      const handlers = {
        play: play,
        pause: function () { audio.pause(); },
        previoustrack: function () { selectTrack(current - 1, true, true); },
        nexttrack: function () { selectTrack(current + 1, true, true); },
        seekto: function (details) {
          if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
        }
      };
      Object.keys(handlers).forEach(function (action) {
        try { navigator.mediaSession.setActionHandler(action, handlers[action]); } catch (_) {}
      });
    }
  } catch (_) {
    status.textContent = '曲一覧を読み込めませんでした。ページを再読み込みしてください。';
  }
})();
