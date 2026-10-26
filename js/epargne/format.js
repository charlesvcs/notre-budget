/** Mise en forme partagée par l'écran « Épargne » et ses widgets. */

const euro0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euro2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 2 });
const signedPercentFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero',
});
const dateLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthLongFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShortFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const yearsFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pointsFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export const minus = (s) => s.replace('-', '−');
export const money = (cents) => minus(euro0.format(Math.round(cents / 100)));
export const moneyExact = (cents) => minus(euro2.format(cents / 100));
/** Montant signé : « +143 € », « −261 € ». */
export const signedMoney = (cents) => (Math.round(cents / 100) > 0 ? '+' : '') + money(cents);
/** Taux exprimé en % (1.7 → « 1,7 % »). */
export const pctOf = (rate) => percent.format(rate / 100);
const percent1 = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Fraction à une décimale (0.1107 → « 11,1 % ») : rendements de marché, pas de fausse précision. */
export const pct1 = (fraction) => percent1.format(fraction);
/** Fraction signée (−0.014 → « −1,4 % »). */
export const signedPct = (fraction) => minus(signedPercentFormat.format(fraction));
export const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
export const longDate = (iso) => dateLong.format(asDate(iso)).replace(/^1 /, '1er ');
export const monthLong = (month) => monthLongFormat.format(asDate(`${month}-01`));
/** « sept. », « juil. » */
export const monthShort = (month) => monthShortFormat.format(asDate(`${month}-01`));
/** Écart entre deux taux en points de pourcentage : « +0,4 pt », « −1,2 pt ». */
export const signedPoints = (diff) => `${diff >= 0 ? '+' : '−'}${pointsFormat.format(Math.abs(diff))} pt`;
export const years = (n) => `${yearsFormat.format(n)} an${Math.round(n) > 1 ? 's' : ''}`;
export const pct = (ratio) => `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(2)}%`;

const ICONS = {
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  attention: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 16.8v.2"/>',
  defavorable: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16v.2"/>',
};
export const icon = (name, size = 14) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** Petit constructeur d'éléments : h('p', 'classe', 'texte', enfant…). */
export function h(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) if (child != null && child !== false) node.append(child);
  return node;
}

/** Rendement réel : chevron + signe, la couleur ne fait que souligner. */
export function realBadge(real, suffix = '') {
  const span = h('span', 'sv-real');
  span.dataset.sign = real < -0.0005 ? 'neg' : real > 0.0005 ? 'pos' : 'zero';
  span.innerHTML = Math.abs(real) > 0.0005 ? icon(real < 0 ? 'down' : 'up', 13) : '';
  span.append(`${signedPct(real)}${suffix}`);
  return span;
}

/** Montant signé avec chevron (gain / perte de pouvoir d'achat). */
export function gainBadge(cents, suffix = '') {
  const span = h('span', 'sv-real');
  const rounded = Math.round(cents / 100);
  span.dataset.sign = rounded < 0 ? 'neg' : rounded > 0 ? 'pos' : 'zero';
  span.innerHTML = rounded ? icon(rounded < 0 ? 'down' : 'up', 13) : '';
  span.append(`${signedMoney(cents)}${suffix}`);
  return span;
}

/** Largeurs (--w) : depuis 0 au premier affichage, sinon depuis l'état courant. */
export function setWidths(pairs, animate) {
  const apply = () => { for (const [node, ratio] of pairs) node.style.setProperty('--w', pct(ratio)); };
  if (!animate) return apply();
  for (const [node] of pairs) node.style.setProperty('--w', '0%');
  requestAnimationFrame(() => requestAnimationFrame(apply));
}
