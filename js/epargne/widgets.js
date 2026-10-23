/**
 * Widgets du tableau de bord « Épargne » : chacun répond à une question sur vos
 * livrets. Vous choisissez lesquels afficher et dans quel ordre (« Personnaliser »).
 *
 * Un widget : { id, title, description, wide, hint(ctx), control?(ctx), render(body, ctx) }.
 * ctx : { models, livrets, summary, inflation, rates, titleOf, horizon, setHorizon,
 *         expenses, holders, animate, today }
 */
import {
  benchmarks, doublingYears, grossEquivalent, halvingYears, history, realRate,
} from './indicators.js';
import {
  h, gainBadge, icon, longDate, money, monthLong, pct, pctOf, realBadge, setWidths, signedMoney, signedPct, signedPoints,
  years,
} from './format.js';
import { LIVRET_COLORS, PRODUCTS, SAFETY_MONTHS, TAX } from './livret-rates.js';

export const DEFAULT_WIDGETS = ['bulletin', 'gain-reel', 'comparateur', 'projection'];

const VERDICTS = {
  ok: { label: 'Favorable', icon: 'ok' },
  attention: { label: 'À surveiller', icon: 'attention' },
  defavorable: { label: 'Défavorable', icon: 'defavorable' },
};

function verdictTag(key) {
  const tag = h('span', 'sv-verdict-tag');
  tag.dataset.verdict = key;
  tag.innerHTML = icon(VERDICTS[key].icon, 14);
  tag.append(VERDICTS[key].label);
  return tag;
}

/** Une ligne « nom | rail | valeur » sur une échelle commune, avec un repère optionnel. */
function rateRow({ name, note, value, ratio, mark, tone = 'saved', color, extra }) {
  const rail = h('span', 'sv-rate__rail');
  const fill = h('span', 'sv-rate__fill');
  fill.dataset.tone = tone;
  if (color) fill.style.setProperty('--c', color);
  rail.append(fill);
  if (mark != null) {
    rail.style.setProperty('--mark', pct(mark));
    rail.append(h('span', 'sv-rate__mark'));
  }
  const label = h('span', 'sv-rate__name', name);
  if (note) label.append(h('small', null, note));
  const row = h('div', 'sv-rate', label, rail, h('span', 'sv-rate__value', h('strong', null, value), extra));
  return { row, fill, ratio };
}

// ——— Bulletin ————————————————————————————————————————————————————

