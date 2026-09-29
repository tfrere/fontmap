// Preview player (the Reachy Mini trailer's timeline and controls) and the hooks
// used by the headless renderer.
(function () {
  const T = window.TIMELINE;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);
  const renderMode = params.has('render');
  if (renderMode) document.body.classList.add('render');

  const acc = document.createElement('canvas');
  acc.width = canvas.width;
  acc.height = canvas.height;
  const accCtx = acc.getContext('2d');

  // Averages `samples` sub-frames spread over a 180-degree shutter.
  function renderFrame(frame, fps = 60, samples = 1) {
    if (samples <= 1) {
      window.Trailer.draw(ctx, frame / fps);
      return;
    }
    for (let k = 0; k < samples; k++) {
      window.Trailer.draw(ctx, (frame + (k / samples) * 0.5) / fps, frame / fps);
      accCtx.globalAlpha = 1 / (k + 1);
      accCtx.drawImage(canvas, 0, 0);
    }
    accCtx.globalAlpha = 1;
    ctx.drawImage(acc, 0, 0);
  }

  function contactSheet(times, cols = 8, thumbW = 480) {
    const thumbH = Math.round((thumbW * 9) / 16);
    const rows = Math.ceil(times.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * thumbW;
    sheet.height = rows * (thumbH + 28);
    const s = sheet.getContext('2d');
    s.fillStyle = '#222';
    s.fillRect(0, 0, sheet.width, sheet.height);
    times.forEach((t, i) => {
      window.Trailer.draw(ctx, t);
      const x = (i % cols) * thumbW, y = Math.floor(i / cols) * (thumbH + 28);
      s.drawImage(canvas, x + 2, y + 2, thumbW - 4, thumbH - 4);
      s.fillStyle = '#ddd';
      s.font = '16px "Space Mono"';
      s.fillText(`${t.toFixed(2)}s  b${(t / T.BEAT).toFixed(2)}`, x + 8, y + thumbH + 20);
    });
    return sheet.toDataURL('image/png');
  }

  const readyPromise = window.Trailer.ready();
  window.__trailer = {
    ready: readyPromise,
    duration: T.DURATION,
    renderFrame,
    frameDataURL: (type = 'image/png', q) => canvas.toDataURL(type, q),
    still: (t) => { window.Trailer.draw(ctx, t); return canvas.toDataURL('image/png'); },
    contactSheet,
    audioWavBase64: () => window.Score.renderWavBase64(window.Trailer.landings),
  };
  if (renderMode) return;

  const { Timeline, timecode, clock: mmss } = window.PlayerTimeline;
  const D = T.DURATION;
  const FPS = 60;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

  const stage = document.getElementById('stage');
  const controls = document.getElementById('controls');
  const btn = document.getElementById('play');
  const timeEl = document.getElementById('time');
  const chapterEl = document.getElementById('chapter');
  const overlayBtn = document.getElementById('overlay');
  const tlBtn = document.getElementById('tlmode');
  const muteBtn = document.getElementById('mute');
  const volIn = document.getElementById('volume');
  const hud = document.getElementById('hud');
  const hudNum = hud.querySelector('.num');
  const hudName = hud.querySelector('.name');
  const hudTc = hud.querySelector('.tc');
  const hudProg = hud.querySelector('.prog i');

  const chapters = T.CHAPTERS.map((c, i, all) => ({
    tag: String(i + 1).padStart(2, '0'),
    name: c.name,
    start: c.beat * T.BEAT,
    end: i + 1 < all.length ? all[i + 1].beat * T.BEAT : D,
  }));
  const chapterAt = (t) => chapters.find((c) => t >= c.start && t < c.end) ?? chapters.at(-1);

  // The soundtrack is rendered once into a buffer; playback restarts it at the playhead.
  let audioCtx = null, buffer = null, source = null, gainNode = null;
  let playing = false, base = clamp(+(params.get('t') || 0), 0, D), startedAt = 0;
  let resumeAfterDrag = false;
  const clock = () => (playing ? base + (audioCtx.currentTime - startedAt) : base);

  // Volume: one level, persisted with the mute state.
  let vol = { level: 1, muted: false };
  try {
    const saved = JSON.parse(localStorage.getItem('volume') ?? '{}');
    if (typeof saved.level === 'number') vol.level = clamp(saved.level);
    vol.muted = saved.muted === true;
  } catch {}
  const gain = () => (vol.muted ? 0 : vol.level);
  function applyVolume() {
    const g = gain();
    if (gainNode) gainNode.gain.value = g;
    const pct = Math.round(vol.level * 100);
    volIn.value = String(pct);
    volIn.style.setProperty('--fill', `${vol.muted ? 0 : pct}%`);
    volIn.setAttribute('aria-valuetext', vol.muted ? 'muted' : `${pct}%`);
    muteBtn.setAttribute('aria-pressed', String(vol.muted));
    muteBtn.title = vol.muted ? 'Unmute (M)' : 'Mute (M)';
    muteBtn.dataset.level = g === 0 ? '0' : g < 0.5 ? '1' : '2';
    try {
      localStorage.setItem('volume', JSON.stringify(vol));
    } catch {}
  }
  const setVolume = (level) => {
    vol = { level: clamp(level), muted: false };
    applyVolume();
  };
  const toggleMute = () => {
    vol.muted = !vol.muted;
    if (!vol.muted && vol.level === 0) vol.level = 0.5;
    applyVolume();
  };
  muteBtn.onclick = toggleMute;
  volIn.addEventListener('input', () => setVolume(volIn.value / 100));
  applyVolume();

  async function play() {
    if (base >= D) base = 0;
    if (!audioCtx) {
      audioCtx = new AudioContext();
      gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
    }
    gainNode.gain.value = gain();
    btn.textContent = '…';
    buffer ??= await audioReady;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(0, base);
    startedAt = audioCtx.currentTime;
    playing = true;
    btn.textContent = '❚❚';
  }

  function pause() {
    if (playing) base = clock();
    playing = false;
    if (source) { source.stop(); source = null; }
    btn.textContent = '▶';
  }

  function seek(t) {
    const was = playing;
    if (was) pause();
    base = clamp(t, 0, D);
    if (was) play();
  }

  btn.onclick = () => (playing ? pause() : play());

  // Chapter titles / timecode on the image: part of the edit view, on by default
  // there (?hud forces it on everywhere).
  let overlayOn = true;
  let editing = false;
  const showHud = () => hud.classList.toggle('on', params.has('hud') || (editing && overlayOn));
  overlayBtn.onclick = () => {
    overlayOn = !overlayOn;
    overlayBtn.setAttribute('aria-pressed', String(overlayOn));
    showHud();
  };

  const fit = () => {
    const vw = innerWidth, vh = innerHeight - controls.offsetHeight;
    const k = Math.min(vw / 1920, vh / 1080);
    stage.style.transform = `translate(${(vw - 1920 * k) / 2}px, ${(vh - 1080 * k) / 2}px) scale(${k})`;
  };
  addEventListener('resize', fit);
  fit();

  // One small frame of the film, drawn off screen.
  const shot = document.createElement('canvas');
  shot.width = 1920;
  shot.height = 1080;
  const shotCtx = shot.getContext('2d');
  const still = (t, w, h) => {
    window.Trailer.draw(shotCtx, clamp(t, 0, D - 1e-3));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(shot, 0, 0, w, h);
    return c;
  };

  // Peaks of the rendered soundtrack for the music lane, 0-100 per 1/100 s.
  function peaksOf(buf) {
    const perSecond = 100;
    const n = Math.ceil(buf.duration * perSecond);
    const step = buf.sampleRate / perSecond;
    const chans = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
    const raw = new Float32Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (const d of chans) for (let j = Math.floor(i * step), e = Math.min(d.length, Math.floor((i + 1) * step)); j < e; j++) v = Math.max(v, Math.abs(d[j]));
      raw[i] = v;
      max = Math.max(max, v);
    }
    return { perSecond, values: Array.from(raw, (v) => Math.round((v / (max || 1)) * 100)) };
  }

  // Film frames for the hover preview and the edit view's filmstrip, drawn a
  // few at a time once the player is up.
  function buildFrames(tl) {
    const fps = 10, width = 192, height = 108, cols = 20;
    const count = Math.ceil(D * fps);
    const sheet = document.createElement('canvas');
    sheet.width = cols * width;
    sheet.height = Math.ceil(count / cols) * height;
    const s = sheet.getContext('2d');
    let i = 0;
    const next = () => {
      for (const end = Math.min(count, i + 6); i < end; i++) s.drawImage(still((i + 0.5) / fps, width, height), (i % cols) * width, Math.floor(i / cols) * height);
      if (i < count) return setTimeout(next, 0);
      sheet.toBlob((blob) => tl.setFrames({ src: URL.createObjectURL(blob), fps, cols, width, height, count }), 'image/jpeg', 0.8);
    };
    next();
  }

  const audioReady = readyPromise.then(() => window.Score.render(window.Trailer.landings));

  Promise.all([readyPromise, audioReady]).then(([, buf]) => {
    buffer = buf;
    const narrow = matchMedia('(max-width: 640px)').matches;
    let savedMode = 'light';
    try {
      if (!narrow) savedMode = localStorage.getItem('tl-mode') ?? savedMode;
    } catch {}

    const tl = new Timeline(document.getElementById('timeline'), {
      duration: D,
      fps: FPS,
      t: base,
      clips: chapters.map((c) => ({ start: c.start, end: c.end, label: c.name, tag: c.tag, thumb: still(c.start + Math.min(0.6, (c.end - c.start) / 2), 320, 180).toDataURL('image/jpeg', 0.8) })),
      peaks: peaksOf(buf),
      beats: Array.from({ length: Math.round(D / T.BEAT) }, (_, i) => i * T.BEAT),
      events: window.Score.events,
      mode: savedMode,
      onMode: (mode) => {
        editing = mode === 'expanded';
        controls.classList.toggle('tl-open', editing);
        tlBtn.setAttribute('aria-pressed', String(editing));
        try {
          localStorage.setItem('tl-mode', mode);
        } catch {}
        showHud();
        fit();
      },
      onScrub: (phase, t) => {
        if (phase === 'start') {
          resumeAfterDrag = playing;
          if (playing) pause();
          base = clamp(t, 0, D);
        } else if (phase === 'move') base = clamp(t, 0, D);
        else if (resumeAfterDrag) play();
      },
    });

    // The bar grows / shrinks and the film rescales with it, instead of jumping.
    const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
    const switchMode = () => {
      const from = controls.offsetHeight;
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!calm) stage.style.transition = `transform 220ms ${EASE}`;
      tl.toggleMode();
      showTime(clock());
      const to = controls.offsetHeight;
      if (calm) return;
      controls.style.overflow = 'hidden';
      controls.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 220, easing: EASE }).finished.finally(() => {
        controls.style.overflow = '';
        stage.style.transition = '';
      });
    };
    tlBtn.onclick = switchMode;
    // The T keycap in the button looks pressed while the key or the button is held.
    const keycap = (down) => tlBtn.classList.toggle('down', down);
    tlBtn.addEventListener('pointerdown', () => keycap(true));
    for (const ev of ['pointerup', 'pointercancel', 'blur']) addEventListener(ev, () => keycap(false));
    addEventListener('keyup', (e) => e.code === 'KeyT' && keycap(false));

    // Space play/pause · ←/→ one beat (shift: one bar) · ↑/↓ volume · ,/. one frame ·
    // p/n previous/next chapter · t edit view · +/-/0 zoom · o overlay · m mute
    addEventListener('keydown', (e) => {
      if (e.target === volIn && e.code.startsWith('Arrow')) return;
      const now = clock();
      const step = e.shiftKey ? 4 * T.BEAT : T.BEAT;
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
      else if (e.code === 'ArrowRight') seek(now + step);
      else if (e.code === 'ArrowLeft') seek(now - step);
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        setVolume(Math.round((vol.level + (e.code === 'ArrowUp' ? 0.1 : -0.1)) * 10) / 10);
      } else if (e.key === 'm') toggleMute();
      else if (e.key === '.') seek(now + 1 / FPS);
      else if (e.key === ',') seek(now - 1 / FPS);
      else if (e.key === 'n') seek((chapters.find((c) => c.start > now + 0.01) ?? chapters.at(-1)).start);
      else if (e.key === 'p') seek((chapters.filter((c) => c.start < now - 0.3).at(-1) ?? chapters[0]).start);
      else if (e.key === 'o') overlayBtn.click();
      else if (e.key === 't' && !narrow) {
        keycap(true);
        if (!e.repeat) switchMode();
      }
      else if (e.key === '=' || e.key === '+') tl.zoomBy(1.5);
      else if (e.key === '-') tl.zoomBy(1 / 1.5);
      else if (e.key === '0') tl.fit();
    });

    // Viewer bar: fades out (with the cursor) after a moment without the mouse
    // while playing, back on any move, key or touch.
    let lastInput = performance.now();
    const wake = () => (lastInput = performance.now());
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) addEventListener(ev, wake, { passive: true });
    const updateIdle = () => {
      const idle = playing && !editing && performance.now() - lastInput > 2500 && !controls.matches(':hover');
      if (idle !== document.body.classList.contains('idle')) document.body.classList.toggle('idle', idle);
    };

    const showTime = (t) => {
      const fmt = editing ? (x) => timecode(x, FPS) : mmss;
      const txt = `${fmt(t)} / ${fmt(D)}`;
      if (timeEl.textContent !== txt) timeEl.textContent = txt;
    };

    function loop() {
      let t = clock();
      if (playing && t >= D) { pause(); base = D; t = D; }
      window.Trailer.draw(ctx, Math.min(t, D - 1e-3));
      tl.update(t);
      updateIdle();
      showTime(t);
      const c = chapterAt(t);
      if (chapterEl.textContent !== c.name) chapterEl.textContent = c.name;
      if (hud.classList.contains('on')) {
        hudNum.textContent = c.tag;
        hudName.textContent = c.name;
        const beat = t / T.BEAT;
        hudTc.textContent = `${timecode(t, FPS)} · bar ${Math.floor(beat / 4) + 1} · beat ${Math.floor(beat % 4) + 1}`;
        hudProg.style.transform = `scaleX(${clamp(t / D)})`;
      }
      requestAnimationFrame(loop);
    }

    showHud();
    fit();
    document.getElementById('loading').remove();
    requestAnimationFrame(loop);
    buildFrames(tl);
  });
})();
