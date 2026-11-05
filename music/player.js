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
  const seek = document.querySelector('#seek');
  const volume = document.querySelector('#volume');
  const playButton = document.querySelector('#play-toggle');
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  let tracks = [];
  let current = 0;
  let group = 'all';
  let selection = 0;
  let isScrubbing = false;
  let isStopped = false;
  let isBuffering = false;
  let shouldContinuePlayback = false;
  let animationFrame = 0;
  let lastVolume = audio.volume || 1;

  function time(value) {
    const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  function trackDuration() {
    if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    return tracks[current] ? tracks[current].duration : 0;
  }

  function updateTimeline(position) {
    const duration = trackDuration();
    const value = Math.min(duration, Math.max(0,
      Number.isFinite(position) ? position : (isScrubbing ? Number(seek.value) : audio.currentTime)));
    const progress = duration ? value / duration * 100 : 0;
    let buffered = progress;
    for (let index = 0; index < audio.buffered.length; index += 1) {
      if (audio.buffered.start(index) <= value + 0.1 && audio.buffered.end(index) >= value) {
        buffered = Math.max(progress, audio.buffered.end(index) / duration * 100);
        break;
      }
    }
    seek.max = String(duration);
    seek.value = String(value);
    seek.disabled = !duration || audio.readyState < 1;
    seek.style.setProperty('--progress', progress + '%');
    seek.style.setProperty('--buffered', Math.min(100, buffered) + '%');
    const seconds = Math.floor(value);
    const spoken = Math.floor(seconds / 60) + '分' + seconds % 60 + '秒 / '
      + Math.floor(duration / 60) + '分' + Math.floor(duration % 60) + '秒';
    if (seek.getAttribute('aria-valuetext') !== spoken) seek.setAttribute('aria-valuetext', spoken);
    const labels = {elapsed: time(value), duration: time(duration), remaining: '残り ' + time(duration - value)};
    Object.keys(labels).forEach(function (id) {
      const element = document.getElementById(id);
      if (element.textContent !== labels[id]) element.textContent = labels[id];
    });
    document.querySelector('#stop').disabled = audio.paused && audio.currentTime === 0;
  }

  function animateTimeline() {
    cancelAnimationFrame(animationFrame);
    if (!isScrubbing) updateTimeline();
    if (!audio.paused) animationFrame = requestAnimationFrame(animateTimeline);
  }

  function pause() {
    shouldContinuePlayback = false;
    audio.pause();
  }

  function seekTo(position) {
    if (!Number.isFinite(audio.duration) || audio.readyState < 1) return;
    if (audio.paused) shouldContinuePlayback = false;
    isScrubbing = false;
    audio.currentTime = Math.min(audio.duration, Math.max(0, position));
    isStopped = false;
    updateTimeline(audio.currentTime);
    updatePlayback();
  }

  function commitSeek() {
    if (isScrubbing) seekTo(Number(seek.value));
  }

  function updateVolume() {
    const muted = audio.muted || audio.volume === 0;
    volume.value = String(muted ? 0 : audio.volume);
    volume.style.setProperty('--volume', (muted ? 0 : audio.volume * 100) + '%');
    volume.setAttribute('aria-valuetext', Math.round((muted ? 0 : audio.volume) * 100) + '%');
    document.querySelector('#volume-icon').hidden = muted;
    document.querySelector('#muted-icon').hidden = !muted;
    const label = muted ? '音を出す' : '音を消す';
    document.querySelector('#mute').setAttribute('aria-label', label);
    document.querySelector('#mute').title = label;
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
    const paused = audio.paused;
    document.querySelector('#playback-state').textContent = paused
      ? (isStopped ? '停止中' : audio.currentTime > 0 ? '一時停止中' : '選択中の曲')
      : (isBuffering ? '読み込み中' : '再生中');
    const label = paused ? '再生' : '一時停止';
    playButton.setAttribute('aria-label', label);
    playButton.setAttribute('aria-busy', String(!paused && isBuffering));
    document.querySelector('#play-label').textContent = label;
    document.querySelector('#play-icon').hidden = !paused;
    document.querySelector('#pause-icon').hidden = paused;
    list.querySelectorAll('.track-button').forEach(function (button) {
      const index = Number(button.dataset.index);
      const active = index === current;
      button.setAttribute('aria-current', String(active));
      button.querySelector('.track-number').textContent = active && !audio.paused ? '▶' : String(index + 1).padStart(2, '0');
      button.setAttribute('aria-label', tracks[index].title + ' ' + tracks[index].version + (active && !audio.paused ? 'を一時停止' : 'を再生'));
    });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
    updateTimeline();
  }

  async function play() {
    const requestedSelection = selection;
    shouldContinuePlayback = true;
    isStopped = false;
    status.textContent = '';
    try {
      await audio.play();
    } catch (error) {
      if (requestedSelection !== selection || error.name === 'AbortError') return;
      shouldContinuePlayback = false;
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
      image.src = track.thumbnail || track.artwork;
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
          else pause();
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
    shouldContinuePlayback = Boolean(autoplay);
    isScrubbing = false;
    isStopped = false;
    isBuffering = false;
    const track = tracks[current];
    audio.pause();
    audio.src = track.audio;
    document.querySelector('#previous').disabled = false;
    document.querySelector('#next').disabled = false;
    seek.value = '0';
    audio.setAttribute('aria-label', track.title + ' ' + track.version + 'を再生');
    document.querySelector('#track-title').textContent = track.title;
    document.querySelector('#track-version').textContent = track.version;
    const cover = document.querySelector('#cover');
    cover.src = track.artwork;
    cover.alt = track.title + 'のジャケット';
    document.querySelector('#lyrics-title').textContent = track.title + ' / ' + track.version;
    document.querySelector('#lyrics').textContent = track.lyrics || 'この曲の歌詞はまだ掲載していません。';
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
  playButton.addEventListener('click', function () {
    if (audio.paused) play();
    else pause();
  });
  document.querySelector('#stop').addEventListener('click', function () {
    shouldContinuePlayback = false;
    isStopped = true;
    isScrubbing = false;
    audio.pause();
    if (audio.readyState >= 1) audio.currentTime = 0;
    updateTimeline(0);
    updatePlayback();
  });
  seek.addEventListener('input', function () {
    isScrubbing = true;
    updateTimeline(Number(seek.value));
  });
  seek.addEventListener('change', commitSeek);
  seek.addEventListener('blur', commitSeek);
  seek.addEventListener('pointercancel', function () {
    isScrubbing = false;
    updateTimeline();
  });
  seek.addEventListener('keydown', function (event) {
    let position = Number(seek.value);
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') position += 5;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') position -= 5;
    else if (event.key === 'PageUp') position += 10;
    else if (event.key === 'PageDown') position -= 10;
    else if (event.key === 'Home') position = 0;
    else if (event.key === 'End') position = trackDuration();
    else return;
    event.preventDefault();
    seekTo(position);
  });
  volume.addEventListener('input', function () {
    audio.volume = Number(volume.value);
    audio.muted = audio.volume === 0;
    if (audio.volume > 0) lastVolume = audio.volume;
    updateVolume();
  });
  document.querySelector('#mute').addEventListener('click', function () {
    if (audio.muted || audio.volume === 0) {
      if (audio.volume === 0) {
        try { audio.volume = lastVolume; } catch (_) {}
      }
      audio.muted = false;
    } else audio.muted = true;
    updateVolume();
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
  audio.addEventListener('play', function () {
    isBuffering = audio.readyState < 3;
    updatePlayback();
    animateTimeline();
  });
  audio.addEventListener('pause', function () {
    isBuffering = false;
    cancelAnimationFrame(animationFrame);
    updatePlayback();
  });
  ['loadedmetadata', 'durationchange', 'progress', 'timeupdate', 'seeked', 'emptied'].forEach(function (event) {
    audio.addEventListener(event, function () {
      if (!isScrubbing) updateTimeline();
    });
  });
  ['playing', 'canplay'].forEach(function (event) {
    audio.addEventListener(event, function () {
      isBuffering = false;
      updatePlayback();
    });
  });
  audio.addEventListener('waiting', function () {
    isBuffering = true;
    updatePlayback();
  });
  audio.addEventListener('volumechange', updateVolume);
  audio.addEventListener('ended', function () {
    if (shouldContinuePlayback && tracks.length) selectTrack(current + 1, true, true);
  });
  audio.addEventListener('error', function () {
    status.textContent = '音源を読み込めませんでした。ページを再読み込みしてお試しください。';
  });
  window.addEventListener('hashchange', function () {
    const index = fromHash();
    if (index >= 0 && index !== current) selectTrack(index, false, false);
  });

  const initialVolume = audio.volume;
  try {
    audio.volume = 0.5;
    const adjustable = audio.volume === 0.5;
    volume.hidden = !adjustable;
    document.querySelector('#device-volume').hidden = adjustable;
  } catch (_) {
    volume.hidden = true;
    document.querySelector('#device-volume').hidden = false;
  }
  try { audio.volume = initialVolume; } catch (_) {}
  updateVolume();
  updatePlayback();
  document.querySelector('#playback-controls').hidden = false;
  audio.controls = false;
  audio.hidden = true;

  try {
    const response = await fetch('tracks.json?v=20261105-4');
    if (!response.ok) throw new Error('Track list request failed');
    tracks = await response.json();
    if (!Array.isArray(tracks) || !tracks.length) throw new Error('No tracks');
    renderList();
    selectTrack(Math.max(0, fromHash()), false, false);
    if ('mediaSession' in navigator) {
      const handlers = {
        play: play,
        pause: pause,
        previoustrack: function () { selectTrack(current - 1, true, true); },
        nexttrack: function () { selectTrack(current + 1, true, true); },
        seekto: function (details) {
          if (Number.isFinite(details.seekTime)) seekTo(details.seekTime);
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