/** Indicateurs du bulletin (aussi repris dans l'export Excel). */
export function bulletinItems(ctx) {
  const { summary, models, inflation } = ctx;
  const items = [];
  const real = realRate(summary.rate, inflation.rate);

  items.push({
    name: 'Rendement réel',
    value: realBadge(real, ' / an'),
    verdict: real >= 0.002 ? 'ok' : real >= -0.005 ? 'attention' : 'defavorable',
    text: real >= 0
      ? `Votre taux moyen (${pctOf(summary.rate)}) dépasse l'inflation (${pctOf(inflation.rate)}) : votre pouvoir d'achat progresse.`
      : `Votre taux moyen (${pctOf(summary.rate)}) est sous l'inflation (${pctOf(inflation.rate)}) : chaque année, votre épargne achète un peu moins.`,
  });

  items.push({
    name: 'Gain réel sur 12 mois',
    value: gainBadge(summary.realGain),
    verdict: summary.realGain >= 0 ? 'ok' : summary.realGain > -summary.yearlyInterest ? 'attention' : 'defavorable',
    text: `${signedMoney(summary.yearlyInterest)} d'intérêts, ${signedMoney(-summary.yearlyErosion)} de hausse des prix sur ${money(summary.balance)}.`,
  });

  const [fonds, estr] = benchmarks(ctx.ref.benchmarks);
  const vsFonds = summary.rate - fonds.net;
  items.push({
    name: 'Face au fonds euros',
    value: h('span', 'sv-num', signedPoints(vsFonds)),
    verdict: vsFonds >= 0 ? 'ok' : vsFonds > -0.5 ? 'attention' : 'defavorable',
    text: `Fonds euros ${ctx.ref.benchmarks.fondsEuros.year} : ${pctOf(fonds.net)} net de prélèvements sociaux, mais votre argent y est moins disponible et l'avantage fiscal vient avec les années.`,
  });

  const vsEstr = summary.rate - estr.net;
  items.push({
    name: 'Face au taux sans risque',
    value: h('span', 'sv-num', signedPoints(vsEstr)),
    verdict: vsEstr >= 0 ? 'ok' : 'attention',
    text: `Un compte à terme ou un fonds monétaire rapporte environ l'€STR (${pctOf(estr.gross)}), soit ${pctOf(estr.net)} après le prélèvement forfaitaire de ${pctOf(TAX.pfu)}.`,
  });

  // Le LEP d'une personne rapporte plus que son Livret A et n'est pas plein
  for (const [i, m] of models.entries()) {
    if (m.product !== 'lep' || m.capRoom <= 0) continue;
    const a = models.findIndex((x, j) => x.product === 'livretA' && ctx.livrets[j].profile === ctx.livrets[i].profile);
    if (a < 0 || models[a].rate >= m.rate || models[a].balance <= 0) continue;
    const movable = Math.min(m.capRoom, models[a].balance);
    const extra = movable * (m.rate - models[a].rate) / 100;
    items.push({
      name: `Répartition ${ctx.titleOf(a)} / ${ctx.titleOf(i)}`,
      value: gainBadge(extra, ' / an'),
      verdict: 'attention',
      text: `Le LEP rapporte ${signedPoints(m.rate - models[a].rate).slice(1)} de plus : y placer ${money(movable)} du Livret A rapporterait environ ${money(extra)} de plus par an.`,
    });
  }

  if (ctx.expenses) {
    const months = summary.balance / ctx.expenses.average;
    const { min, max } = SAFETY_MONTHS;
    items.push({
      name: 'Épargne de précaution',
      value: h('span', 'sv-num', `${months.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois`),
      verdict: months < min ? 'attention' : months > max * 1.5 && real < 0 ? 'attention' : 'ok',
      text: months < min
        ? `Vos livrets couvrent moins de ${min} mois de dépenses : la fourchette souvent conseillée est de ${min} à ${max} mois.`
        : months > max * 1.5 && real < 0
          ? `Bien au-delà des ${min} à ${max} mois conseillés, alors que les livrets perdent face à l'inflation : une part pourrait viser le long terme.`
          : `Vos livrets couvrent ${min} mois de dépenses ou plus : votre réserve pour les imprévus est en place.`,
    });
  }

  const full = models.filter((m) => m.capRoom === 0);
  if (full.length) {
    items.push({
      name: 'Plafonds',
      value: h('span', 'sv-num', `${full.length} plein${full.length > 1 ? 's' : ''}`),
      verdict: 'attention',
      text: 'Un livret plein ne grandit plus qu\'avec ses intérêts : les nouveaux versements doivent aller ailleurs.',
    });
  }
  return items;
}

const bulletin = {
  id: 'bulletin',
  title: 'Bulletin de vos livrets',
  description: 'Chaque indicateur jugé favorable, à surveiller ou défavorable, avec son explication.',
  wide: true,
  hint: () => 'Une lecture rapide pour savoir si vos livrets jouent leur rôle.',
  render(body, ctx) {
    const items = bulletinItems(ctx);
    const counts = Object.fromEntries(Object.keys(VERDICTS).map((k) => [k, items.filter((i) => i.verdict === k).length]));
    const summary = h('p', 'sv-bulletin__summary', Object.entries(counts).filter(([, n]) => n)
      .map(([k, n]) => `${n} ${VERDICTS[k].label.toLowerCase()}${n > 1 && k !== 'attention' ? 's' : ''}`).join(' · '));
    const list = h('ul', 'sv-bulletin');
    for (const item of items) {
      list.append(h('li', 'sv-bulletin__item',
        verdictTag(item.verdict),
        h('span', 'sv-bulletin__main', h('strong', null, item.name), h('small', null, item.text)),
        h('span', 'sv-bulletin__value', item.value)));
    }
    body.append(summary, list);
  },
};

// ——— Intérêts face à l'inflation ———————————————————————————————————

