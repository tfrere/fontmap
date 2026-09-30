// Theme changes swap colours at once: transitions are off while the new theme's styles are
// computed (the forced reflow, then the next frame, which also catches what effects change
// after apply), and back on a frame later, when nothing is left to animate.
export function withoutTransitions(apply) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  apply();
  void root.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}
