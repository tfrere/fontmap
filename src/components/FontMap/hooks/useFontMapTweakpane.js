import { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import { useFontMapStore } from '../../../store/fontMapStore';

/**
 * Floating Tweakpane panel for FontMap — controls overlap removal parameters.
 */
export function useFontMapTweakpane() {
  const overlapCollideRadius   = useFontMapStore(s => s.overlapCollideRadius);
  const overlapTicks           = useFontMapStore(s => s.overlapTicks);
  const overlapOriginStrength  = useFontMapStore(s => s.overlapOriginStrength);
  const setOverlapCollideRadius  = useFontMapStore(s => s.setOverlapCollideRadius);
  const setOverlapTicks          = useFontMapStore(s => s.setOverlapTicks);
  const setOverlapOriginStrength = useFontMapStore(s => s.setOverlapOriginStrength);

  const paneRef     = useRef(null);
  const bindingsRef = useRef({});

  useEffect(() => {
    const pane = new Pane({ title: 'Layout', expanded: true });
    paneRef.current = pane;

    const params = {
      overlapCollideRadius,
      overlapTicks,
      overlapOriginStrength,
    };

    const folder = pane.addFolder({ title: 'Overlap Removal' });

    bindingsRef.current.radius = folder
      .addBinding(params, 'overlapCollideRadius', {
        label: 'Radius (px)',
        min: 0,
        max: 80,
        step: 1,
      })
      .on('change', ev => setOverlapCollideRadius(ev.value));

    bindingsRef.current.ticks = folder
      .addBinding(params, 'overlapTicks', {
        label: 'Ticks',
        min: 0,
        max: 300,
        step: 10,
      })
      .on('change', ev => setOverlapTicks(ev.value));

    bindingsRef.current.originStrength = folder
      .addBinding(params, 'overlapOriginStrength', {
        label: 'Pull to origin',
        min: 0,
        max: 0.5,
        step: 0.01,
      })
      .on('change', ev => setOverlapOriginStrength(ev.value));

    return () => {
      pane.dispose();
      paneRef.current = null;
      bindingsRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const b = bindingsRef.current.radius;
    if (b && b.value !== overlapCollideRadius) {
      try { b.value = overlapCollideRadius; } catch (_) {}
    }
  }, [overlapCollideRadius]);

  useEffect(() => {
    const b = bindingsRef.current.ticks;
    if (b && b.value !== overlapTicks) {
      try { b.value = overlapTicks; } catch (_) {}
    }
  }, [overlapTicks]);

  useEffect(() => {
    const b = bindingsRef.current.originStrength;
    if (b && b.value !== overlapOriginStrength) {
      try { b.value = overlapOriginStrength; } catch (_) {}
    }
  }, [overlapOriginStrength]);
}