const gainReel = {
  id: 'gain-reel',
  title: 'Intérêts face à l\'inflation',
  description: 'Sur 12 mois : intérêts gagnés, hausse des prix sur la même somme, et ce qu\'il reste.',
  hint: (ctx) => `Au solde actuel, avec ${pctOf(ctx.inflation.rate)} d'inflation.`,
  render(body, ctx) {
    const rows = ctx.models.map((m, i) => ({ name: ctx.titleOf(i), ...m.next12, balance: m.balance, color: LIVRET_COLORS[m.product] }));
    if (rows.length > 1) {
      rows.push({
        name: 'Total', interest: ctx.summary.yearlyInterest, erosion: ctx.summary.yearlyErosion,
        gain: ctx.summary.realGain, balance: ctx.summary.balance, total: true,
      });
    }
    const scale = Math.max(1, ...rows.map((r) => Math.max(r.interest, r.erosion)));
    const fills = [];
    for (const r of rows) {
      const bar = (tone, value, label) => {
        const fill = h('span', 'sv-rate__fill');
        fill.dataset.tone = tone;
        if (tone === 'saved' && r.color) fill.style.setProperty('--c', r.color);
        fills.push([fill, value / scale]);
        return h('div', 'sv-flow__line', h('span', 'sv-rate__rail', fill), h('span', 'sv-flow__amount', label));
      };
      body.append(h('div', `sv-flow${r.total ? ' is-total' : ''}`,
        h('p', 'sv-flow__name', h('strong', null, r.name), h('small', null, money(r.balance))),
        bar('saved', r.interest, `${signedMoney(r.interest)} d'intérêts`),
        bar('neutral', r.erosion, `${signedMoney(-r.erosion)} de hausse des prix`),
        h('p', 'sv-flow__result', '= ', gainBadge(r.gain), ' de pouvoir d\'achat')));
    }
    setWidths(fills, ctx.animate);
  },
};

// ——— Comparateur ———————————————————————————————————————————————————

const comparateur = {
  id: 'comparateur',
  title: 'Comparé aux placements sans risque',
  description: 'Vos taux nets face au fonds euros, au marché monétaire (€STR) et à l\'inflation.',
  hint: () => 'Tous les taux sont nets d\'impôts et de prélèvements sociaux.',
  render(body, ctx) {
    const inflation = ctx.inflation.rate;
    const rows = [
      ...ctx.models.map((m, i) => ({ name: ctx.titleOf(i), net: m.rate, note: `net d'impôt · ${pctOf(grossEquivalent(m.rate))} brut équivalent`, tone: 'saved', color: LIVRET_COLORS[m.product] })),
      ...benchmarks(ctx.ref.benchmarks).map((b) => ({ name: b.name, net: b.net, note: b.note, tone: 'neutral' })),
    ].sort((a, b) => b.net - a.net);
    const scale = Math.max(inflation, ...rows.map((r) => r.net)) * 1.2;
    const head = h('div', 'sv-rates__head', h('span'), h('span', null, h('span', 'sv-rates__tag', `Inflation ${pctOf(inflation)}`)));
    head.querySelector('.sv-rates__tag').style.setProperty('--mark', pct(inflation / scale));
    head.setAttribute('aria-hidden', 'true');
    const built = rows.map((r) => rateRow({
      name: r.name, note: r.note, value: pctOf(r.net), ratio: r.net / scale, mark: inflation / scale, tone: r.tone, color: r.color,
      extra: realBadge(realRate(r.net, inflation), ' réel'),
    }));
    body.append(h('div', 'sv-rates', head, ...built.map((b) => b.row)),
      h('p', 'card__hint', `« Brut équivalent » : ce qu'un placement imposé au prélèvement forfaitaire (${pctOf(TAX.pfu)}) devrait rapporter pour faire aussi bien. Fonds euros : moyenne ${ctx.ref.benchmarks.fondsEuros.year} (ACPR). €STR au ${longDate(ctx.ref.benchmarks.estr.date)} (BCE).`));
    setWidths(built.map((b) => [b.fill, b.ratio]), ctx.animate);
  },
};

// ——— Selon l'indice d'inflation ———————————————————————————————————————

const indices = {
  id: 'indices',
  title: 'Selon l\'indice d\'inflation',
  description: 'Le rendement réel change selon la mesure de l\'inflation retenue (IPC, IPCH, sous-jacente).',
  hint: (ctx) => `Inflation sur un an, ${monthLong(ctx.ref.indices.month)} (INSEE).`,
  render(body, ctx) {
    const list = [
      { name: 'IPC', rate: ctx.inflation.rate, text: 'L\'indice officiel français, celui des articles de presse et de la formule du Livret A.' },
      { name: 'IPCH', rate: ctx.ref.indices.ipch, text: 'La version harmonisée européenne, celle de la cible de 2 % de la BCE.' },
      { name: 'Sous-jacente', rate: ctx.ref.indices.core, text: 'Sans les prix les plus volatils (énergie, produits frais) : la tendance de fond.' },
    ];
    const table = h('table', 'sv-table');
    const headRow = h('tr', null, h('th', null, 'Indice'), h('th', 'num', 'Inflation'),
      ...ctx.models.map((m, i) => h('th', 'num', ctx.titleOf(i))));
    table.append(h('thead', null, headRow));
    const tbody = h('tbody');
    for (const idx of list) {
      const th = h('th', null, h('strong', null, idx.name), h('small', null, idx.text));
      th.scope = 'row';
      tbody.append(h('tr', null, th, h('td', 'num', pctOf(idx.rate)),
        ...ctx.models.map((m) => h('td', 'num', realBadge(realRate(m.rate, idx.rate))))));
    }
    table.append(tbody);
    body.append(h('div', 'sv-table__wrap', table));
  },
};

