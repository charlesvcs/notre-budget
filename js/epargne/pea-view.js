/**
 * Onglet « Investir » : vos PEA (un par personne). Valeur et lignes d'ETF saisies par vous,
 * plus-value latente, fiscalite selon l'age du plan, et projection ergonomique (selection au clic
 * sans maintien appuye + tableau annuel complet). Les calculs sont dans pea.js ; les PEA sont
 * enregistres dans le reglage peaAccounts.
 */
import { getSetting, setSetting, toCents } from '../db/database.js';
import {
  ETFS, INDEX_RETURNS, OTHER_ETF, PEA, SCENARIOS, etfById, indexById, monthsBetween, portfolio, projectPea, scenarioRate,
} from './pea.js';
import { gainBadge, h, longDate, money, monthLong, pct, pct1, pctOf, setWidths } from './format.js';

const HORIZONS = [5, 10, 15, 20, 25];
const QUICK_STEPS = [5000, 10000, 25000]; // +50 €, +100 €, +250 € en centimes
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const REMOVE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/**
 * @param {object} o
 * @param {HTMLElement} o.container  emplacement des cartes
 * @param {HTMLButtonElement} o.addButton  bouton « Ajouter un PEA »
 * @param {(text: string, undo?: Function) => void} o.notify
 * @param {() => void} [o.onChange]  apres chaque enregistrement
 */
