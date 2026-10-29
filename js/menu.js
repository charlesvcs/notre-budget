/**
 * Navigation principale : barre directe sur grand ecran et menu rapide sur mobile.
 * Accessible : aria-expanded, Echap pour fermer, focus garde dans le panneau, retour
 * au bouton a la fermeture ; panneau inerte quand il est ferme.
 */

export function mountMenu(root = document) {
  const button = root.getElementById('menu-btn');
  const panel = root.getElementById('menu-panel');
  const navBar = root.getElementById('app-nav');
  const backdrop = root.getElementById('menu-backdrop');
  const label = root.getElementById('menu-current');
  const html = root.documentElement;
  const panelLinks = () => [...panel.querySelectorAll('a[data-route]')];
  const barLinks = () => (navBar ? [...navBar.querySelectorAll('a[data-route]')] : []);

  panel.inert = true;

  function open() {
    html.dataset.menu = 'open';
    button.setAttribute('aria-expanded', 'true');
    panel.inert = false;
    const target = panel.querySelector('a[aria-current="page"]') ?? panelLinks()[0];
    setTimeout(() => target?.focus({ preventScroll: true }), 20);
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
    close(false);
    if (location.hash !== link.hash) location.hash = link.hash;
  });

  document.addEventListener('keydown', (e) => {
    if (html.dataset.menu !== 'open') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = panelLinks();
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  return {
    /** Met a jour la barre de navigation, le bouton et l'element actif ; referme le menu. */
    setCurrent(route) {
      for (const link of [...panelLinks(), ...barLinks()]) {
        if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      const active = panelLinks().find((l) => l.dataset.route === route);
      label.textContent = active?.querySelector('strong')?.textContent ?? 'Menu';
      button.dataset.route = route;
      close(false);
    },
  };
}
