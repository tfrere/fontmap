// Player timeline from the Reachy Mini trailer (huggingface.co/spaces/tfrere/reachy-mini-trailer),
// loaded as a classic script so the page also works when opened straight from disk.
(function () {
  // Player timeline with two faces:
  // - 'light': a classic viewer bar (chapters, progress, a key frame on hover).
  // - 'expanded': an edit view: track headers, a time ruler with the playhead
  //   timecode, one clip per shot (its key frame at the head), the waveform
  //   with the beat grid, and a sound-effects lane. It opens on ~20 s around
  //   the playhead. Zoom with ctrl/cmd + wheel, a trackpad pinch, the -/+ / Fit
  //   buttons or a double click on a clip; the wheel scrolls.
  // Self-contained (styles in player-timeline.css): it only knows times, clips, peaks
  // and sounds, and reports scrubbing through callbacks.
  //
  //   const tl = new PlayerTimeline.Timeline(host, {
  //     duration: 150, start: 0, fps: 30, t: 0,             // t: initial playhead
  //     clips: [{ start: 0, end: 11, label: 'Cold open', tag: '00', thumb: 'a.jpg' }, ...],
  //     peaks: { perSecond: 100, values: [0..100, ...] },  // optional
  //     beats: [0.52, 1.15, ...],                           // optional, seconds
  //     events: [{ start, end, label }],                    // optional sound lane
  //     toggles: [{ label, title, on, onChange }],          // optional edit-view switches
  //     frames: { src, fps, cols, width, height, count },   // optional sprite, see setFrames
  //     onScrub: (phase, t) => {},                          // 'start' | 'move' | 'end'
  //     onMode: mode => {},
  //   });
  //   tl.update(t);            // every frame
  //   tl.setMode('expanded');  // or tl.toggleMode()

  const MAX_ZOOM = 40;
  // Seconds of film the edit view shows when it opens.
  const DEFAULT_SPAN = 20;
  const pad = n => String(n).padStart(2, '0');

  // MM:SS:FF, frames counted at `fps`.
  function timecode(t, fps = 30) {
    const f = Math.max(0, Math.floor(t * fps + 1e-6));
    const s = Math.floor(f / fps);
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f % fps)}`;
  }

  // M:SS, for viewers.
  function clock(t) {
    const s = Math.max(0, Math.floor(t + 1e-6));
    return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  }

  const h = (tag, cls, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    parent?.appendChild(e);
    return e;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Ruler steps (seconds); the first one at least ~80 px apart is used.
  const STEPS = [1 / 30, 1 / 15, 1 / 6, 0.5, 1, 2, 5, 10, 15, 30, 60];

  class Timeline {
    constructor(host, opts) {
      this.o = { start: 0, fps: 30, mode: 'light', peaks: null, beats: [], onScrub: () => {}, onMode: () => {}, ...opts };
      const { start, duration } = this.o;
      this.host = host;
      host.classList.add('tl');
      host.replaceChildren();
      host.setAttribute('role', 'slider');
      host.setAttribute('tabindex', '-1');
      host.setAttribute('aria-valuemin', '0');
      host.setAttribute('aria-valuemax', String(Math.round(duration - start)));

      // Track headers (edit view only).
      this.gutter = h('div', 'tl-gutter', host);
      const zoom = h('div', 'tl-gh tl-gh-ruler', this.gutter);
      this.zoomBtns = [
        ['−', 'Zoom out', () => this.zoomBy(1 / 2), z => z <= 1],
        ['+', 'Zoom in (ctrl/cmd + scroll)', () => this.zoomBy(2), z => z >= MAX_ZOOM],
        ['Fit', 'Whole film (0)', () => this.fit(), z => z <= 1],
      ].map(([txt, title, fn, off]) => {
        const b = h('button', txt === 'Fit' ? 'tl-zoom tl-zoom-fit' : 'tl-zoom', zoom);
        b.type = 'button';
        b.textContent = txt;
        b.title = b.ariaLabel = title;
        b.addEventListener('click', fn);
        b.addEventListener('pointerdown', e => e.stopPropagation());
        return [b, off];
      });
      for (const [cls, txt] of [['shots', 'Shots'], ['music', 'Music'], ['sfx', 'SFX']]) h('span', '', h('div', `tl-gh tl-gh-${cls}`, this.gutter)).textContent = txt;
      // Extra edit-view switches (e.g. an on-image overlay), under the shots header.
      for (const tg of this.o.toggles ?? []) {
        const b = h('button', 'tl-toggle', this.gutter.querySelector('.tl-gh-shots'));
        b.type = 'button';
        b.textContent = tg.label;
        b.title = tg.title ?? tg.label;
        b.addEventListener('pointerdown', e => e.stopPropagation());
        const set = on => b.setAttribute('aria-pressed', String((tg.on = on)));
        set(Boolean(tg.on));
        b.addEventListener('click', () => {
          set(!tg.on);
          tg.onChange?.(tg.on);
        });
        tg.set = set;
      }

      this.scroller = h('div', 'tl-scroll', host);
      const body = (this.body = h('div', 'tl-body', this.scroller));
      this.ruler = h('div', 'tl-ruler', body);
      this.rulerCv = h('canvas', '', this.ruler);
      this.clipsEl = h('div', 'tl-clips', body);
      this.filmCv = h('canvas', 'tl-film', this.clipsEl);
      this.waveEl = h('div', 'tl-wave', body);
      this.dim = h('canvas', 'tl-wave-dim', this.waveEl);
      this.litWrap = h('div', 'tl-wave-lit', this.waveEl);
      this.lit = h('canvas', '', this.litWrap);
      this.sfxEl = h('div', 'tl-sfx', body);
      this.head = h('div', 'tl-head', body);
      this.chip = h('div', 'tl-chip', this.head);
      this.tip = h('div', 'tl-tip', host);
      this.tipImg = h('img', '', this.tip);
      this.tipImg.alt = '';
      this.tipFrame = h('div', 'tl-tip-frame', this.tip);
      this.tipText = h('span', 'tl-tip-title', this.tip);
      this.tipMeta = h('span', 'tl-tip-meta', this.tip);

      this.clips = this.o.clips
        .map(c => ({ ...c, start: Math.max(start, c.start), end: Math.min(duration, c.end) }))
        .filter(c => c.end > c.start);
      for (const c of this.clips) {
        c.el = h('div', 'tl-clip', this.clipsEl);
        c.el.style.flexGrow = String(c.end - c.start);
        c.strip = h('div', 'tl-strip', c.el);
        c.fill = h('i', 'tl-fill', c.el);
        c.labelEl = h('span', 'tl-label', c.el);
        c.labelEl.textContent = c.tag ? `${c.tag} ${c.label}` : c.label;
      }
      this.events = (this.o.events ?? [])
        .filter(e => e.end > start && e.start < duration)
        .map(e => {
          const el = h('div', 'tl-event', this.sfxEl);
          el.title = e.label;
          // Short sounds (a clap over a song snippet) stay on top.
          el.style.zIndex = String(e.end - e.start < 1 ? 2 : 1);
          h('span', '', el).textContent = e.label;
          return { ...e, start: Math.max(start, e.start), end: Math.min(duration, e.end), el };
        });
      this.beats = this.o.beats.filter(b => b >= start && b <= duration);

      this.t = clamp(this.o.t ?? start, start, duration);
      this.zoom = 1;
      this.zoomSet = false;
      this.cur = null;
      this.dragging = false;
      this.userScrollAt = -1e9;
      this.bindPointer();
      this.bindZoom();
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(host);
      this.setMode(this.o.mode);
      if (this.o.frames) this.setFrames(this.o.frames);
    }

    // Sprite sheet of film frames ({ src, fps, cols, width, height, count }):
    // a filmstrip in the edit view and the exact frame in the hover preview.
    // Loaded once; setFrames again with a newer sheet swaps it in.
    setFrames(meta) {
      const img = (this.framesImg = new Image());
      img.decoding = 'async';
      img.onload = () => {
        if (img !== this.framesImg) return;
        this.frames = { ...meta, img, url: img.src };
        this.host.classList.add('has-frames');
        this.tipFrame.style.backgroundImage = `url("${img.src}")`;
        this.tipFrame.style.backgroundSize = `${meta.cols * 100}% auto`;
        this.drawWindow();
      };
      img.src = meta.version ? `${meta.src}?v=${meta.version}` : meta.src;
    }

    frameCell(t) {
      const f = this.frames;
      const i = clamp(Math.floor(t * f.fps), 0, f.count - 1);
      return [i % f.cols, Math.floor(i / f.cols)];
    }

    get mode() {
      return this.host.dataset.mode;
    }

    get editing() {
      return this.mode === 'expanded';
    }

    setMode(mode) {
      const change = this.host.dataset.mode && this.host.dataset.mode !== mode;
      this.host.dataset.mode = mode;
      if (change && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (const el of [this.scroller, this.gutter]) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
      }
      // Key frames load the first time the clips are shown.
      if (mode === 'expanded') for (const c of this.clips) if (c.thumb && !c.strip.style.backgroundImage) c.strip.style.backgroundImage = `url("${c.thumb}")`;
      this.o.onMode(mode);
      if (mode !== 'expanded') {
        this.body.style.width = '100%';
        return this.layout();
      }
      // Opens on DEFAULT_SPAN seconds (or the zoom picked by hand this session),
      // the playhead a quarter in.
      this.applyZoom(this.zoomSet ? this.zoom : (this.o.duration - this.o.start) / DEFAULT_SPAN);
      this.scrollTo(this.xOf(clamp(this.t, this.o.start, this.o.duration - 1e-3)) - this.scroller.clientWidth * 0.28, false);
    }

    toggleMode() {
      this.setMode(this.editing ? 'light' : 'expanded');
    }

    applyZoom(z) {
      this.zoom = clamp(z, 1, MAX_ZOOM);
      this.body.style.width = `${this.zoom * 100}%`;
      for (const [b, off] of this.zoomBtns) b.disabled = off(this.zoom);
      this.layout();
    }

    fit() {
      if (this.editing) this.setZoom(1, this.o.start, 0);
    }

    // Zoom around a viewport x (px from the scroller's left edge), keeping the
    // time under it in place. Default anchor: the playhead if visible.
    zoomBy(k, anchor) {
      if (!this.editing) return;
      const vw = this.scroller.clientWidth;
      const sl = this.scroller.scrollLeft;
      anchor ??= this.hx >= sl && this.hx <= sl + vw ? this.hx - sl : vw / 2;
      this.setZoom(this.zoom * k, this.tOf(sl + anchor), anchor);
    }

    setZoom(z, t, anchor) {
      z = clamp(z, 1, MAX_ZOOM);
      if (z === this.zoom) return;
      this.zoomSet = true;
      this.applyZoom(z);
      this.scrollTo(this.xOf(t) - anchor, true);
    }

    zoomToClip(c) {
      const vw = this.scroller.clientWidth;
      this.zoomSet = true;
      this.applyZoom((this.zoom * vw * 0.9) / c.w);
      this.scrollTo(c.x - (vw - c.w) / 2, true);
    }

    scrollTo(x, user) {
      const sl = this.scroller.scrollLeft;
      this.scroller.scrollLeft = x;
      // A scroll event only comes if it moved; it tells programmatic from user.
      if (this.scroller.scrollLeft !== sl) this.auto = !user;
      if (user) this.userScrollAt = performance.now();
    }

    clipAt(t) {
      return this.clips.find(c => t >= c.start && t < c.end) ?? this.clips.at(-1);
    }

    // Clips are laid out with gaps (cuts), so time maps to x clip by clip.
    xOf(t) {
      const c = this.clipAt(t);
      return c.x + ((t - c.start) / (c.end - c.start)) * c.w;
    }

    tOf(x) {
      for (const c of this.clips) if (x <= c.x + c.w) return clamp(c.start + ((x - c.x) / c.w) * (c.end - c.start), c.start, c.end);
      return this.o.duration;
    }

    fmt(t) {
      return this.editing ? timecode(t - this.o.start, this.o.fps) : clock(t - this.o.start);
    }

    layout() {
      for (const c of this.clips) {
        c.x = c.el.offsetLeft;
        c.w = c.el.offsetWidth;
        c.el.classList.toggle('narrow', c.w < 64);
      }
      for (const e of this.events) {
        e.x = this.xOf(e.start);
        e.w = Math.max(3, this.xOf(e.end - 1e-3) - e.x);
        e.el.style.left = `${e.x}px`;
        e.el.style.width = `${e.w}px`;
      }
      // Names go inside the block when it's wide enough, else just after it if
      // there's room before the next sound starts.
      for (const e of this.events) {
        const next = Math.min(this.body.clientWidth, ...this.events.filter(o => o.x > e.x + 1).map(o => o.x));
        const need = e.label.length * 5.6 + 10;
        e.el.classList.toggle('inside', e.w >= need);
        e.el.classList.toggle('side', e.w < need && next - e.x - e.w >= need + 4);
      }
      this.drawWindow();
      this.paint(true);
    }

    // Canvases only cover the visible window (the zoomed body can be far wider
    // than a canvas may be) and are redrawn on scroll.
    drawWindow() {
      const vw = this.scroller.clientWidth;
      const x0 = this.scroller.scrollLeft;
      const x1 = x0 + vw;
      this.winX = x0;
      // Clip names stay pinned to the left edge while their clip is in view.
      for (const c of this.clips) {
        const dx = clamp(x0 - c.x, 0, Math.max(0, c.w - 160));
        if (dx !== c.dx) c.labelEl.style.transform = (c.dx = dx) ? `translateX(${dx}px)` : '';
      }
      const cs = getComputedStyle(this.host);
      const color = k => cs.getPropertyValue(k).trim();
      const dpr = devicePixelRatio || 1;
      const canvas = (cv, hgt) => {
        cv.width = Math.round(vw * dpr);
        cv.height = Math.round(hgt * dpr);
        cv.style.width = `${vw}px`;
        cv.style.height = `${hgt}px`;
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return g;
      };
      const visible = t => t >= this.tOf(x0) - 1 && t <= this.tOf(x1) + 1;

      // Filmstrip: 16:9 tiles along each clip, each showing the frame at its
      // middle, aligned on the clip head so scrolling doesn't shimmer. Drawn
      // under the name line (see .tl-film).
      const ch = parseFloat(color('--tl-shot'));
      if (this.frames && this.editing && vw && ch) {
        const f = this.frames;
        const g = canvas(this.filmCv, ch);
        const tw = (ch * 16) / 9;
        for (const c of this.clips) {
          if (c.x + c.w < x0 || c.x > x1) continue;
          g.save();
          g.beginPath();
          g.roundRect(c.x - x0, 0, c.w, ch, [0, 0, 3, 3]);
          g.clip();
          for (let x = c.x + Math.max(0, Math.floor((x0 - c.x) / tw)) * tw; x < Math.min(c.x + c.w, x1); x += tw) {
            const mid = Math.min(x + tw / 2, c.x + c.w - 1);
            const [col, row] = this.frameCell(c.start + ((mid - c.x) / c.w) * (c.end - c.start));
            g.drawImage(f.img, col * f.width, row * f.height, f.width, f.height, x - x0, 0, tw, ch);
          }
          g.restore();
        }
        this.filmCv.style.transform = `translateX(${x0}px)`;
      }

      const wh = this.waveEl.clientHeight;
      if (vw && wh) {
        const { peaks } = this.o;
        const bar = wh > 20 ? 2 : 1;
        const step = bar + 1;
        for (const [cv, fill] of [[this.dim, color('--tl-wave')], [this.lit, color('--tl-accent')]]) {
          const g = canvas(cv, wh);
          // Beat grid, where beats are far enough apart to read.
          if (cv === this.dim && this.beatsReadable()) {
            {
              g.fillStyle = color('--tl-beatline');
              for (const b of this.beats) if (visible(b)) g.fillRect(Math.round(this.xOf(b) - x0), 0, 1, wh);
            }
          }
          if (!peaks) continue;
          g.fillStyle = fill;
          const { perSecond: ps, values } = peaks;
          for (const c of this.clips) {
            if (c.x + c.w < x0 || c.x > x1) continue;
            const from = c.x + Math.max(0, Math.ceil((x0 - c.x) / step)) * step;
            for (let x = from; x + bar <= Math.min(c.x + c.w, x1 + step); x += step) {
              const t0 = c.start + ((x - c.x) / c.w) * (c.end - c.start);
              const t1 = c.start + ((x + step - c.x) / c.w) * (c.end - c.start);
              let v = 0;
              const i1 = Math.min(values.length - 1, Math.max(Math.floor(t0 * ps), Math.ceil(t1 * ps) - 1));
              for (let i = Math.floor(t0 * ps); i <= i1; i++) v = Math.max(v, values[i] ?? 0);
              const bh = Math.max(1, (v / 100) * wh);
              g.fillRect(x - x0, (wh - bh) / 2, bar, bh);
            }
          }
        }
        this.dim.style.transform = this.litWrap.style.transform = `translateX(${x0}px)`;
      }

      const rh = this.ruler.clientHeight;
      if (vw && rh) {
        const g = canvas(this.rulerCv, rh);
        const pps = this.body.clientWidth / (this.o.duration - this.o.start);
        const major = STEPS.find(s => s * pps >= 80) ?? 60;
        const minor = major / (major < 1 ? 2 : major === 2 ? 4 : 5);
        g.font = `9px ${cs.fontFamily}`;
        g.textBaseline = 'top';
        const t0 = Math.max(this.o.start, this.tOf(x0));
        const t1 = this.tOf(x1);
        for (let i = Math.floor((t0 - this.o.start) / minor); ; i++) {
          const t = this.o.start + i * minor;
          if (t > t1) break;
          const x = Math.round(this.xOf(t) - x0);
          const isMajor = Math.abs(((t - this.o.start) / major) % 1) < 1e-6 || Math.abs(((t - this.o.start) / major) % 1) > 1 - 1e-6;
          g.fillStyle = color(isMajor ? '--tl-tick' : '--tl-grid');
          g.fillRect(x, isMajor ? rh - 7 : rh - 4, 1, isMajor ? 7 : 4);
          if (isMajor) {
            g.fillStyle = color('--tl-tick');
            const rel = t - this.o.start;
            g.fillText(major < 1 ? timecode(rel, this.o.fps).slice(3) : clock(rel), x + 3, 2);
          }
        }
        if (this.beatsReadable()) {
          g.fillStyle = color('--tl-beat');
          for (const b of this.beats) if (visible(b)) g.fillRect(Math.round(this.xOf(b) - x0), rh - 3, 1, 3);
        }
        this.rulerCv.style.transform = `translateX(${x0}px)`;
      }
      this.hx = null;
    }

    // The beat grid shows once beats are at least 7 px apart.
    beatsReadable() {
      const b = this.beats;
      if (!this.editing || b.length < 2) return false;
      return (this.body.clientWidth / (this.o.duration - this.o.start)) * ((b.at(-1) - b[0]) / (b.length - 1)) >= 7;
    }

    update(t) {
      this.t = t;
      this.paint(false);
    }

    paint(force) {
      if (!this.clips.length || this.clips[0].w === undefined) return;
      const t = clamp(this.t, this.o.start, this.o.duration - 1e-3);
      const x = this.xOf(t);
      if (force || x !== this.hx) {
        this.hx = x;
        this.head.style.transform = `translateX(${x}px)`;
        this.litWrap.style.width = `${clamp(x - (this.winX ?? 0), 0, this.scroller.clientWidth)}px`;
        if (this.editing) {
          this.chip.textContent = timecode(t - this.o.start, this.o.fps);
          // Kept inside the track at both ends.
          const cw = this.chip.offsetWidth;
          this.chip.style.transform = `translateX(${clamp(x - cw / 2, 0, this.body.clientWidth - cw) - x}px)`;
        }
        this.follow(x);
      }
      const cur = this.clipAt(t);
      if (cur !== this.cur) {
        this.cur?.el.classList.remove('on');
        cur.el.classList.add('on');
        this.cur = cur;
      }
      for (const e of this.events) {
        const on = t >= e.start;
        if (force || on !== e.on) e.el.classList.toggle('lit', (e.on = on));
      }
      if (!this.editing || force) {
        for (const c of this.clips) {
          const k = clamp((t - c.start) / (c.end - c.start), 0, 1);
          if (force || k !== c.k) {
            c.k = k;
            c.fill.style.transform = `scaleX(${k})`;
          }
        }
      }
      const rel = Math.round(t - this.o.start);
      if (rel !== this.aria) {
        this.aria = rel;
        this.host.setAttribute('aria-valuenow', String(rel));
        this.host.setAttribute('aria-valuetext', `${cur.label}, ${clock(t - this.o.start)}`);
      }
    }

    // Page along with the playhead when it leaves the view, unless the user
    // scrolled a moment ago.
    follow(x) {
      if (this.zoom === 1 || this.dragging || performance.now() - this.userScrollAt < 1500) return;
      const sl = this.scroller.scrollLeft;
      const vw = this.scroller.clientWidth;
      if (x < sl || x > sl + vw - 24) this.scrollTo(x - vw * 0.1, false);
    }

    bindZoom() {
      const sc = this.scroller;
      sc.addEventListener('scroll', () => {
        if (this.auto) this.auto = false;
        else this.userScrollAt = performance.now();
        if (!this.raf) {
          this.raf = requestAnimationFrame(() => {
            this.raf = 0;
            this.drawWindow();
            this.paint(false);
          });
        }
      });
      // Trackpad pinch arrives as ctrl + wheel.
      this.host.addEventListener(
        'wheel',
        e => {
          if (!this.editing) return;
          const anchor = e.clientX - sc.getBoundingClientRect().left;
          if (e.ctrlKey || e.metaKey || e.altKey) {
            e.preventDefault();
            this.setZoom(this.zoom * Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? 0.01 : 0.002)), this.tOf(sc.scrollLeft + anchor), anchor);
          } else if (this.zoom > 1 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            this.scrollTo(sc.scrollLeft + e.deltaY, true);
          }
        },
        { passive: false },
      );
      this.clipsEl.addEventListener('dblclick', e => {
        if (!this.editing) return;
        const c = this.clipAt(this.tOf(e.clientX - this.clipsEl.getBoundingClientRect().left));
        if (this.zoom > 1 && c.w > this.scroller.clientWidth * 0.8) this.setZoom(1, c.start, 0);
        else this.zoomToClip(c);
      });
    }

    bindPointer() {
      const host = this.host;
      const tAt = e => this.tOf(e.clientX - this.clipsEl.getBoundingClientRect().left);
      const inTracks = e => e.clientX >= this.scroller.getBoundingClientRect().left;
      host.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !inTracks(e)) return;
        this.dragging = true;
        host.setPointerCapture(e.pointerId);
        this.o.onScrub('start', tAt(e));
      });
      host.addEventListener('pointermove', e => {
        this.tip.classList.toggle('off', !inTracks(e));
        const t = tAt(e);
        const c = this.clipAt(t);
        // Viewer: key frame, chapter and time. Edit view: the shot's in / out.
        this.tipText.textContent = `${c.tag ? `${c.tag} ` : ''}${c.label} · ${this.fmt(t)}`;
        this.tipMeta.textContent = this.editing ? `IN ${this.fmt(c.start)}   OUT ${this.fmt(c.end)}   ${(c.end - c.start).toFixed(1)} s` : '';
        if (this.frames) {
          // The exact frame under the pointer.
          const [col, row] = this.frameCell(t);
          this.tipFrame.style.backgroundPosition = `${(col / (this.frames.cols - 1)) * 100}% ${(row / (Math.ceil(this.frames.count / this.frames.cols) - 1 || 1)) * 100}%`;
        } else if (c.thumb && this.tipImg.dataset.src !== c.thumb) {
          this.tipImg.dataset.src = c.thumb;
          this.tipImg.src = c.thumb;
        }
        this.tip.classList.toggle('has-img', Boolean(c.thumb) && !this.frames && !this.editing);
        const half = this.tip.offsetWidth / 2;
        const x = this.scroller.offsetLeft + this.xOf(t) - this.scroller.scrollLeft;
        this.tip.style.left = `${clamp(x, half, host.clientWidth - half)}px`;
        if (c !== this.hover) {
          this.hover?.el.classList.remove('hover');
          c.el.classList.add('hover');
          this.hover = c;
        }
        if (this.dragging) this.o.onScrub('move', t);
      });
      host.addEventListener('pointerleave', () => {
        this.hover?.el.classList.remove('hover');
        this.hover = null;
      });
      const end = () => {
        if (!this.dragging) return;
        this.dragging = false;
        this.o.onScrub('end', this.t);
      };
      host.addEventListener('pointerup', end);
      host.addEventListener('pointercancel', end);
    }

    destroy() {
      this.ro.disconnect();
      this.host.replaceChildren();
      this.host.classList.remove('tl');
    }
  }

  window.PlayerTimeline = { Timeline, timecode, clock };
})();
