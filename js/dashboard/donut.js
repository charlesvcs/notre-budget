/**
 * Anneau de répartition en SVG (sans bibliothèque) : chaque part est un arc
 * de cercle tracé par stroke-dasharray, séparé de ses voisines par 2px.
 * La légende sert de tableau : nom, montant et part y sont toujours écrits.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2;

/**
 * @param {object} el  { figure, segments, value, label, legend }
 * @param {Array} slices  [{ id, name, icon, amount, share, color }]
 * @param {{ total: string, totalLabel: string, format: (cents) => string, onSelect?: (i) => void }} text
 *   onSelect(i) : clic sur une part ou sur sa ligne de légende
 */
export function renderDonut(el, slices, text) {
  const { figure, segments, value, label, legend } = el;
  const showTotal = () => {
    delete figure.dataset.focus;
    value.textContent = text.total;
    label.textContent = text.totalLabel;
    figure.querySelectorAll('.is-focus').forEach((n) => n.classList.remove('is-focus'));
    legend.querySelectorAll('.is-focus').forEach((n) => n.classList.remove('is-focus'));
  };
  const focus = (i) => {
    const s = slices[i];
    figure.dataset.focus = String(i);
    value.textContent = text.format(s.amount);
    label.textContent = `${s.name} · ${percent(s.share)}`;
    figure.querySelectorAll('[data-slice]').forEach((n) => n.classList.toggle('is-focus', n.dataset.slice === String(i)));
    legend.querySelectorAll('button').forEach((n) => n.classList.toggle('is-focus', n.dataset.slice === String(i)));
  };

  // Arcs : on part de 0 puis on rejoint la longueur cible (animation CSS)
  segments.replaceChildren(circle('donut__track', CIRCUMFERENCE, 0));
  const arcs = [];
  let offset = 0;
  const visible = slices.filter((s) => s.share > 0).length;
  slices.forEach((s, i) => {
    const length = s.share * CIRCUMFERENCE;
    const drawn = Math.max(length - (visible > 1 ? GAP : 0), 0.5);
    const arc = circle('', 0, -offset);
    arc.dataset.slice = String(i);
    arc.style.stroke = s.color;
    arc.addEventListener('pointerenter', () => focus(i));
    arc.addEventListener('pointerleave', showTotal);
    if (text.onSelect) arc.addEventListener('click', () => text.onSelect(i));
    segments.append(arc);
    arcs.push([arc, drawn]);
    offset += length;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const [arc, drawn] of arcs) arc.setAttribute('stroke-dasharray', `${drawn} ${CIRCUMFERENCE}`);
  }));

  legend.replaceChildren(...slices.map((s, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.slice = String(i);
    button.style.setProperty('--c', s.color);
    button.append(
      span('swatch'),
      span('name', `${s.icon ? `${s.icon} ` : ''}${s.name}`),
      span('amount', text.format(s.amount)),
      span('share', percent(s.share)),
    );
    button.addEventListener('pointerenter', () => focus(i));
    button.addEventListener('pointerleave', showTotal);
    button.addEventListener('focus', () => focus(i));
    button.addEventListener('blur', showTotal);
    if (text.onSelect) {
      button.setAttribute('aria-label', `Voir les opérations : ${s.name}, ${text.format(s.amount)}, ${percent(s.share)}`);
      button.addEventListener('click', () => text.onSelect(i));
    }
    li.append(button);
    return li;
  }));

  showTotal();
}

function circle(className, dash, dashOffset) {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '100');
  c.setAttribute('cy', '100');
  c.setAttribute('r', String(RADIUS));
  if (className) c.setAttribute('class', className);
  c.setAttribute('stroke-dasharray', `${dash} ${CIRCUMFERENCE}`);
  c.setAttribute('stroke-dashoffset', String(dashOffset));
  return c;
}

function span(className, textContent = '') {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = textContent;
  return s;
}

const percentFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const percent = (share) => (share > 0 && share < 0.005 ? '< 1 %' : percentFormat.format(share));
