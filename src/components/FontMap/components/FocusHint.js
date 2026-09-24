import React, { useEffect, useRef, useState } from 'react';

const KEYS = [
  { key: 'ArrowLeft', label: '←' },
  { key: 'ArrowUp', label: '↑' },
  { key: 'ArrowDown', label: '↓' },
  { key: 'ArrowRight', label: '→' },
];

// Keep the pressed state visible for at least this long, otherwise a quick
// tap (keydown + keyup in the same frame) never gets painted.
const MIN_PRESS_MS = 220;

const FocusHint = () => {
  const [pressedKey, setPressedKey] = useState(null);
  const releaseTimer = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!KEYS.some(({ key }) => key === event.key)) return;
      clearTimeout(releaseTimer.current);
      setPressedKey(event.key);
      releaseTimer.current = setTimeout(() => setPressedKey(null), MIN_PRESS_MS);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(releaseTimer.current);
    };
  }, []);

  return (
    <div className="focus-hint">
      <div className="focus-hint-keys">
        {KEYS.map(({ key, label }) => (
          <kbd key={key} className={pressedKey === key ? 'is-pressed' : undefined}>
            {label}
          </kbd>
        ))}
      </div>
      <span className="focus-hint-label">use arrow keys to navigate</span>
    </div>
  );
};

export default FocusHint;
