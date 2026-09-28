// Preview player (chapters, overlay, keyboard) and the hooks used by the headless renderer.
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

  const D = T.DURATION;
  const FPS = 60;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const timecode = (t) => `${t.toFixed(2).padStart(5, '0')} s`;

  const stage = document.getElementById('stage');
  const btn = document.getElementById('play');
  const line = document.getElementById('timeline');
  const segsEl = line.querySelector('.segs');
  const headEl = line.querySelector('.head');
  const tip = line.querySelector('.tip');
  const timeEl = document.getElementById('time');
  const chapterEl = document.getElementById('chapter');
  const hudBtn = document.getElementById('overlay');
  const muteBtn = document.getElementById('mute');
  const hud = document.getElementById('hud');
  const hudNum = hud.querySelector('.num');
  const hudName = hud.querySelector('.name');
  const hudTc = hud.querySelector('.tc');
  const hudProg = hud.querySelector('.prog i');

  // YouTube-style chapters: one timeline segment per chapter.
  const chapters = T.CHAPTERS.map((c, i, all) => ({
    n: i + 1,
    name: c.name,
    start: c.beat * T.BEAT,
    end: i + 1 < all.length ? all[i + 1].beat * T.BEAT : D,
  }));
  for (const c of chapters) {
    c.el = document.createElement('div');
    c.el.className = 'seg';
    c.el.style.flexGrow = String(c.end - c.start);
    c.fill = document.createElement('i');
    c.el.appendChild(c.fill);
    segsEl.appendChild(c.el);
  }
  const chapterAt = (t) => chapters.find((c) => t >= c.start && t < c.end) ?? chapters.at(-1);
  const xOf = (t) => {
    const c = chapterAt(t);
    return c.el.offsetLeft + ((t - c.start) / (c.end - c.start)) * c.el.offsetWidth;
  };
  const tOf = (x) => {
    for (const c of chapters) if (x <= c.el.offsetLeft + c.el.offsetWidth) return clamp(c.start + ((x - c.el.offsetLeft) / c.el.offsetWidth) * (c.end - c.start), c.start, c.end);
    return D;
  };

  // The soundtrack is rendered once into a buffer; playback restarts it at the playhead.
  let audioCtx = null, buffer = null, source = null, gain = null, muted = false;
  let playing = false, base = clamp(+(params.get('t') || 0), 0, D), startedAt = 0;
  let dragging = false, resumeAfterDrag = false;
  const clock = () => (playing ? base + (audioCtx.currentTime - startedAt) : base);

  async function play() {
    if (base >= D) base = 0;
    if (!audioCtx) {
      audioCtx = new AudioContext();
      gain = audioCtx.createGain();
      gain.connect(audioCtx.destination);
    }
    gain.gain.value = muted ? 0 : 1;
    btn.textContent = '…';
    await readyPromise;
    buffer ??= await window.Score.render(window.Trailer.landings);
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
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
    if (was && !dragging) play();
  }

  btn.onclick = () => (playing ? pause() : play());
  const setHud = (on) => {
    hud.classList.toggle('on', on);
    hudBtn.setAttribute('aria-pressed', String(on));
  };
  hudBtn.onclick = () => setHud(hudBtn.getAttribute('aria-pressed') !== 'true');
  setHud(params.has('hud'));
  muteBtn.onclick = () => {
    muted = !muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.textContent = muted ? 'Muted' : 'Sound on';
    if (gain) gain.gain.value = muted ? 0 : 1;
  };

  const pointerT = (e) => tOf(e.clientX - line.getBoundingClientRect().left);
  line.addEventListener('pointerdown', (e) => {
    dragging = true;
    resumeAfterDrag = playing;
    if (playing) pause();
    line.setPointerCapture(e.pointerId);
    base = pointerT(e);
  });
  line.addEventListener('pointermove', (e) => {
    const t = pointerT(e);
    tip.textContent = `${String(chapterAt(t).n).padStart(2, '0')} ${chapterAt(t).name} · ${mmss(t)}`;
    tip.style.left = `${xOf(t)}px`;
    for (const c of chapters) c.el.classList.toggle('hover', c === chapterAt(t));
    if (dragging) base = t;
  });
  line.addEventListener('pointerleave', () => chapters.forEach((c) => c.el.classList.remove('hover')));
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (resumeAfterDrag) play();
  };
  line.addEventListener('pointerup', endDrag);
  line.addEventListener('pointercancel', endDrag);

  // Space play/pause · ←/→ one beat (shift: one bar) · ,/. one frame · p/n previous/next chapter · o overlay · m mute
  addEventListener('keydown', (e) => {
    const now = clock();
    const step = e.shiftKey ? 4 * T.BEAT : T.BEAT;
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    else if (e.code === 'ArrowRight') seek(now + step);
    else if (e.code === 'ArrowLeft') seek(now - step);
    else if (e.key === '.') seek(now + 1 / FPS);
    else if (e.key === ',') seek(now - 1 / FPS);
    else if (e.key === 'n') seek((chapters.find((c) => c.start > now + 0.01) ?? chapters.at(-1)).start);
    else if (e.key === 'p') seek((chapters.filter((c) => c.start < now - 0.3).at(-1) ?? chapters[0]).start);
    else if (e.key === 'o') hudBtn.click();
    else if (e.key === 'm') muteBtn.click();
  });

  const fit = () => {
    const vw = innerWidth, vh = innerHeight - 64;
    const k = Math.min(vw / 1920, vh / 1080);
    stage.style.transform = `translate(${(vw - 1920 * k) / 2}px, ${(vh - 1080 * k) / 2}px) scale(${k})`;
  };
  addEventListener('resize', fit);
  fit();

  function loop() {
    let t = clock();
    if (playing && t >= D) { pause(); base = D; t = D; }
    window.Trailer.draw(ctx, Math.min(t, D - 1e-3));
    const c = chapterAt(t);
    for (const ch of chapters) ch.fill.style.transform = `scaleX(${clamp((t - ch.start) / (ch.end - ch.start))})`;
    headEl.style.left = `${xOf(Math.min(t, D - 1e-3))}px`;
    timeEl.textContent = `${mmss(t)} / ${mmss(Math.ceil(D))}`;
    const label = `${String(c.n).padStart(2, '0')} ${c.name}`;
    if (chapterEl.textContent !== label) chapterEl.textContent = label;
    if (hud.classList.contains('on')) {
      hudNum.textContent = String(c.n).padStart(2, '0');
      hudName.textContent = c.name;
      const beat = t / T.BEAT;
      hudTc.textContent = `${timecode(t)} · bar ${Math.floor(beat / 4) + 1} · beat ${Math.floor(beat % 4) + 1}`;
      hudProg.style.transform = `scaleX(${clamp(t / D)})`;
    }
    requestAnimationFrame(loop);
  }

  readyPromise.then(() => {
    document.getElementById('loading').remove();
    requestAnimationFrame(loop);
  });
})();