export function mountPeaSection({ container, addButton, notify, onChange = () => {} }) {
  const state = {
    accounts: [],
    editing: null, // id du PEA en cours de modification, ou 'nouveau'
    sim: {}, // par PEA : { monthly, horizon, scenario, selectedYear }
    env: null, // { today, inflation, annual, holders, nameOf, solo, animate }
  };

  async function load() {
    state.accounts = (await getSetting('peaAccounts')) ?? [];
  }

  async function save(accounts, message, previous) {
    await setSetting('peaAccounts', accounts);
    state.accounts = accounts;
    state.editing = null;
    render();
    onChange();
    notify(message, previous ? async () => { await setSetting('peaAccounts', previous); state.accounts = previous; render(); onChange(); } : null);
  }

  function update(env) {
    state.env = env;
    render();
  }

  const freeHolders = (except = null) => state.env.holders.filter((p) => p === except || !state.accounts.some((a) => a.profile === p));

  function render() {
    if (!state.env) return;
    addButton.hidden = !freeHolders().length || state.editing === 'nouveau';
    const cards = state.accounts.map((a) => (state.editing === a.id ? editCard(a) : accountCard(a)));
    if (state.editing === 'nouveau') cards.push(editCard(null));
    container.replaceChildren(...cards);
    container.hidden = !cards.length;
  }

  addButton.addEventListener('click', () => {
    state.editing = 'nouveau';
    render();
    container.lastElementChild?.scrollIntoView({ block: 'start' });
    container.lastElementChild?.querySelector('input, select')?.focus();
  });

  // Carte d'un PEA

  function accountCard(account) {
    const { env } = state;
    const pf = portfolio(account, env.annual);
    const month = env.today.slice(0, 7);
    const card = h('article', 'card sv-livret sv-pea');
    card.style.setProperty('--c', 'var(--series-3)');
    card.dataset.id = account.id;

    const head = h('header', 'sv-livret__head',
      h('div', null, h('h2', null, env.solo ? 'PEA' : `PEA · ${env.nameOf(account.profile)}`),
        h('p', 'card__hint', `Ouvert en ${monthLong(account.opened)}`)),
      h('p', 'sv-livret__rate', h('strong', null, `${pct1(pf.past - pf.ter / 100)} / an`), h('small', null, 'indices suivis, 10 ans, frais déduits')));

    const balance = h('p', 'sv-livret__balance', h('span', null, money(pf.value)),
      h('small', null, account.date === env.today ? 'valeur saisie aujourd\'hui' : `valeur saisie le ${longDate(account.date)}`));

    // Plafond des versements
    const capFill = h('span', 'meter__fill');
    const room = Math.max(0, PEA.cap - pf.deposits);
    const cap = h('div', 'sv-cap', h('div', 'meter', capFill),
      h('p', 'env__line', h('span', null, room ? `Encore ${money(room)} de versements possibles` : 'Plafond de versements atteint'),
        h('span', 'env__figures', h('strong', null, money(pf.deposits)), ` versés / ${money(PEA.cap)}`)));
    setWidths([[capFill, pf.deposits / PEA.cap]], env.animate);

    // Graphe explicite de la repartition actuelle : Fonds investis vs Interets composes / plus-value
    const ageMonths = monthsBetween(account.opened, month);
    const latent = pf.value - pf.deposits;
    const taxNow = ageMonths >= PEA.years * 12 ? PEA.taxAfter : PEA.taxBefore;
    const taxNowCents = Math.round(Math.max(0, latent) * taxNow / 100);
    const netNowCents = pf.value - taxNowCents;
    const currentSplit = renderCurrentSplit(account, pf, latent, taxNow, taxNowCents, netNowCents);

    // Les lignes d'ETF + barre de repartition visuelle des ETF
    const etfBar = renderEtfAllocationBar(pf);
    const table = h('table', 'sv-table sv-table--compact sv-table--pea');
    table.append(h('caption', 'visually-hidden', 'Lignes du PEA'),
      h('thead', null, h('tr', null, h('th', null, 'ETF'), h('th', null, 'Indice suivi'), h('th', 'num', 'Frais'), h('th', 'num', 'Montant'), h('th', 'num', 'Part'))));
    table.append(h('tbody', null, ...pf.lines.map((l) => {
      const th = h('th', null, h('strong', null, l.ticker ? `${l.ticker} · ${l.name}` : l.name), l.isin ? h('small', null, l.isin) : null);
      th.scope = 'row';
      return h('tr', null, th, h('td', null, indexById.get(l.index)?.name ?? 'Autre indice'), h('td', 'num', pctOf(l.ter)),
        h('td', 'num', money(l.amount)), h('td', 'num', pct1(l.weight)));
    })));

    // Plus-value, fiscalite, frais, versement
    const stat = (term, value, note) => h('div', null, h('dt', null, term), h('dd', null, value), note ? h('small', null, note) : null);
    const fiveYears = addMonths(account.opened, PEA.years * 12);
    const stats = h('dl', 'sv-stats',
      account.deposits == null
        ? stat('Plus-value latente', 'Inconnue', 'indiquez le total versé depuis l\'ouverture (« Modifier ») pour la connaître')
        : stat('Plus-value latente', gainBadge(latent), latent > 0
          ? `sur ${money(pf.deposits)} investis (${pct1(latent / Math.max(1, pf.deposits))}) ; net d'impôt : +${money(latent - taxNowCents)} (prélèvements : ${money(taxNowCents)} à ${pctOf(taxNow)})`
          : `sur ${money(pf.deposits)} investis`),
      ageMonths >= PEA.years * 12
        ? stat('Fiscalité', 'Allégée', `plus de ${PEA.years} ans : ${pctOf(PEA.taxAfter)} de prélèvements sociaux sur les gains, retraits possibles sans clôturer le plan`)
        : stat('Fiscalité', `Allégée dans ${PEA.years * 12 - ageMonths} mois`, `en ${monthLong(fiveYears)} ; d'ici là, un retrait clôture le plan et les gains sont imposés à ${pctOf(PEA.taxBefore)}`),
      stat('Frais des ETF', `${pctOf(Math.round(pf.ter * 100) / 100)} / an`, `environ ${money(pf.value * pf.ter / 100)} par an au montant actuel, prélevés dans la valeur des ETF`),
      stat('Versement mensuel', account.monthly ? `${money(account.monthly)} / mois` : 'Aucun', account.monthly ? 'réparti selon le poids actuel des lignes' : 'modifiable avec « Modifier », ou à tester dans la projection'));

    const edit = h('button', 'btn btn--ghost btn--small', 'Modifier');
    edit.type = 'button';
    edit.addEventListener('click', () => {
      state.editing = account.id;
      render();
      container.querySelector(`[data-id="${account.id}"] input, [data-id="${account.id}"] select`)?.focus();
    });

    card.append(head, balance, cap, currentSplit, etfBar, h('div', 'sv-table__wrap', table), stats, simulation(account, pf), h('div', 'sv-actions', edit));
    return card;
  }

  // Graphe explicite de la composition actuelle du PEA (sans clic requis)
  function renderCurrentSplit(account, pf, latent, taxNow, taxNowCents, netNowCents) {
    const total = Math.max(1, pf.value);
    const gainPos = Math.max(0, latent);
    const contribInValue = Math.max(0, pf.value - gainPos);
    const contribPct = (contribInValue / total) * 100;
    const gainPct = (gainPos / total) * 100;
    const roi = pf.deposits > 0 ? latent / pf.deposits : 0;

    const segContrib = h('span', 'sv-split-bar__seg sv-split-bar__seg--contrib');
    segContrib.style.width = `${contribPct.toFixed(1)}%`;
    if (contribPct >= 14) {
      segContrib.append(h('span', 'sv-split-bar__text', `Fonds investis : ${money(pf.deposits)} (${pct1(contribInValue / total)})`));
    }

    const segGain = h('span', 'sv-split-bar__seg sv-split-bar__seg--gain');
    segGain.style.width = `${gainPct.toFixed(1)}%`;
    if (gainPct >= 14) {
      segGain.append(h('span', 'sv-split-bar__text', `Intérêts / gains : +${money(gainPos)} (${pct1(gainPos / total)})`));
    }

    const bar = h('div', 'sv-split-bar', segContrib, segGain);

    const pills = h('div', 'sv-split-pills',
      h('div', 'sv-split-pill sv-split-pill--contrib',
        h('span', 'sv-split-pill__label', h('i', 'key key--contrib'), 'Fonds investis (capital versé)'),
        h('strong', 'sv-split-pill__val', money(pf.deposits)),
        h('small', null, account.deposits == null ? 'total versé non renseigné (valeur actuelle retenue)' : `${pct1(contribInValue / total)} de la valeur brute actuelle`)),
      h('div', 'sv-split-pill sv-split-pill--gain',
        h('span', 'sv-split-pill__label', h('i', 'key key--gain'), 'Intérêts composés & plus-values gagnés'),
        h('strong', 'sv-split-pill__val', latent >= 0 ? `+${money(latent)}` : money(latent)),
        h('small', null, latent > 0
          ? `${pct1(gainPos / total)} du PEA · rendement cumulé de +${pct1(roi)} sur les fonds investis`
          : latent < 0
            ? `moins-value latente de ${money(latent)} (${pct1(roi)} sur les fonds investis)`
            : 'aucun gain ou perte constaté pour l\'instant')),
      h('div', 'sv-split-pill sv-split-pill--net',
        h('span', 'sv-split-pill__label', 'Valeur nette après fiscalité'),
        h('strong', 'sv-split-pill__val', money(netNowCents)),
        h('small', null, taxNowCents > 0
          ? `impôt latent déduit : −${money(taxNowCents)} (${pctOf(taxNow)} sur les gains) · gains nets : +${money(gainPos - taxNowCents)}`
          : 'aucun impôt latent en l\'absence de plus-value')),
    );
    pills.querySelectorAll('i').forEach((i) => i.setAttribute('aria-hidden', 'true'));

    return h('section', 'sv-split-box',
      h('div', 'sv-split-box__head',
        h('h3', 'sv-split-box__title', 'Répartition actuelle : Fonds investis vs Intérêts composés gagnés'),
        h('span', 'sv-split-box__total', `Total brut : ${money(pf.value)}`)),
      bar,
      pills,
    );
  }

  // Barre visuelle de repartition des lignes ETF
  function renderEtfAllocationBar(pf) {
    if (!pf.lines.length) return '';
    const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-5)', 'var(--series-4)'];
    const bar = h('div', 'sv-etf-bar');
    const legend = h('div', 'sv-etf-legend');
    pf.lines.forEach((l, i) => {
      const c = colors[i % colors.length];
      const seg = h('span', 'sv-etf-bar__seg');
      seg.style.width = `${(l.weight * 100).toFixed(1)}%`;
      seg.style.background = c;
      bar.append(seg);

      const dot = h('i', 'key');
      dot.style.background = c;
      dot.setAttribute('aria-hidden', 'true');
      legend.append(h('span', 'sv-etf-legend__item',
        dot,
        h('strong', null, l.ticker || l.name),
        ` : ${money(l.amount)} (${pct1(l.weight)})`));
    });
    return h('div', 'sv-etf-alloc', bar, legend);
  }

  // Projection ergonomique : selection persistante au clic et tableau annuel complet

  function simulation(account, pf) {
    const { env } = state;
    const sim = (state.sim[account.id] ??= {
      monthly: account.monthly ?? 0,
      horizon: 10,
      scenario: 'prudent',
      selectedYear: 10,
    });
    const uid = `pea-${account.id.slice(0, 8)}`;

    const input = document.createElement('input');
    Object.assign(input, { type: 'text', inputMode: 'decimal', autocomplete: 'off', value: sim.monthly ? decimal.format(sim.monthly / 100) : '' });
    input.placeholder = '0';
    const monthlyField = h('label', 'field sv-pea__monthly', h('span', null, 'Versement mensuel (€)'), input);

    // Boutons d'ajustement rapide du versement mensuel
    const quickBtns = h('div', 'sv-quick-btns');
    for (const step of QUICK_STEPS) {
      const btn = h('button', 'sv-quick-btn', `+${step / 100} €`);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        sim.monthly += step;
        input.value = decimal.format(sim.monthly / 100);
        draw(false);
        onChange();
      });
      quickBtns.append(btn);
    }
    const resetBtn = h('button', 'sv-quick-btn', 'Initial');
    resetBtn.type = 'button';
    resetBtn.title = 'Revenir au versement mensuel enregistré sur le PEA';
    resetBtn.addEventListener('click', () => {
      sim.monthly = account.monthly ?? 0;
      input.value = sim.monthly ? decimal.format(sim.monthly / 100) : '';
      draw(false);
      onChange();
    });
    quickBtns.append(resetBtn);

    const segmented = (name, legend, options, current, onSelect) => {
      const field = h('fieldset', 'segmented');
      field.append(h('legend', 'visually-hidden', legend));
      for (const o of options) {
        const radio = document.createElement('input');
        Object.assign(radio, { type: 'radio', name: `${uid}-${name}`, value: String(o.value), checked: o.value === current });
        field.append(h('label', null, radio, h('span', null, o.label)));
      }
      field.addEventListener('change', (e) => onSelect(e.target.value));
      return field;
    };
    const horizon = segmented('horizon', 'Horizon', HORIZONS.map((n) => ({ value: n, label: `${n} ans` })), sim.horizon, (v) => {
      sim.horizon = Number(v);
      sim.selectedYear = sim.horizon;
      draw(true);
      onChange();
    });
    const scenario = segmented('scenario', 'Hypothèse de rendement', SCENARIOS.map((s) => ({ value: s.id, label: s.label })), sim.scenario, (v) => {
      sim.scenario = v;
      draw(true);
      onChange();
    });

    const results = h('div', 'sv-pea__results');
    const controls = h('div', 'sv-pea__controls', monthlyField, quickBtns, horizon, scenario);
    const block = h('section', 'sv-pea__sim', h('h3', 'sv-widget__title', 'Projection du PEA et échéancier annuel'), controls, results);

    input.addEventListener('input', () => {
      const text = input.value.trim();
      let cents = 0;
      try { cents = text ? toCents(text) : 0; } catch { return; }
      if (cents < 0) return;
      sim.monthly = cents;
      draw(false);
      onChange();
    });

    function draw(animate) {
      const start = env.today.slice(0, 7);
      const run = (id) => projectPea({
        value: pf.value, deposits: pf.deposits, monthly: sim.monthly, rate: scenarioRate(pf, id), years: sim.horizon,
        opened: account.opened, start, inflation: env.inflation,
      });
      const chosen = SCENARIOS.find((s) => s.id === sim.scenario);
      const { points, final } = run(sim.scenario);
      if (sim.selectedYear == null || sim.selectedYear > sim.horizon) sim.selectedYear = sim.horizon;

      results.replaceChildren(
        summary(final, sim),
        ...chartAndTable(points, animate, sim),
        scenarios(run, sim),
        h('p', 'card__hint', `Hypothèse : ${chosen.text}, soit ${pct1(scenarioRate(pf, sim.scenario))} par an une fois les frais des ETF (${pctOf(Math.round(pf.ter * 100) / 100)}) déduits. En réalité la Bourse varie d'une année sur l'autre (−12,8 % pour le MSCI World en 2022) : le résultat est un repère de travail, pas une promesse. Versements en début de mois, jusqu'au plafond de ${money(PEA.cap)} ; pouvoir d'achat calculé avec ${pctOf(env.inflation)} d'inflation par an.`),
      );
    }

    function chartAndTable(points, animate, s) {
      const max = Math.max(1, ...points.map((p) => p.value)) * 1.16;
      const scrollWrap = h('div', 'sv-chart__scroll');
      const box = h('div', 'sv-chart');
      box.setAttribute('role', 'list');
      const labels = h('div', 'sv-chart__labels');
      labels.setAttribute('aria-hidden', 'true');
      for (const node of [box, labels]) node.style.setProperty('--cols', points.length);
      scrollWrap.append(box, labels);

      const readoutBox = h('div', 'sv-readout-box');
      readoutBox.setAttribute('aria-live', 'polite');

      const baseYear = Number(env.today.slice(0, 4));
      const every = points.length > 16 ? 5 : points.length > 11 ? 2 : 1;

      const labelSpans = [];
      const tableRows = [];

      const formatReadout = (p) => {
        const gainRatio = p.value > 0 ? Math.max(0, p.gains) / p.value : 0;
        const contribRatio = p.value > 0 ? Math.max(0, p.value - Math.max(0, p.gains)) / p.value : 1;
        const netGains = p.gains - p.tax;
        if (p.year === 0) {
          return h('div', null,
            h('strong', null, `Aujourd'hui (${baseYear}) : ${money(p.value)} bruts`),
            ` · Fonds investis : ${money(p.deposits)} (${pct1(contribRatio)}) · Intérêts composés gagnés : ${p.gains >= 0 ? '+' : ''}${money(p.gains)} (${pct1(gainRatio)}) · Net après retrait : ${money(p.net)}`);
        }
        return h('div', null,
          h('strong', null, `En ${baseYear + p.year} (dans ${p.year} an${p.year > 1 ? 's' : ''}) : ${money(p.value)} bruts`),
          ` · Fonds investis : ${money(p.deposits)} (${pct1(contribRatio)}) · Intérêts composés bruts : +${money(p.gains)} (${pct1(gainRatio)}) · Fiscalité (${pctOf(p.taxRate)}) : −${money(p.tax)} · Intérêts nets : +${money(netGains)} · `,
          h('strong', null, `Net disponible : ${money(p.net)}`),
          ` (${money(p.netReal)} en € d'aujourd'hui)`);
      };

      const selectYear = (yearIdx) => {
        s.selectedYear = yearIdx;
        const pt = points[yearIdx] ?? points.at(-1);
        cols.forEach(([col], idx) => col.classList.toggle('is-selected', idx === yearIdx));
        labelSpans.forEach((sp, idx) => sp.classList.toggle('is-selected', idx === yearIdx));
        tableRows.forEach((tr, idx) => tr.classList.toggle('is-selected', idx === yearIdx));
        readoutBox.replaceChildren(formatReadout(pt));
      };

      const cols = points.map((p, i) => {
        const col = h('button', 'sv-col');
        col.type = 'button';
        col.setAttribute('role', 'listitem');
        const isMilestone = i === 0 || i === points.length - 1 || i % every === 0;
        col.classList.toggle('is-today', i === 0);
        col.classList.toggle('is-last', i === points.length - 1);
        col.classList.toggle('is-milestone', isMilestone);

        const gainShare = p.value > 0 && p.gains > 0 ? (p.gains / p.value) * 100 : 0;
        const contribShare = Math.max(0, 100 - gainShare);

        const gainSeg = h('span', 'sv-col__bar-gain');
        if (gainShare >= 16 && p.gains > 0) {
          gainSeg.append(h('span', 'sv-col__seg-label', `+${money(p.gains)}`, h('small', null, `${Math.round(gainShare)} %`)));
        }
        const contribSeg = h('span', 'sv-col__bar-contrib');
        if (contribShare >= 16 && p.deposits > 0) {
          contribSeg.append(h('span', 'sv-col__seg-label', money(p.deposits), h('small', null, `${Math.round(contribShare)} %`)));
        }

        const bar = h('span', 'sv-col__bar', gainSeg, contribSeg);
        bar.style.setProperty('--gain-h', `${gainShare.toFixed(1)}%`);

        col.append(h('span', 'sv-col__value', money(p.value)), bar, h('span', 'sv-col__real'));
        col.setAttribute('aria-label', `${baseYear + p.year} : ${money(p.value)} bruts (dont ${money(p.deposits)} investis et +${money(p.gains)} d'intérêts composés), ${money(p.net)} nets`);
        col.addEventListener('click', () => selectYear(i));
        box.append(col);

        // Sous chaque barre : annee + repartition explicite Fonds investis et Interets composes (sans clic requis)
        const yrTitle = i === 0 ? `Auj. (${baseYear})` : `${baseYear + p.year}`;
        const lbl = h('div', `sv-col__meta${i === 0 ? ' is-today' : ''}`,
          h('strong', 'sv-col__year', yrTitle),
          h('span', 'sv-col__meta-gain', p.gains >= 0 ? `+${money(p.gains)}` : money(p.gains), h('small', null, ` (${Math.round(gainShare)} %)`)),
          h('span', 'sv-col__meta-contrib', money(p.deposits), h('small', null, ` (${Math.round(contribShare)} %)`)),
          h('span', 'sv-col__meta-net', `Net ${money(p.net)}`),
        );
        lbl.addEventListener('click', () => selectYear(i));
        labelSpans.push(lbl);
        labels.append(lbl);
        return [col, p.value / max, p.netReal / max];
      });

      const legend = h('p', 'sv-legend',
        h('span', null, h('i', 'key key--contrib'), 'Fonds investis (capital & versements cumulés)'),
        h('span', null, h('i', 'key key--gain'), 'Intérêts composés gagnés (plus-values cumulées)'),
        h('span', null, h('i', 'key key--real'), 'Net en euros d\'aujourd\'hui (pouvoir d\'achat)'),
      );
      legend.querySelectorAll('i').forEach((i) => i.setAttribute('aria-hidden', 'true'));

      const apply = () => cols.forEach(([col, hgt, realH]) => {
        col.style.setProperty('--h', pct(hgt));
        col.style.setProperty('--r', pct(realH));
      });
      if (animate && env.animate !== false) {
        cols.forEach(([col]) => { col.style.setProperty('--h', '0%'); col.style.setProperty('--r', '0%'); });
        requestAnimationFrame(() => requestAnimationFrame(apply));
      } else apply();

      // Graphe horizontal explicite : repartition Fonds investis vs Interets composes aux jalons cles
      const milestoneChart = renderMilestoneSplitChart(points, baseYear, selectYear);

      // Tableau annuel complet (toutes les annees sous les yeux, sans avoir a maintenir appuye)
      const yearTable = h('table', 'sv-table sv-table--compact sv-table--pea');
      yearTable.append(
        h('caption', 'visually-hidden', 'Échéancier annuel détaillé de la projection PEA'),
        h('thead', null, h('tr', null,
          h('th', null, 'Année'),
          h('th', 'num', 'Fonds investis'),
          h('th', 'num', 'Intérêts composés (bruts)'),
          h('th', 'num', 'Part intérêts'),
          h('th', 'num', 'Valeur brute'),
          h('th', 'num', 'Fiscalité retrait'),
          h('th', 'num', 'Intérêts nets'),
          h('th', 'num', 'Net après retrait'),
          h('th', 'num', 'En € d\'aujourd\'hui'))),
      );
      const tbody = h('tbody');
      points.forEach((p, idx) => {
        const labelText = p.year === 0 ? `Aujourd'hui (${baseYear})` : `${baseYear + p.year} (+${p.year} an${p.year > 1 ? 's' : ''})`;
        const th = h('th', null, p.year === 0 || idx === points.length - 1 ? h('strong', null, labelText) : labelText);
        th.scope = 'row';
        const gainShareFrac = p.value > 0 ? Math.max(0, p.gains) / p.value : 0;
        const netGains = p.gains - p.tax;
        const tr = h('tr', null,
          th,
          h('td', 'num', money(p.deposits)),
          h('td', 'num', gainBadge(p.gains)),
          h('td', 'num', pct1(gainShareFrac)),
          h('td', 'num', money(p.value)),
          h('td', 'num', `${money(p.tax)} (${pctOf(p.taxRate)})`),
          h('td', 'num', gainBadge(netGains)),
          h('td', 'num', h('strong', null, money(p.net))),
          h('td', 'num', money(p.netReal)));
        tr.dataset.yearIdx = String(idx);
        tr.addEventListener('click', () => selectYear(idx));
        tableRows.push(tr);
        tbody.append(tr);
      });
      yearTable.append(tbody);

      selectYear(s.selectedYear ?? points.length - 1);

      return [scrollWrap, legend, readoutBox, milestoneChart, h('div', 'sv-table__wrap', yearTable)];
    }

    // Graphe horizontal explicite : Fonds investis vs Interets composes gagnes par jalon
    function renderMilestoneSplitChart(points, baseYear, onSelect) {
      const wanted = new Set([0, 2, 5, 8, 10, 15, 20, 25, points.length - 1]);
      const milestones = points.filter((p) => wanted.has(p.year));
      const rows = milestones.map((p) => {
        const total = Math.max(1, p.value);
        const gainPos = Math.max(0, p.gains);
        const contribInVal = Math.max(0, p.value - gainPos);
        const contribPct = (contribInVal / total) * 100;
        const gainPct = (gainPos / total) * 100;
        const roi = p.deposits > 0 ? p.gains / p.deposits : 0;
        const netGain = p.gains - p.tax;

        const segContrib = h('span', 'sv-split-bar__seg sv-split-bar__seg--contrib');
        segContrib.style.width = `${contribPct.toFixed(1)}%`;
        if (contribPct >= 18) {
          segContrib.append(h('span', 'sv-split-bar__text', `Investi : ${money(p.deposits)} (${pct1(contribInVal / total)})`));
        }

        const segGain = h('span', 'sv-split-bar__seg sv-split-bar__seg--gain');
        segGain.style.width = `${gainPct.toFixed(1)}%`;
        if (gainPct >= 18) {
          segGain.append(h('span', 'sv-split-bar__text', `Intérêts : +${money(gainPos)} (${pct1(gainPos / total)})`));
        }

        const title = p.year === 0 ? `Aujourd'hui (${baseYear})` : `Dans ${p.year} an${p.year > 1 ? 's' : ''} (${baseYear + p.year})`;
        const row = h('div', 'sv-milestone-row',
          h('div', 'sv-milestone-row__head',
            h('strong', null, title),
            h('span', 'sv-milestone-row__figures',
              h('span', 'sv-milestone-tag sv-milestone-tag--contrib', `Fonds investis : ${money(p.deposits)} (${pct1(contribInVal / total)})`),
              h('span', 'sv-milestone-tag sv-milestone-tag--gain', `Intérêts composés : ${p.gains >= 0 ? '+' : ''}${money(p.gains)} (${pct1(gainPos / total)}${p.deposits > 0 ? ` · +${pct1(roi)} sur l'investi` : ''})`),
              h('span', 'sv-milestone-tag sv-milestone-tag--total', `Brut : ${money(p.value)} · Net : ${money(p.net)} (dont +${money(netGain)} d'intérêts nets)`),
            ),
          ),
          h('div', 'sv-split-bar sv-split-bar--compact', segContrib, segGain),
        );
        row.addEventListener('click', () => onSelect(p.year));
        return row;
      });

      return h('div', 'sv-milestone-box',
        h('h4', 'sv-split-box__title', 'Répartition détaillée : Fonds investis vs Intérêts composés gagnés par échéance'),
        h('div', 'sv-milestone-list', ...rows),
      );
    }

    function summary(final, s) {
      const stat = (term, value, note) => h('div', null, h('dt', null, term), h('dd', null, value), note ? h('small', null, note) : null);
      const renteMensuelle = Math.round(final.net * 0.04 / 12);
      const total = Math.max(1, final.value);
      const gainShare = Math.max(0, final.gains) / total;
      const contribShare = Math.max(0, final.value - Math.max(0, final.gains)) / total;
      const netGains = final.gains - final.tax;
      return h('dl', 'sv-stats sv-stats--row',
        stat(`Valeur brute dans ${s.horizon} ans`, money(final.value), `${pct1(contribShare)} de fonds investis · ${pct1(gainShare)} d'intérêts composés`),
        stat('Fonds investis cumulés', money(final.deposits), `${money(pf.deposits)} initiaux + ${money(Math.max(0, final.deposits - pf.deposits))} versés${final.capped ? ' (plafond 150 k€ atteint)' : ''}`),
        stat('Intérêts composés gagnés', gainBadge(final.gains), `${final.deposits > 0 ? `+${pct1(final.gains / final.deposits)} sur fonds investis · ` : ''}nets d'impôt : +${money(netGains)}`),
        stat('Net après impôt & Pouvoir d\'achat', money(final.net), `${money(final.netReal)} en € d'aujourd'hui · rente 4 % : ${money(renteMensuelle)} / mois`));
    }

    function scenarios(run, s) {
      const table = h('table', 'sv-table sv-table--compact sv-table--pea');
      table.append(h('caption', 'visually-hidden', `Comparaison des scénarios à ${s.horizon} ans`),
        h('thead', null, h('tr', null,
          h('th', null, `Comparaison des scénarios à ${s.horizon} ans`),
          h('th', 'num', 'Rendement net de frais'),
          h('th', 'num', 'Fonds investis'),
          h('th', 'num', 'Intérêts composés (bruts)'),
          h('th', 'num', 'Part intérêts'),
          h('th', 'num', 'Valeur brute'),
          h('th', 'num', 'Net après retrait'),
          h('th', 'num', 'En € d\'aujourd\'hui'))));
      table.append(h('tbody', null, ...SCENARIOS.map((sc) => {
        const { final } = run(sc.id);
        const th = h('th', null, sc.id === s.scenario ? h('strong', null, sc.label) : sc.label);
        th.scope = 'row';
        const gainShare = final.value > 0 ? Math.max(0, final.gains) / final.value : 0;
        return h('tr', sc.id === s.scenario ? 'is-selected' : null,
          th,
          h('td', 'num', `${pct1(scenarioRate(pf, sc.id))} / an`),
          h('td', 'num', money(final.deposits)),
          h('td', 'num', gainBadge(final.gains)),
          h('td', 'num', pct1(gainShare)),
          h('td', 'num', money(final.value)),
          h('td', 'num', money(final.net)),
          h('td', 'num', money(final.netReal)));
      })));
      return h('div', 'sv-table__wrap', table);
    }

    draw(env.animate);
    return block;
  }

  // Ajout et modification

  function editCard(account) {
    const { env } = state;
    const isNew = !account;
    const form = h('form', 'card sv-pea sv-pea__form');
    form.noValidate = true;
    if (account) form.dataset.id = account.id;
    const field = (label, control, className = 'field') => h('label', className, h('span', null, label), control);
    const textInput = (name, value = '', placeholder = '') => {
      const input = document.createElement('input');
      Object.assign(input, { type: 'text', name, value, inputMode: 'decimal', autocomplete: 'off', placeholder });
      return input;
    };

    const profile = document.createElement('select');
    profile.name = 'profile';
    const choices = freeHolders(account?.profile);
    profile.append(...choices.map((p) => new Option(env.nameOf(p), p)));
    profile.value = account?.profile ?? choices[0];
    const opened = document.createElement('input');
    Object.assign(opened, { type: 'month', name: 'opened', value: account?.opened ?? env.today.slice(0, 7), max: env.today.slice(0, 7), required: true });
    const date = document.createElement('input');
    Object.assign(date, { type: 'date', name: 'date', value: env.today, max: env.today, required: true });
    const deposits = textInput('deposits', account?.deposits == null ? '' : decimal.format(account.deposits / 100), 'facultatif');
    const monthly = textInput('monthly', account?.monthly ? decimal.format(account.monthly / 100) : '', '0');

    const profileField = field('Titulaire', profile);
    profileField.hidden = choices.length <= 1;
    const fields = h('div', 'sv-edit__fields', profileField, field('Ouvert en', opened), field('Valeur des lignes à la date du', date),
      field('Total versé depuis l\'ouverture (€)', deposits), field('Versement mensuel (€)', monthly));

    const rows = h('div', 'sv-pea__lines');
    const addRow = (line = {}) => rows.append(lineRow(line, rows));
    for (const line of account?.lines ?? [{ etf: ETFS[0].id }]) addRow(line);
    const more = h('button', 'link-btn', 'Ajouter une ligne');
    more.type = 'button';
    more.addEventListener('click', () => { addRow({ etf: ETFS[0].id }); rows.lastElementChild.querySelector('input[name="amount"]').focus(); });

    const error = h('p', 'form-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const cancel = h('button', 'btn btn--ghost btn--small', 'Annuler');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { state.editing = null; render(); });
    const submit = h('button', 'btn btn--primary btn--small', isNew ? 'Ajouter ce PEA' : 'Enregistrer');
    submit.type = 'submit';
    const actions = h('div', 'sv-actions');
    if (!isNew) {
      const remove = h('button', 'link-btn sv-danger-link', 'Ne plus suivre ce PEA');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        if (!window.confirm('Ne plus suivre ce PEA ? Ses lignes et sa valeur saisies sont oubliées.')) return;
        const previous = state.accounts;
        save(state.accounts.filter((a) => a.id !== account.id), 'Le PEA n\'est plus suivi.', previous);
      });
      actions.append(remove);
    }
    actions.append(h('span', 'sv-actions__end', cancel, submit));

    form.append(
      h('header', 'card__head', h('h2', null, isNew ? 'Ajouter un PEA' : 'Modifier le PEA'),
        h('p', 'card__hint', 'Indiquez chaque ETF détenu et sa valeur affichée par votre courtier. Le total versé (dans l\'historique du PEA) sert à calculer la plus-value et les prélèvements au retrait.')),
      fields, h('p', 'sv-pea__lines-title', 'Lignes du PEA'), rows, more, error, actions);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.hidden = true;
      try {
        if (!/^\d{4}-\d{2}$/.test(opened.value) || opened.value > env.today.slice(0, 7)) throw new Error('Indiquez le mois d\'ouverture du PEA (passé ou ce mois-ci).');
        if (!date.value || date.value > env.today) throw new Error('Choisissez une date passée ou aujourd\'hui pour la valeur des lignes.');
        const lines = [...rows.children].map(readRow);
        if (!lines.length) throw new Error('Ajoutez au moins une ligne d\'ETF.');
        const saved = {
          id: account?.id ?? crypto.randomUUID(),
          profile: profile.value,
          opened: opened.value,
          date: date.value,
          deposits: optionalEuros(deposits.value, 'Total versé invalide.'),
          monthly: optionalEuros(monthly.value, 'Versement mensuel invalide.') ?? 0,
          lines,
        };
        if (saved.deposits != null && saved.deposits > PEA.cap) throw new Error(`Les versements d'un PEA sont plafonnés à ${money(PEA.cap)}.`);
        delete state.sim[saved.id];
        const previous = state.accounts;
        const next = isNew ? [...state.accounts, saved] : state.accounts.map((a) => (a.id === saved.id ? saved : a));
        await save(next, isNew ? 'PEA ajouté.' : 'PEA mis à jour.', previous);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
    return form;
  }

  /** Une ligne du formulaire : ETF du catalogue (ou autre), montant, frais. */
  function lineRow(line, rows) {
    const select = document.createElement('select');
    select.name = 'etf';
    select.append(...ETFS.map((e) => new Option(`${e.ticker} · ${e.name}`, e.id)), new Option('Autre ETF…', OTHER_ETF));
    select.value = etfById.has(line.etf) ? line.etf : OTHER_ETF;
    const input = (name, value, mode = 'decimal', placeholder = '') => {
      const node = document.createElement('input');
      Object.assign(node, { type: 'text', name, value, inputMode: mode, autocomplete: 'off', placeholder });
      return node;
    };
    const amount = input('amount', line.amount == null ? '' : decimal.format(line.amount / 100));
    const ter = input('ter', decimal.format(line.ter ?? etfById.get(select.value)?.ter ?? 0.3));
    const name = input('name', line.name ?? '', 'text', 'Nom ou ticker');
    const index = document.createElement('select');
    index.name = 'index';
    index.append(...INDEX_RETURNS.map((i) => new Option(i.name, i.id)));
    index.value = line.index ?? 'world';

    const field = (label, control, extra = '') => h('label', `field ${extra}`, h('span', null, label), control);
    const nameField = field('Nom de l\'ETF', name, 'sv-pea__other');
    const indexField = field('Indice le plus proche', index, 'sv-pea__other');
    const toggle = () => {
      const other = select.value === OTHER_ETF;
      nameField.hidden = !other;
      indexField.hidden = !other;
    };
    select.addEventListener('change', () => {
      const etf = etfById.get(select.value);
      if (etf) ter.value = decimal.format(etf.ter);
      toggle();
    });
    toggle();

    const remove = h('button', 'icon-btn js-remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Retirer cette ligne');
    remove.innerHTML = REMOVE_ICON;
    remove.addEventListener('click', () => { if (rows.children.length > 1) row.remove(); });

    const row = h('fieldset', 'sv-pea__line', h('legend', 'visually-hidden', 'Ligne d\'ETF'),
      field('ETF', select, 'sv-pea__etf'), field('Valeur (€)', amount), field('Frais (% / an)', ter), remove, nameField, indexField);
    return row;
  }

  function readRow(row) {
    const get = (name) => row.querySelector(`[name="${name}"]`).value.trim();
    const etf = get('etf');
    const amountText = get('amount');
    if (!amountText) throw new Error('Indiquez la valeur de chaque ligne.');
    let amount;
    try { amount = toCents(amountText); } catch { throw new Error('Valeur de ligne invalide.'); }
    if (amount < 0) throw new Error('Valeur de ligne invalide.');
    const ter = Number(get('ter').replace(',', '.').replace(/\s|%/g, ''));
    if (!Number.isFinite(ter) || ter < 0 || ter > 3) throw new Error('Frais invalides : entre 0 et 3 % par an.');
    if (etf === OTHER_ETF) {
      const name = get('name');
      if (!name) throw new Error('Donnez un nom à l\'ETF « autre ».');
      return { etf, name, index: get('index'), ter, amount };
    }
    return { etf, ter, amount };
  }

  return { load, update, accounts: () => state.accounts, simOf: (id) => state.sim[id] };
}

function optionalEuros(text, message) {
  if (!text.trim()) return null;
  let cents;
  try { cents = toCents(text); } catch { throw new Error(message); }
  if (cents < 0) throw new Error(message);
  return cents;
}

function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
