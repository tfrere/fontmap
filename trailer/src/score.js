// Soundtrack on the same 128 BPM grid as the picture: recorded typewriter keys,
// margin bell and carriage return (CC0, see assets/sounds.js) over synthesised
// thuds, impacts, drone and risers.
(function () {
  const T = window.TIMELINE;
  const SR = 48000;
  const b = (beat) => beat * T.BEAT;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  const decode = (ctx, b64) => ctx.decodeAudioData(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);

  // Returns the sound-effect events (start, end, label) for the player's SFX lane.
  async function build(ctx, landings) {
    const r = rng(2026);
    const events = [];
    const log = (start, end, label) => events.push({ start, end, label });
    const S0 = window.SOUNDS;
    const keyBufs = await Promise.all(S0.keys.map((k) => decode(ctx, k)));
    const bellBuf = await decode(ctx, S0.bell);
    const retBuf = await decode(ctx, S0.ret);
    const noise = ctx.createBuffer(1, SR * 2, SR);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.9, 0);
    master.gain.setValueAtTime(0.9, T.DURATION - 0.45);
    master.gain.linearRampToValueAtTime(0, T.DURATION);
    master.connect(comp).connect(ctx.destination);

    const ir = ctx.createBuffer(2, SR * 2.6, SR);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const verbIn = ctx.createGain();
    verbIn.gain.value = 0.22;
    const verbTone = ctx.createBiquadFilter();
    verbTone.type = 'lowpass';
    verbTone.frequency.value = 5200;
    verbIn.connect(verbTone).connect(verb).connect(master);

    function out(node, send = 0.15, pan = 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p).connect(master);
      if (send) {
        const s = ctx.createGain();
        s.gain.value = send;
        p.connect(s).connect(verbIn);
      }
    }

    function env(t, peak, decay, attack = 0.001) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      return g;
    }

    function noiseSrc(t, dur) {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.start(t, r() * 1.5);
      s.stop(t + dur + 0.05);
      return s;
    }

    function filter(type, freq, q = 0.7) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    }

    function osc(type, freq, t, dur) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    }

    function sample(buf, t, amp, rate = 1, pan = 0, send = 0.12, lowpass = 0) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = amp;
      let node = src.connect(g);
      if (lowpass) node = node.connect(filter('lowpass', lowpass));
      out(node, send, pan);
      src.start(t);
    }

    // A real keystroke; `tone` shifts it from heavy (below 1) to tiny and bright (2+).
    function key(t, amp, tone = 1, pan = 0, send = 0.12) {
      const buf = keyBufs[Math.floor(r() * keyBufs.length)];
      sample(buf, t, amp * 1.4, clamp(0.8 + 0.45 * (tone - 0.8), 0.7, 2.2) * (0.97 + r() * 0.06), pan, send);
    }

    // Space bar: a key played lower and darker, used as the backbeat.
    function space(t, amp) {
      sample(keyBufs[3], t, amp * 1.6, 0.72, 0, 0.1, 1400);
    }

    // Platen / press thud, doubles as the kick.
    function thump(t, amp) {
      const bus = ctx.createGain();
      out(bus, 0.08);
      const o = osc('sine', 150, t, 0.5);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
      o.connect(env(t, amp, 0.42, 0.002)).connect(bus);
      noiseSrc(t, 0.06).connect(filter('lowpass', 420)).connect(env(t, amp * 0.5, 0.05)).connect(bus);
    }

    function impact(t, amp) {
      log(t, t + 1.2, 'impact');
      const bus = ctx.createGain();
      out(bus, 0.5);
      const o = osc('sine', 95, t, 2.6);
      o.frequency.exponentialRampToValueAtTime(29, t + 1.1);
      o.connect(env(t, amp, 2.4, 0.003)).connect(bus);
      const sub = osc('triangle', 48, t, 2);
      sub.frequency.exponentialRampToValueAtTime(34, t + 1.5);
      sub.connect(env(t, amp * 0.45, 1.8, 0.01)).connect(bus);
      const lp = filter('lowpass', 1600);
      lp.frequency.setValueAtTime(1600, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + 1.2);
      noiseSrc(t, 1.4).connect(lp).connect(env(t, amp * 0.55, 1.3)).connect(bus);
      noiseSrc(t, 0.15).connect(filter('highpass', 3000)).connect(env(t, amp * 0.35, 0.1)).connect(bus);
    }

    function bell(t, amp) {
      log(t, t + 1, 'bell');
      sample(bellBuf, t, amp * 1.3, 1, 0.15, 0.35);
    }

    // Carriage return, timed so its final clunk lands on `t`.
    function carriage(t, amp) {
      log(t - S0.retLead, t + 0.2, 'carriage return');
      sample(retBuf, t - S0.retLead, amp * 1.3, 1, -0.1, 0.25);
    }

    function whoosh(t, dur, amp) {
      log(t, t + dur, 'whoosh');
      const bp = filter('bandpass', 5000, 1.2);
      bp.frequency.setValueAtTime(6000, t);
      bp.frequency.exponentialRampToValueAtTime(220, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      noiseSrc(t, dur).connect(bp).connect(g);
      out(g, 0.35);
    }

    // Low detuned-saw drone; the filter opens as the story builds.
    function drone(t0, t1, freqs, amp, cutoff0, cutoff1, release = 0.03) {
      const lp = filter('lowpass', cutoff0, 0.9);
      lp.frequency.setValueAtTime(cutoff0, t0);
      lp.frequency.exponentialRampToValueAtTime(cutoff1, t1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, Math.min(t1, t0 + 1.2));
      g.gain.setValueAtTime(amp, t1 - release);
      g.gain.linearRampToValueAtTime(0, t1);
      lp.connect(g);
      out(g, 0.3);
      freqs.forEach((f) => [-7, 7].forEach((cents) => {
        const o = osc('sawtooth', f, t0, t1 - t0);
        o.detune.value = cents;
        o.connect(lp);
      }));
    }

    // Surf seen from above: filtered noise that swells and falls once a bar, with the picture's swell.
    function surf(t0, t1, amp) {
      log(t0, t1, 'surf');
      const period = b(4);
      const lp = filter('lowpass', 500, 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.setValueAtTime(0.0001, t0);
      for (let c = t0; c < t1; c += period) {
        const peak = amp * clamp((c - t0) / period + 0.4, 0, 1);
        lp.frequency.setValueAtTime(420, c);
        lp.frequency.exponentialRampToValueAtTime(2600, c + period * 0.55);
        lp.frequency.exponentialRampToValueAtTime(420, c + period);
        g.gain.exponentialRampToValueAtTime(peak, c + period * 0.55);
        g.gain.exponentialRampToValueAtTime(peak * 0.15, c + period);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      noiseSrc(t0, t1 - t0).connect(lp).connect(g);
      out(g, 0.4);
    }

    // The water drawn back: a long hiss that sinks and thins out.
    function backwash(t0, t1, amp) {
      log(t0, t1, 'backwash');
      const bp = filter('bandpass', 3000, 0.8);
      bp.frequency.setValueAtTime(3200, t0);
      bp.frequency.exponentialRampToValueAtTime(300, t1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      noiseSrc(t0, t1 - t0).connect(bp).connect(g);
      out(g, 0.45);
    }

    function pluck(t, freq, amp, pan = 0) {
      const bus = ctx.createGain();
      out(bus, 0.4, pan);
      osc('sine', freq, t, 1.4).connect(env(t, amp, 1.3, 0.002)).connect(bus);
      osc('triangle', freq * 2, t, 0.5).connect(env(t, amp * 0.25, 0.4, 0.002)).connect(bus);
    }

    function chord(t, freqs, amp, stagger, spread) {
      freqs.forEach((f, j) => pluck(t + j * stagger, f, amp, (j - (freqs.length - 1) / 2) * spread));
      log(t, t + 1.3, 'chord');
    }

    function typeText(t, text, amp, gap = 0.034) {
      log(t, t + text.length * gap + 0.05, `type "${text}"`);
      [...text].forEach((ch, i) => {
        if (ch !== ' ') key(t + i * gap + r() * 0.008, amp * (0.8 + r() * 0.4), 0.85 + r() * 0.3, (r() - 0.5) * 0.3);
      });
    }

    const S = T.SCENES;

    // Kept sparse on purpose: one weighty hit per section, typewriter sounds only
    // where something is typed or set, and no risers.

    // Bar 1: macro shots on the anatomy of the A, a soft thud and a key per shot.
    drone(0, b(T.INVERT_BEAT) - 0.02, [36.71, 55], 0.04, 140, 600);
    impact(0, 0.7);
    T.MACRO.forEach((m, i) => {
      thump(b(m.beat), 0.7);
      key(b(m.beat) + 0.02, 0.2, 1.8, (i - 1.5) * 0.3, 0.3);
    });
    bell(b(T.MACRO[3].beat), 0.6);
    carriage(b(T.INVERT_BEAT), 0.8);

    // Bar 2: inversion; one key per new face, rolling faster and a touch louder,
    // then the drop to Playfair on the downbeat of bar 3.
    impact(b(T.INVERT_BEAT), 0.8);
    T.LAYERS.slice(1).forEach((l) => {
      const k = (l.beat - T.INVERT_BEAT) / (T.LAND - T.INVERT_BEAT);
      key(b(l.beat), 0.3 + 0.2 * k, 0.9 + r() * 0.25, (r() - 0.5) * 0.4, 0.08);
      if (Number.isInteger(l.beat)) thump(b(l.beat), 0.5);
    });
    impact(b(T.LAND), 0.55);
    thump(b(T.LAND), 0.8);
    key(b(T.LAND), 0.5, 0.8);
    drone(b(T.INVERT_BEAT), b(S.app[1] - 0.5), [36.71, 73.42, 110], 0.045, 200, 2200);

    // Bars 3-4: the pull back into the sea. A few ticks while the count rolls, then
    // only the surf, breathing once a bar.
    const E = T.SEA;
    const s0 = S.sea[0];
    whoosh(b(s0), b(E.pull), 0.2);
    for (let tt = b(s0 + 0.5); tt < b(s0 + 2.5); tt += 0.07 + r() * 0.03) key(tt, 0.05, 2 + r() * 0.4, (r() - 0.5) * 0.4, 0.04);
    surf(b(s0), b(E.tide + 2), 0.12);
    typeText(b(E.caption), 'A sea of', 0.25, 0.035);
    typeText(b(E.caption + 0.25), 'type.', 0.25, 0.035);

    // The tide goes out in one breath over a held chord, and lands on the downbeat.
    backwash(b(E.tide), b(E.land), 0.2);
    chord(b(E.tide), [146.83, 220, 293.66, 349.23], 0.07, 0.03, 0.3);
    thump(b(E.land), 0.7);
    chord(b(E.land), [146.83, 220, 293.66, 369.99], 0.08, 0.015, 0.25);

    // Bars 6-9: into the app. A light pulse of keys on the beat, a thud per bar;
    // each action gets its own click or key and a note.
    const A = T.APP;
    for (let beat = A.enter; beat < A.out; beat += 0.5) {
      const t0 = b(beat);
      if (Number.isInteger(beat)) key(t0, 0.12, 1, (r() - 0.5) * 0.3, 0.05);
      else key(t0, 0.06, 1.2, (r() - 0.5) * 0.4, 0.04);
      if (beat % 4 === 0) thump(t0, 0.35);
    }
    chord(b(A.ui), [293.66, 440, 587.33], 0.08, 0.03, 0.3);
    const click = (tt) => { log(tt, tt + 0.15, 'click'); key(tt, 0.3, 2, 0.1, 0.04); key(tt + 0.07, 0.14, 1.7, 0.1, 0.04); };
    const notes = [587.33, 523.25, 440, 493.88, 392, 349.23];
    let n = 0;
    A.features.forEach((f) => {
      if (f.click) click(b(f.at));
      if (f.key) { log(b(f.at), b(f.at) + 0.15, `key ${f.key}`); key(b(f.at), 0.8, 0.75); }
      if (f.type) typeText(b(f.at) + 0.08, f.type, 0.25, 0.05);
      (f.keys || [f]).forEach((e) => {
        if (f.keys) { log(b(e.at), b(e.at) + 0.15, `key ${e.key}`); key(b(e.at), 0.7, 0.8); }
        pluck(b(e.at), notes[n++ % notes.length], 0.1, -0.2);
      });
    });
    whoosh(b(A.out), 0.9, 0.16);
    bell(b(S.app[1] - 0.5) - 0.1, 0.6);

    // Bar 10: the wordmark in outline on the carriage-return clunk, then inked, resolved on D major.
    const l0 = b(S.logo[0]);
    impact(l0, 0.8);
    carriage(l0, 0.8);
    drone(l0, T.DURATION, [73.42, 110, 146.83, 185], 0.025, 900, 500, 0.5);
    const inkT = b(T.INK_BEAT);
    thump(inkT, 0.8);
    key(inkT, 0.7, 0.7);
    chord(inkT, [146.83, 220, 293.66, 369.99, 440], 0.09, 0, 0.2);
    typeText(b(T.INK_BEAT + 0.5), 'An ode to type.', 0.15, 0.03);
    return events.sort((a, c) => a.start - c.start);
  }

  async function render(landings) {
    const ctx = new OfflineAudioContext(2, Math.ceil(T.DURATION * SR), SR);
    Score.events = await build(ctx, landings);
    const buf = await ctx.startRendering();
    let peak = 0;
    for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    const gain = peak > 0 ? 0.89 / peak : 1;
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= gain; }
    return buf;
  }

  function wav(buf) {
    const n = buf.length, ch = buf.numberOfChannels;
    const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, SR, true); out.setUint32(28, SR * ch * 2, true); out.setUint16(32, ch * 2, true);
    out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { out.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 32767, true); o += 2; }
    return new Uint8Array(out.buffer);
  }

  async function renderWavBase64(landings) {
    const bytes = wav(await render(landings));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  const Score = { render, renderWavBase64, events: [] };
  window.Score = Score;
})();