// ——— Temps pour doubler ——————————————————————————————————————————————

const doublement = {
  id: 'doublement',
  title: 'Temps pour doubler',
  description: 'Combien d\'années pour doubler votre épargne, en euros et en pouvoir d\'achat.',
  hint: () => 'À taux et inflation inchangés. Règle de 72 : 72 ÷ taux donne une approximation de tête.',
  render(body, ctx) {
    const list = h('ul', 'sv-doubling');
    for (const [i, m] of ctx.models.entries()) {
      const nominal = doublingYears(m.rate / 100);
      const realDouble = doublingYears(m.real);
      const realHalf = halvingYears(m.real);
      list.append(h('li', null,
        h('p', 'sv-doubling__name', h('strong', null, ctx.titleOf(i)), h('small', null, `${pctOf(m.rate)} · ${signedPct(m.real)} réel`)),
        h('p', null, 'En euros : ', h('strong', null, nominal ? `double en ${years(nominal)}` : 'ne double pas'),
          nominal ? h('small', null, ` (règle de 72 : ${years(72 / m.rate)})`) : null),
        h('p', null, 'En pouvoir d\'achat : ',
          h('strong', null, realDouble ? `double en ${years(realDouble)}`
            : realHalf ? `divisé par deux en ${years(realHalf)}` : 'stable'))));
    }
    body.append(list);
  },
};

