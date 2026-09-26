import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { webFontCss } from '../utils/webFonts';
import { useInView, useWebFont } from '../hooks/useWebFont';

export const PREVIEW_TEXT_MAX_LENGTH = 40;
const LINE_HEIGHT = 1.15;
const MAX_LINES = 2;

const sanitize = (value) => value.replace(/[\r\n]+/g, ' ').slice(0, PREVIEW_TEXT_MAX_LENGTH);

// Largest integer size in [min, max] that keeps `el` inside maxWidth and maxLines
const fitFontSize = (el, { min, max, maxWidth, maxHeight = Infinity, maxLines = Infinity }) => {
  let lo = min;
  let hi = max;
  let best = min;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    el.style.fontSize = `${mid}px`;
    const heightLimit = Math.min(maxHeight, maxLines * LINE_HEIGHT * mid + 1);
    if (el.scrollWidth <= maxWidth && el.scrollHeight <= heightLimit) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  el.style.fontSize = `${best}px`;
  return best;
};

const useResizeTick = (ref, callback) => {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => callback());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, callback]);
};

/**
 * Editable preview of the active font. The <textarea> is the renderer: a
 * hidden mirror with the same font measures the text to auto-fit it.
 */
export const ActivePreviewText = ({
  textarea,
  text,
  onTextChange,
  focused,
  onFocusChange,
  webFont,
  editable,
}) => {
  const boxRef = useRef(null);
  const mirrorRef = useRef(null);
  const { spec, status } = webFont;
  const textMode = text.length > 0;
  const fontCss = spec && textMode ? webFontCss(spec, status) : webFontCss(null, 'idle');
  const pending = textMode && !!spec && (status === 'idle' || status === 'loading');

  const fit = useCallback(() => {
    const box = boxRef.current;
    const mirror = mirrorRef.current;
    const area = textarea.current;
    if (!box || !mirror || !area) return;
    const content = text || area.placeholder || ' ';
    mirror.textContent = content;
    const width = box.clientWidth;
    const height = box.clientHeight;
    const size = fitFontSize(mirror, {
      min: 14, max: text ? 44 : 24, maxWidth: width, maxHeight: height, maxLines: MAX_LINES,
    });
    area.style.fontSize = `${size}px`;
    area.style.paddingTop = `${Math.max(0, (height - Math.min(mirror.scrollHeight, height)) / 2)}px`;
  }, [text, textarea]);

  useLayoutEffect(fit, [fit, status, focused, fontCss.fontFamily]);
  useResizeTick(boxRef, fit);

  const handleKeyDown = (event) => {
    // Keep keystrokes away from the window-level map shortcuts
    event.stopPropagation();
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <div className={`preview-text-box${pending ? ' is-loading' : ''}`} ref={boxRef}>
      <div className="preview-text-mirror" ref={mirrorRef} style={fontCss} aria-hidden="true" />
      {editable && (
        <textarea
          ref={textarea}
          className={`preview-text-input is-${pending ? 'loading' : textMode ? status : 'empty'}`}
          style={fontCss}
          value={text}
          rows={1}
          maxLength={PREVIEW_TEXT_MAX_LENGTH}
          placeholder="Type your own text"
          aria-label="Preview text"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => onTextChange(sanitize(e.target.value))}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
        />
      )}
    </div>
  );
};

/** One similar-font row in text mode: loads when visible and allowed. */
export const SimilarPreviewText = ({ font, text, canLoad }) => {
  const ref = useRef(null);
  const inView = useInView(ref);
  const { spec, status } = useWebFont(font, { enabled: canLoad && inView });
  const fontCss = webFontCss(spec, status);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    fitFontSize(el, { min: 11, max: 24, maxWidth: el.clientWidth });
  }, []);

  useLayoutEffect(fit, [fit, text, status]);
  useResizeTick(ref, fit);

  return (
    <span
      ref={ref}
      className={`similar-font-text is-${status === 'idle' ? 'loading' : status}`}
      style={fontCss}
      title={status === 'failed' ? `Couldn't load ${font.name}` : undefined}
    >
      {text}
    </span>
  );
};
