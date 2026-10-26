/**
 * Menu principal : un bouton pilule (section courante + burger) ouvre un panneau de
 * tuiles. Ouverture en ressort, tuiles en cascade, petit « pop » au choix d'une section.
 * Accessible : aria-expanded, Échap pour fermer, focus gardé dans le panneau, retour
 * au bouton à la fermeture ; panneau inerte quand il est fermé.
 */
const POP_MS = 170;

export function mountMenu(root = document) {
  const button = root.getElementById('menu-btn');
  const panel = root.getElementById('menu-panel');
  const backdrop = root.getElementById('menu-backdrop');
  const label = root.getElementById('menu-current');
  const html = root.documentElement;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const links = () => [...panel.querySelectorAll('a[data-route]')];

  panel.inert = true;

  function open() {
    html.dataset.menu = 'open';
    button.setAttribute('aria-expanded', 'true');
    panel.inert = false;
    navigator.vibrate?.(8);
    const target = panel.querySelector('a[aria-current="page"]') ?? links()[0];
    // Laisse le panneau devenir visible avant d'y placer le focus
    setTimeout(() => target?.focus({ preventScroll: true }), reduced() ? 0 : 120);
  }

  function close(focusButton = true) {
    if (html.dataset.menu !== 'open') return;
    delete html.dataset.menu;
    button.setAttribute('aria-expanded', 'false');
    panel.inert = true;
    if (focusButton) button.focus({ preventScroll: true });
  }

  button.addEventListener('click', () => (html.dataset.menu === 'open' ? close() : open()));
  backdrop.addEventListener('click', () => close());

  panel.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-route]');
    if (!link) return;
    e.preventDefault();
    const go = () => {
      link.classList.remove('is-chosen');
      close(false);
      if (location.hash !== link.hash) location.hash = link.hash;
      button.focus({ preventScroll: true });
    };
    if (reduced()) return go();
    link.classList.add('is-chosen');
    navigator.vibrate?.(6);
    setTimeout(go, POP_MS);
  });

  document.addEventListener('keydown', (e) => {
    if (html.dataset.menu !== 'open') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Le focus reste dans le panneau tant qu'il est ouvert
    const items = links();
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  return {
    /** Met à jour le bouton (libellé, couleur) et l'élément actif ; referme le menu. */
    setCurrent(route) {
      for (const link of links()) {
        if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      const active = links().find((l) => l.dataset.route === route);
      label.textContent = active?.querySelector('strong')?.textContent ?? '';
      button.dataset.route = route;
      close(false);
    },
  };
}