// ——— Depuis 2020 ———————————————————————————————————————————————————————

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const historique = {
  id: 'historique',
  title: 'Depuis 2020',
  description: '100 € laissés sur chaque livret depuis le 1er janvier 2020, face à la hausse des prix.',
  wide: true,
  hint: () => 'Taux officiels et inflation moyenne annuelle (INSEE), intérêts réinvestis chaque 31 décembre.',
  render(body, ctx) {
    const products = Object.keys(PRODUCTS).filter((p) => ctx.models.some((m) => m.product === p));
    const { from, to, rows, points } = history(ctx.rates, products, ctx.ref.annual);
    const series = [
      { key: 'prices', name: 'Prix', className: 'is-prices' },
      ...products.map((p, i) => ({ key: p, name: PRODUCTS[p].name, className: `is-livret is-livret-${i}` })),
    ];
    // Largeur réelle de l'écran : le texte du graphique garde sa taille, du Mac à l'iPhone
    const W = Math.round(Math.min(960, Math.max(300, window.innerWidth - 90)));
    const H = W < 500 ? 200 : 250; const L = 8; const R = 96; const T = 12; const B = 26;
    const all = points.flatMap((pt) => series.map((s) => pt[s.key]));
    const lo = Math.floor(Math.min(...all) - 1); const hi = Math.ceil(Math.max(...all) + 1);
    const x = (i) => L + (i / (points.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

    const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sv-history', role: 'img' });
    chart.setAttribute('aria-label', series.map((s) => `${s.name} : 100 → ${points.at(-1)[s.key].toFixed(1)}`).join(', '));
    chart.append(svg('line', { x1: L, x2: W - R, y1: y(100), y2: y(100), class: 'sv-history__base' }));
    points.forEach((pt, i) => {
      const label = svg('text', { x: x(i), y: H - 6, class: 'sv-history__year', 'text-anchor': 'middle' });
      label.textContent = String(from + i); // chaque point = 1er janvier de l'année
      if (W >= 500 || i === 0 || i === points.length - 1 || i % 2 === 0) chart.append(label);
    });
    // Étiquettes de fin de ligne, écartées si elles se chevauchent
    const ends = series.map((s) => ({ s, v: points.at(-1)[s.key], ly: y(points.at(-1)[s.key]) })).sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < ends.length; i++) ends[i].ly = Math.max(ends[i].ly, ends[i - 1].ly + 15);
    for (const s of series) {
      chart.append(svg('polyline', {
        points: points.map((pt, i) => `${x(i).toFixed(1)},${y(pt[s.key]).toFixed(1)}`).join(' '),
        class: `sv-history__line ${s.className}`,
      }));
      const end = ends.find((e) => e.s === s);
      const text = svg('text', { x: W - R + 8, y: end.ly + 4, class: `sv-history__label ${s.className}` });
      text.textContent = `${s.name} ${end.v.toFixed(0)}`;
      chart.append(text);
    }

    const end = points.at(-1);
    const lines = products.map((p) => {
      const realCum = end[p] / end.prices - 1;
      return h('li', null, h('strong', null, PRODUCTS[p].name), ` : 100 € devenus ${end[p].toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € fin ${to}, quand il en fallait ${end.prices.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} pour acheter la même chose · `, realBadge(realCum, ' de pouvoir d\'achat'));
    });
    const table = h('table', 'sv-table sv-table--compact');
    table.append(h('thead', null, h('tr', null, h('th', null, 'Année'), h('th', 'num', 'Inflation'),
      ...products.flatMap((p) => [h('th', 'num', PRODUCTS[p].name), h('th', 'num', 'réel')]))));
    table.append(h('tbody', null, ...rows.map((r) => h('tr', null, h('th', null, String(r.year)), h('td', 'num', pctOf(r.inflation)),
      ...products.flatMap((p) => [h('td', 'num', pctOf(Math.round(r[p] * 100) / 100)), h('td', 'num', realBadge(r[`${p}Real`]))])))));
    const details = h('details', 'due__more', h('summary', null, 'Année par année'), h('div', 'sv-table__wrap', table));
    body.append(chart, h('ul', 'sv-history__facts', ...lines), details);
  },
};

// ——— Épargne de précaution ————————————————————————————————————————————

const matelas = {
  id: 'matelas',
  title: 'Épargne de précaution',
  description: 'Combien de mois de dépenses courantes vos livrets peuvent couvrir.',
  hint: () => `Les conseils les plus courants visent ${SAFETY_MONTHS.min} à ${SAFETY_MONTHS.max} mois de dépenses, sur des livrets disponibles à tout moment.`,
  render(body, ctx) {
    if (!ctx.expenses) {
      body.append(h('p', 'card__empty', 'Importez au moins un relevé complet pour connaître vos dépenses mensuelles.'));
      return;
    }
    const months = ctx.summary.balance / ctx.expenses.average;
    const { min, max } = SAFETY_MONTHS;
    const scale = Math.max(max * 1.5, months * 1.1);
    const rail = h('div', 'sv-safety');
    rail.style.setProperty('--from', pct(min / scale));
    rail.style.setProperty('--to', pct(max / scale));
    const fill = h('span', 'sv-safety__fill');
    // Zone conseillée en fond, et deux entailles qui restent visibles sur le remplissage
    rail.append(h('span', 'sv-safety__zone'), fill, h('span', 'sv-safety__cuts'));
    const ticks = h('div', 'sv-safety__ticks');
    for (const n of [min, max]) {
      const t = h('span', null, `${n} mois`);
      t.style.setProperty('--at', pct(n / scale));
      ticks.append(t);
    }
    const value = h('p', 'sv-safety__value', h('strong', null, `${months.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois`),
      ` de dépenses couverts par vos livrets (${money(ctx.summary.balance)})`);
    const surplus = ctx.summary.balance - max * ctx.expenses.average;
    const holderNote = ctx.holders ? ` de ${ctx.holders}` : '';
    body.append(value, rail, ticks,
      h('p', 'card__hint', `Dépenses moyennes${holderNote} : ${money(ctx.expenses.average)} par mois (${ctx.expenses.months.map(monthLong).join(', ')}), hors épargne et virements.`
        + (surplus > 0 ? ` Au-delà de ${max} mois, ${money(surplus)} n'ont pas besoin d'être disponibles tout de suite : c'est la part qui peut viser le long terme.` : '')));
    setWidths([[fill, months / scale]], ctx.animate);
  },
};

// ——— Projection ———————————————————————————————————————————————————————

const projection = {
  id: 'projection',
  title: 'Projection',
  description: 'Solde au 31 décembre des prochaines années, et ce qu\'il vaudra en euros d\'aujourd\'hui.',
  wide: true,
  hint(ctx) {
    const planned = ctx.models.reduce((s, m) => s + m.plan.monthly, 0);
    return `Solde au 31 décembre de chaque année. Les intérêts versés chaque 31 décembre rapportent à leur tour l'année suivante (intérêts composés). ${planned > 0
      ? `Vos virements réguliers continuent (${money(planned)} par mois, jusqu'aux plafonds)`
      : 'Aucun virement régulier repéré : pas de nouveau versement'}, aux taux actuels, avec ${pctOf(ctx.inflation.rate)} d'inflation par an.`;
  },
  control(ctx) {
    const field = h('fieldset', 'segmented');
    field.append(h('legend', 'visually-hidden', 'Horizon de la projection'));
    for (const n of [3, 5, 10]) {
      const input = document.createElement('input');
      Object.assign(input, { type: 'radio', name: 'sv-horizon', value: String(n), checked: n === ctx.horizon });
      field.append(h('label', null, input, h('span', null, `${n} ans`)));
    }
    field.addEventListener('change', (e) => ctx.setHorizon(Number(e.target.value)));
    return field;
  },
  render(body, ctx) {
    const { summary } = ctx;
    const columns = [
      { label: 'Auj.', end: summary.balance, real: summary.balance, today: true },
      ...summary.years.map((y) => ({ label: String(y.year), full: `Fin ${y.year}`, ...y })),
    ];
    let cumulated = 0;
    let compounded = 0;
    for (const c of columns) {
      if (c.today) continue;
      c.cumulated = (cumulated += c.interest);
      c.compounded = (compounded += c.compound);
    }
    const max = Math.max(1, ...columns.map((c) => c.end)) * 1.12;

    const chart = h('div', 'sv-chart');
    chart.setAttribute('role', 'list');
    const labels = h('div', 'sv-chart__labels');
    labels.setAttribute('aria-hidden', 'true');
    for (const node of [chart, labels]) node.style.setProperty('--cols', columns.length);
    const readout = h('p', 'trend__readout');
    readout.setAttribute('aria-live', 'polite');

    const heights = columns.map((c, i) => {
      const col = h('button', 'sv-col');
      col.type = 'button';
      col.setAttribute('role', 'listitem');
      col.classList.toggle('is-today', Boolean(c.today));
      col.classList.toggle('is-last', i === columns.length - 1);
      const text = c.today
        ? `Aujourd'hui : ${money(c.end)} sur vos livrets.`
        : `${c.full} : ${money(c.end)} sur vos livrets, dont ${money(c.cumulated)} d'intérêts d'ici là (${money(c.compounded)} gagnés sur des intérêts déjà versés). En euros d'aujourd'hui, cela vaudra ${money(c.real)}.`;
      col.setAttribute('aria-label', text);
      col.dataset.readout = text;
      col.append(h('span', 'sv-col__value', money(c.end)), h('span', 'sv-col__bar'));
      if (!c.today) col.append(h('span', 'sv-col__real'));
      chart.append(col);
      const label = h('span', null, c.label);
      label.classList.toggle('is-today', Boolean(c.today));
      labels.append(label);
      return [col, c.end / max, c.real / max];
    });

    const show = (e) => { readout.textContent = e.target.closest('.sv-col')?.dataset.readout ?? ''; };
    chart.addEventListener('pointerover', show);
    chart.addEventListener('focusin', show);
    chart.addEventListener('pointerleave', () => { readout.textContent = ''; });

    const legend = h('p', 'sv-legend',
      h('span', null, h('i', 'key key--today'), 'Aujourd\'hui'),
      h('span', null, h('i', 'key key--upcoming'), 'Solde prévu au 31 décembre'),
      h('span', null, h('i', 'key key--real'), 'Ce qu\'il vaudra en euros d\'aujourd\'hui'));
    legend.querySelectorAll('i').forEach((i) => i.setAttribute('aria-hidden', 'true'));
    body.append(chart, labels, legend, readout);

    const apply = () => {
      for (const [col, hgt, real] of heights) {
        col.style.setProperty('--h', pct(hgt));
        col.style.setProperty('--r', pct(real));
      }
    };
    if (!ctx.animate) return apply();
    for (const [col] of heights) { col.style.setProperty('--h', '0%'); col.style.setProperty('--r', '0%'); }
    requestAnimationFrame(() => requestAnimationFrame(apply));
  },
};

export const WIDGETS = [bulletin, gainReel, comparateur, projection, indices, doublement, historique, matelas];
export const widgetById = new Map(WIDGETS.map((w) => [w.id, w]));
