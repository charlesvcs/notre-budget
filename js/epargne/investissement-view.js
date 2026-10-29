/**
 * Onglet « Investir » : vue d'ensemble du patrimoine global (livrets + PEA),
 * portefeuilles PEA, objectifs et confrontation aux strategies d'investissement.
 */
import { PROFILES, STORES } from '../db/schema.js';
import {
  getActiveProfiles, getById, getByIndex, getCategories, getLivrets, getProfileNames, getSetting, setSetting, toCents,
} from '../db/database.js';
import { PRODUCTS, currentInflation, mergeRates, rateOn, referenceData } from './livret-rates.js';
import { buildLivretModel, matchFlows, summarize } from './livret-model.js';
import { PEA, monthsBetween, portfolio, projectPea, scenarioRate } from './pea.js';
import {
  CRASH, EQUITY_CHOICES, confront, marketAssumptions,
} from './objectifs.js';
import { mountPeaSection } from './pea-view.js';
import { buildFullWorkbook, buildInvestWorkbook } from './export.js';
import { download } from '../backup/backup-core.js';
import { peaWidget, verdictTag } from './widgets.js';
import { gainBadge, h, money, monthLong, pct, pct1, pctOf, setWidths } from './format.js';

const HOLDERS = [PROFILES.ME, PROFILES.PARTNER];
const PATRIMOINE_MILESTONES = [0, 5, 10, 15, 20];
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export function mountInvestissementView(root = document) {
  const $ = (id) => root.getElementById(id);
  const el = {
    view: $('view-investir'),
    notice: $('inv-notice'),
    noticeText: $('inv-notice-text'),
    undo: $('inv-undo'),
    kpis: $('inv-kpis'),
    patrimoine: $('inv-patrimoine'),
    peaEmpty: $('inv-pea-empty'),
    peaEmptyAdd: $('inv-pea-empty-add'),
    goals: $('inv-goals'),
    goalsEmpty: $('inv-goals-empty'),
    goalAdd: $('inv-goal-add'),
    market: $('inv-market'),
    marketNote: $('inv-market-note'),
    reference: $('inv-reference'),
    referenceHint: $('inv-reference-hint'),
    exportBtn: $('inv-export'),
  };

  const state = {
    today: '',
    goals: [],
    livrets: [],
    livretModels: [],
    livretSummary: null,
    rates: [],
    editing: null, // id de l'objectif en cours de modification, ou 'nouveau'
    equity: 'prudent',
    peaYears: 10,
    names: {},
    active: [PROFILES.ME],
    inflation: null,
    ref: null,
    livretA: 0,
    animate: true,
  };

  const nameOf = (p) => state.names[p] ?? p;
  const holders = () => {
    const set = new Set([
      ...state.active.filter((p) => HOLDERS.includes(p)),
      ...pea.accounts().map((a) => a.profile),
      ...state.livrets.map((l) => l.profile),
    ]);
    return HOLDERS.filter((p) => set.has(p));
  };

  const pea = mountPeaSection({
    container: $('inv-pea'),
    addButton: $('inv-pea-add'),
    notify: (text, undo) => showNotice(text, undo),
    onChange: () => { renderPeaEmpty(); renderKpis(); renderPatrimoine(); renderGoals(); },
  });
  el.peaEmptyAdd.addEventListener('click', () => $('inv-pea-add').click());

  async function load() {
    state.today = todayIso();
    const [names, active, goals, inflation, official, userRates, livrets, categories, assign] = await Promise.all([
      getProfileNames(), getActiveProfiles(), getSetting('objectifs'), getSetting('inflation'), getSetting('donneesOfficielles'),
      getSetting('livretRates'), getLivrets(), getCategories({ includeArchived: true }), getSetting('livretAssign'), pea.load(),
    ]);
    state.names = names ?? {};
    state.active = active;
    state.goals = goals ?? [];
    state.inflation = currentInflation(inflation, official);
    state.ref = referenceData(official);
    state.rates = mergeRates(userRates ?? [], official?.livrets?.rates ?? []);
    state.livretA = rateOn(state.rates, 'livretA', state.today) / 100;

    // Chargement des livrets pour offrir la vision globale du patrimoine
    state.livrets = (livrets ?? []).sort((a, b) => HOLDERS.indexOf(a.profile) - HOLDERS.indexOf(b.profile)
      || Object.keys(PRODUCTS).indexOf(a.product) - Object.keys(PRODUCTS).indexOf(b.product));
    const savingsCats = new Set(categories.filter((c) => c.kind === 'epargne').map((c) => c.id));
    const assignMap = assign ?? {};
    const byId = new Map();
    for (const id of savingsCats) {
      for (const tx of await getByIndex(STORES.TRANSACTIONS, 'categoryId', id)) byId.set(tx.id, tx);
    }
    for (const id of Object.keys(assignMap)) {
      if (byId.has(id)) continue;
      const tx = await getById(STORES.TRANSACTIONS, id);
      if (tx) byId.set(id, tx);
    }
    const { byLivret } = matchFlows([...byId.values()], state.livrets, assignMap, savingsCats);
    state.livretModels = state.livrets.map((livret) => buildLivretModel({
      livret,
      flows: byLivret.get(livret.id) ?? [],
      rates: state.rates,
      today: state.today,
      inflation: state.inflation.rate,
      horizon: 20,
    }));
    state.livretSummary = summarize(state.livretModels, state.inflation.rate);
    render();
  }

  function render() {
    pea.update({
      today: state.today, inflation: state.inflation.rate, annual: state.ref.annual, holders: holders(), nameOf,
      solo: holders().length <= 1, animate: state.animate,
    });
    renderPeaEmpty();
    renderKpis();
    renderPatrimoine();
    renderMarket();
    renderGoals();
    renderReference();
    state.animate = false;
  }

  function renderPeaEmpty() {
    el.peaEmpty.hidden = pea.accounts().length > 0 || !$('inv-pea').hidden;
  }

  // Calcul du patrimoine global et de sa projection a 20 ans
  function computeGlobalPatrimoine() {
    const startMonth = state.today.slice(0, 7);
    const livretNow = state.livretSummary?.balance ?? 0;
    const livretMonthly = state.livretModels.reduce((s, m) => s + m.plan.monthly, 0);
    const livretYears = state.livretSummary?.years ?? [];

    // Projections de chaque PEA sur 20 ans (selon son simulateur ou l'hypothese active)
    const peaAccounts = pea.accounts();
    const peaRuns = peaAccounts.map((acc) => {
      const pf = portfolio(acc, state.ref.annual);
      const sim = pea.simOf(acc.id);
      const monthly = sim ? sim.monthly : (acc.monthly ?? 0);
      const scenId = sim ? sim.scenario : state.equity;
      const rate = scenarioRate(pf, scenId);
      const proj = projectPea({
        value: pf.value,
        deposits: pf.deposits,
        monthly,
        rate,
        years: 20,
        opened: acc.opened,
        start: startMonth,
        inflation: state.inflation.rate,
      });
      return { acc, pf, monthly, rate, proj };
    });

    const peaGrossNow = peaRuns.reduce((s, r) => s + r.pf.value, 0);
    const peaNetNow = peaRuns.reduce((s, r) => s + r.proj.points[0].net, 0);
    const peaDepositsNow = peaRuns.reduce((s, r) => s + r.pf.deposits, 0);
    const peaLatentNow = peaRuns.reduce((s, r) => s + (r.pf.value - r.pf.deposits), 0);
    const peaNetGainsNow = peaRuns.reduce((s, r) => s + (r.proj.points[0].net - r.pf.deposits), 0);
    const peaMonthly = peaRuns.reduce((s, r) => s + r.monthly, 0);

    const rows = PATRIMOINE_MILESTONES.map((yr) => {
      const livretVal = yr === 0
        ? livretNow
        : (livretYears[yr]?.end ?? livretYears.at(-1)?.end ?? livretNow);
      const livretInterest = yr === 0
        ? 0
        : (livretYears[yr]?.cumulated ?? Math.max(0, livretVal - (livretNow + livretMonthly * 12 * yr)));
      const livretDeposits = Math.max(0, livretVal - livretInterest);
      const peaGross = peaRuns.reduce((s, r) => s + (r.proj.points[yr]?.value ?? 0), 0);
      const peaNet = peaRuns.reduce((s, r) => s + (r.proj.points[yr]?.net ?? 0), 0);
      const peaDeposits = peaRuns.reduce((s, r) => s + (r.proj.points[yr]?.deposits ?? 0), 0);
      const peaGainsNet = peaNet - peaDeposits;
      const totalDeposits = livretDeposits + peaDeposits;
      const totalGainsNet = livretInterest + peaGainsNet;
      const totalGross = livretVal + peaGross;
      const totalNet = livretVal + peaNet;
      const deflator = (1 + state.inflation.rate / 100) ** yr;
      const totalReal = Math.round(totalNet / deflator);
      const rente4Pct = Math.round(totalNet * 0.04 / 12);
      return {
        year: yr,
        livretVal,
        livretDeposits,
        livretInterest,
        peaGross,
        peaNet,
        peaDeposits,
        peaGainsNet,
        totalGross,
        totalNet,
        totalReal,
        totalDeposits,
        totalGainsNet,
        rente4Pct,
      };
    });

    return {
      livretNow,
      livretMonthly,
      peaGrossNow,
      peaNetNow,
      peaDepositsNow,
      peaLatentNow,
      peaNetGainsNow,
      peaMonthly,
      totalDepositsNow: livretNow + peaDepositsNow,
      totalGainsNetNow: peaNetGainsNow,
      totalGrossNow: livretNow + peaGrossNow,
      totalNetNow: livretNow + peaNetNow,
      totalMonthly: livretMonthly + peaMonthly,
      rows,
    };
  }

  // Synthese et projection du patrimoine global
  function renderPatrimoine() {
    if (!el.patrimoine) return;
    const pat = computeGlobalPatrimoine();
    const hasAny = state.livrets.length > 0 || pea.accounts().length > 0;
    el.patrimoine.hidden = !hasAny;
    if (!hasAny) return;

    const total = Math.max(1, pat.totalGrossNow);
    const livretShare = pat.livretNow / total;
    const peaShare = pat.peaGrossNow / total;
    const baseYear = Number(state.today.slice(0, 4));

    const segLivret = h('span', 'patrimoine-bar__seg patrimoine-bar__seg--livrets');
    const segPea = h('span', 'patrimoine-bar__seg patrimoine-bar__seg--pea');
    segLivret.style.setProperty('--w', pct(livretShare));
    segPea.style.setProperty('--w', pct(peaShare));

    const bar = h('div', 'patrimoine-bar', segLivret, segPea);
    const legend = h('p', 'sv-legend',
      h('span', null, h('i', 'key key--contrib'), `Épargne sécurisée (Livrets) : ${money(pat.livretNow)} (${pct1(livretShare)}) · +${money(pat.livretMonthly)} / mois`),
      h('span', null, h('i', 'key key--today'), `Actions (PEA brut) : ${money(pat.peaGrossNow)} (${pct1(peaShare)}) · +${money(pat.peaMonthly)} / mois`),
      h('span', null, h('i', 'key key--gain'), `Dont plus-values & intérêts composés actuels : ${money(pat.peaLatentNow)} bruts (${money(pat.peaNetGainsNow)} nets)`),
    );
    legend.querySelectorAll('i').forEach((i) => i.setAttribute('aria-hidden', 'true'));

    const table = h('table', 'sv-table sv-table--compact sv-table--pea');
    table.append(
      h('caption', 'visually-hidden', 'Projection du patrimoine global sur 20 ans'),
      h('thead', null, h('tr', null,
        h('th', null, 'Horizon'),
        h('th', 'num', 'Fonds investis cumulés'),
        h('th', 'num', 'Intérêts composés nets'),
        h('th', 'num', 'Livrets réglementés'),
        h('th', 'num', 'PEA (net d\'impôt)'),
        h('th', 'num', 'Patrimoine net total'),
        h('th', 'num', 'En € d\'aujourd\'hui'),
        h('th', 'num', 'Rente 4 % / mois'))),
    );
    table.append(h('tbody', null, ...pat.rows.map((r) => {
      const label = r.year === 0 ? `Aujourd'hui (${baseYear})` : `Dans ${r.year} ans (${baseYear + r.year})`;
      const th = h('th', null, r.year === 0 || r.year === 10 || r.year === 20 ? h('strong', null, label) : label);
      th.scope = 'row';
      const gainShare = r.totalNet > 0 && r.totalGainsNet > 0 ? r.totalGainsNet / r.totalNet : 0;
      return h('tr', r.year === 10 ? 'is-selected' : null,
        th,
        h('td', 'num', money(r.totalDeposits)),
        h('td', 'num', h('span', null, gainBadge(r.totalGainsNet), gainShare > 0 ? ` (${pct1(gainShare)})` : '')),
        h('td', 'num', money(r.livretVal)),
        h('td', 'num', money(r.peaNet)),
        h('td', 'num', h('strong', null, money(r.totalNet))),
        h('td', 'num', money(r.totalReal)),
        h('td', 'num', `${money(r.rente4Pct)} / mois`),
      );
    })));

    el.patrimoine.replaceChildren(
      h('header', 'card__head card__head--row',
        h('div', null,
          h('h2', null, 'Étendue et projection du patrimoine global'),
          h('p', 'card__hint', `Synthèse consolidée de vos ${state.livrets.length} livret${state.livrets.length > 1 ? 's' : ''} et ${pea.accounts().length} PEA, avec distinction directe entre fonds investis et intérêts composés nets.`)),
      ),
      bar,
      legend,
      h('div', 'sv-table__wrap', table),
      h('p', 'card__hint', `La colonne « Rente 4 % / mois » indique le revenu mensuel soutenable à long terme selon la règle patrimoniale des 4 % par an sur le patrimoine net. Pouvoir d'achat calculé avec ${pctOf(state.inflation.rate)} d'inflation annuelle.`),
    );
  }

  // Hypotheses de marche

  const market = () => marketAssumptions({
    accounts: pea.accounts(), annual: state.ref.annual, equity: state.equity, livretA: state.livretA, month: state.today.slice(0, 7),
  });

  function renderMarket() {
    const field = h('fieldset', 'segmented');
    field.append(h('legend', 'visually-hidden', 'Rendement des actions'));
    for (const c of EQUITY_CHOICES) {
      const input = document.createElement('input');
      Object.assign(input, { type: 'radio', name: 'inv-equity', value: c.id, checked: c.id === state.equity });
      field.append(h('label', null, input, h('span', null, c.label)));
    }
    field.addEventListener('change', (e) => { state.equity = e.target.value; renderMarket(); renderKpis(); renderPatrimoine(); renderGoals(); });
    el.market.replaceChildren(field);
    const m = market();
    const choice = EQUITY_CHOICES.find((c) => c.id === state.equity);
    el.marketNote.textContent = `Actions : ${choice.text} (${pct1(m.gross)}), moins ${pctOf(Math.round(m.ter * 100) / 100)} de frais d'ETF${m.hasPea ? ' (ceux de vos PEA)' : ''}, soit ${pct1(m.equityRate)} par an. Livrets : ${pctOf(m.safeRate * 100)}, le taux actuel du Livret A. Gains des actions imposés au retrait comme dans un PEA (${pctOf(PEA.taxAfter)} après ${PEA.years} ans${m.hasPea ? ', votre PEA ayant déjà ' + Math.floor(m.peaAge / 12) + ' an' + (m.peaAge >= 24 ? 's' : '') : ', PEA ouvert aujourd\'hui'}).`;
  }

  // Vue d'ensemble (KPIs)

  function renderKpis() {
    const tile = (label, value, note) => h('div', 'sv-kpi', h('dt', null, label), h('dd', null, value), h('small', null, note));
    const pat = computeGlobalPatrimoine();
    const pfs = pea.accounts().map((a) => portfolio(a, state.ref.annual));
    const in10Years = pat.rows.find((r) => r.year === 10) ?? pat.rows[0];
    const m = market();
    const results = state.goals.map((g) => confront(g, m, state.today.slice(0, 7)));
    const ok = results.filter((r) => r.rows.find((row) => row.suggested).reached).length;

    el.kpis.replaceChildren(
      tile('Patrimoine net actuel', h('span', 'sv-num', money(pat.totalNetNow)),
        `${money(pat.livretNow)} sur livrets · ${money(pat.peaNetNow)} sur PEA net`),
      tile('Portefeuilles PEA', h('span', 'sv-num', money(pat.peaGrossNow)),
        pfs.length ? h('span', null, 'plus-value latente ', gainBadge(pat.peaLatentNow)) : 'aucun PEA saisi pour l\'instant'),
      tile('Effort d\'épargne total', h('span', 'sv-num', `${money(pat.totalMonthly)} / mois`),
        `${money(pat.livretMonthly)} livrets + ${money(pat.peaMonthly)} PEA`),
      tile('Patrimoine projeté à 10 ans', h('span', 'sv-num', money(in10Years.totalNet)),
        `${money(in10Years.totalReal)} en euros d'aujourd'hui${state.goals.length ? ` · ${ok}/${state.goals.length} objectifs atteints` : ''}`));
  }

  // Objectifs

  function renderGoals() {
    const m = market();
    const cards = state.goals.map((g) => (state.editing === g.id ? goalForm(g) : goalCard(g, m)));
    if (state.editing === 'nouveau') cards.push(goalForm(null));
    el.goals.replaceChildren(...cards);
    el.goalsEmpty.hidden = cards.length > 0;
    el.goalAdd.hidden = state.editing === 'nouveau';
  }

  el.goalAdd.addEventListener('click', () => {
    state.editing = 'nouveau';
    renderGoals();
    el.goals.lastElementChild?.scrollIntoView({ block: 'start' });
    el.goals.lastElementChild?.querySelector('input')?.focus();
  });

  function goalCard(goal, m) {
    const month = state.today.slice(0, 7);
    const result = confront(goal, m, month);
    const best = result.rows.find((r) => r.suggested);
    const card = h('article', 'card inv-goal');
    card.dataset.id = goal.id;

    const remaining = result.months >= 12
      ? `dans ${Math.floor(result.years)} an${result.years >= 2 ? 's' : ''}${result.months % 12 ? ` et ${result.months % 12} mois` : ''}`
      : `dans ${result.months} mois`;
    const head = h('header', 'sv-livret__head',
      h('div', null, h('h2', null, goal.name), h('p', 'card__hint', `En ${monthLong(goal.deadline)}, ${remaining}`)),
      h('p', 'sv-livret__rate', h('strong', null, money(goal.target)), h('small', null, 'montant visé')));

    const fill = h('span', 'meter__fill');
    const progress = h('div', 'sv-cap', h('div', 'meter', fill),
      h('p', 'env__line', h('span', null, `${money(goal.saved)} déjà mis de côté · ${money(goal.monthly)} par mois`),
        h('span', 'env__figures', h('strong', null, pct1(Math.min(1, goal.saved / goal.target))), ' de l\'objectif')));
    setWidths([[fill, goal.saved / goal.target]], state.animate);

    const table = h('table', 'sv-table sv-table--compact sv-table--pea');
    table.append(h('caption', 'visually-hidden', `${goal.name} : stratégies comparées`),
      h('thead', null, h('tr', null, h('th', null, 'Stratégie'), h('th', 'num', 'Net à l\'échéance'), h('th', 'num', 'Écart'),
        h('th', 'num', 'Versement nécessaire'), h('th', 'num', 'Si 2008 se répétait'))));
    table.append(h('tbody', null, ...result.rows.map((r) => {
      const th = h('th', null, h('strong', null, r.strategy.name), r.suggested ? ' ' : null,
        r.suggested ? verdictTag('ok', 'conseillée') : null, h('small', null, r.strategy.text));
      th.scope = 'row';
      const needed = r.needed === 0 ? 'déjà atteint' : r.needed == null ? 'Hors plafond' : `${money(r.needed)} / mois`;
      return h('tr', r.suggested ? 'is-suggested' : null, th, h('td', 'num', money(r.net)), h('td', 'num', gainBadge(r.gap)),
        h('td', 'num', needed), h('td', 'num', r.crash ? `−${money(r.crash)}` : 'aucune perte'));
    })));

    const reached = result.rows.filter((r) => r.reached).map((r) => r.strategy.name);
    const verdict = [];
    if (result.months === 0) {
      verdict.push('L\'échéance est arrivée : mettez à jour la date ou le montant de cet objectif.');
    } else if (best.reached) {
      verdict.push(`Avec ${money(goal.monthly)} par mois, la stratégie conseillée pour ${remaining.replace('dans ', '')} (${best.strategy.name.toLowerCase()}) atteint l'objectif : environ ${money(best.net)} nets.`);
    } else {
      const when = best.reachIn != null ? ` À ce rythme, il serait atteint en ${monthLong(addMonths(month, best.reachIn))}.` : '';
      verdict.push(`Avec ${money(goal.monthly)} par mois, la stratégie conseillée (${best.strategy.name.toLowerCase()}) arrive à environ ${money(best.net)} : il faudrait ${money(best.needed)} par mois pour atteindre ${money(goal.target)} à temps.${when}`);
    }
    if (reached.length && !best.reached) verdict.push(`Avec plus d'actions (${reached.join(', ').toLowerCase()}), l'objectif serait atteint en moyenne, mais avec plus de risque à cette échéance.`);
    if (best.crash > 0 && result.months > 0) verdict.push(`Si les actions chutaient comme en 2008 (près de −${CRASH * 100}\u00a0%) juste avant l'échéance, il manquerait jusqu'à ${money(best.crash)} : sécurisez progressivement sur livrets les 2 ou 3 dernières années.`);
    if (best.capped) verdict.push(`Attention : les versements en actions dépasseraient le plafond du PEA (${money(PEA.cap)}).`);

    const edit = h('button', 'btn btn--ghost btn--small', 'Modifier');
    edit.type = 'button';
    edit.addEventListener('click', () => { state.editing = goal.id; renderGoals(); el.goals.querySelector(`[data-id="${goal.id}"] input`)?.focus(); });

    card.append(head, progress, h('div', 'sv-table__wrap', table), h('p', 'sv-verdict', verdict.join(' ')),
      h('p', 'card__hint', `Montants en euros de l'époque : ${money(goal.target)} vaudront environ ${money(goal.target / (1 + state.inflation.rate / 100) ** result.years)} d'aujourd'hui avec ${pctOf(state.inflation.rate)} d'inflation par an. Stratégie conseillée selon le temps restant : livrets sous 3 ans, prudente de 3 à 5 ans, équilibrée de 5 à 8 ans, dynamique au-delà.`),
      h('div', 'sv-actions', edit));
    return card;
  }

  function goalForm(goal) {
    const isNew = !goal;
    const form = h('form', 'card sv-pea__form inv-goal');
    form.noValidate = true;
    if (goal) form.dataset.id = goal.id;
    const input = (name, value, type = 'text') => {
      const node = document.createElement('input');
      Object.assign(node, { type, name, value, autocomplete: 'off' });
      if (type === 'text') node.inputMode = name === 'name' ? 'text' : 'decimal';
      return node;
    };
    const euros = (cents) => (cents == null ? '' : decimal.format(cents / 100));
    const field = (label, control) => h('label', 'field', h('span', null, label), control);
    const name = input('name', goal?.name ?? '');
    name.placeholder = 'Apport immobilier, études, retraite…';
    const target = input('target', euros(goal?.target));
    const deadline = input('deadline', goal?.deadline ?? addMonths(state.today.slice(0, 7), 60), 'month');
    deadline.min = addMonths(state.today.slice(0, 7), 1);
    const saved = input('saved', euros(goal?.saved ?? 0));
    const monthly = input('monthly', euros(goal?.monthly ?? 0));

    const fields = h('div', 'sv-edit__fields', h('label', 'field sv-edit__wide', h('span', null, 'Objectif'), name), field('Montant visé (€)', target),
      field('Échéance', deadline), field('Déjà mis de côté (€)', saved), field('Versement mensuel (€)', monthly));

    const pfs = pea.accounts().map((a) => portfolio(a, state.ref.annual));
    const fromPea = h('button', 'link-btn', `Partir de vos PEA (${money(pfs.reduce((s, p) => s + p.value, 0))}, ${money(pea.accounts().reduce((s, a) => s + (a.monthly ?? 0), 0))} par mois)`);
    fromPea.type = 'button';
    fromPea.hidden = !pfs.length;
    fromPea.addEventListener('click', () => {
      saved.value = euros(pfs.reduce((s, p) => s + p.value, 0));
      monthly.value = euros(pea.accounts().reduce((s, a) => s + (a.monthly ?? 0), 0));
    });

    const error = h('p', 'form-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const cancel = h('button', 'btn btn--ghost btn--small', 'Annuler');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { state.editing = null; renderGoals(); });
    const submit = h('button', 'btn btn--primary btn--small', isNew ? 'Ajouter cet objectif' : 'Enregistrer');
    submit.type = 'submit';
    const actions = h('div', 'sv-actions');
    if (!isNew) {
      const remove = h('button', 'link-btn sv-danger-link', 'Supprimer cet objectif');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Supprimer l'objectif « ${goal.name} » ?`)) return;
        saveGoals(state.goals.filter((g) => g.id !== goal.id), 'Objectif supprimé.');
      });
      actions.append(remove);
    }
    actions.append(h('span', 'sv-actions__end', cancel, submit));

    form.append(h('header', 'card__head', h('h2', null, isNew ? 'Ajouter un objectif' : 'Modifier l\'objectif'),
      h('p', 'card__hint', 'Un montant à atteindre à une date : il sera confronté à chaque stratégie, avec ce que vous avez déjà et ce que vous versez chaque mois.')),
    fields, fromPea, error, actions);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      error.hidden = true;
      try {
        if (!name.value.trim()) throw new Error('Donnez un nom à l\'objectif.');
        const t = parseEuros(target.value, 'Indiquez le montant visé.');
        if (t <= 0) throw new Error('Indiquez le montant visé.');
        if (!/^\d{4}-\d{2}$/.test(deadline.value) || deadline.value <= state.today.slice(0, 7)) throw new Error('Choisissez une échéance après ce mois-ci.');
        const next = {
          id: goal?.id ?? crypto.randomUUID(),
          name: name.value.trim(),
          target: t,
          deadline: deadline.value,
          saved: saved.value.trim() ? parseEuros(saved.value, 'Montant déjà mis de côté invalide.') : 0,
          monthly: monthly.value.trim() ? parseEuros(monthly.value, 'Versement mensuel invalide.') : 0,
        };
        saveGoals(isNew ? [...state.goals, next] : state.goals.map((g) => (g.id === next.id ? next : g)), isNew ? 'Objectif ajouté.' : 'Objectif mis à jour.');
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
    return form;
  }

  async function saveGoals(goals, message) {
    const previous = state.goals;
    await setSetting('objectifs', goals);
    state.goals = goals;
    state.editing = null;
    state.animate = true;
    renderGoals();
    renderKpis();
    state.animate = false;
    showNotice(message, async () => {
      await setSetting('objectifs', previous);
      state.goals = previous;
      renderGoals();
      renderKpis();
    });
  }

  // Reperes : indices et fiscalite

  function renderReference() {
    const ctx = {
      ref: state.ref,
      peaYears: state.peaYears,
      setPeaYears(n) { state.peaYears = n; renderReference(); },
      summary: { rate: state.livretA * 100 },
      livretLabel: 'au Livret A',
      safety: null,
    };
    el.referenceHint.textContent = peaWidget.hint(ctx);
    const head = el.reference.querySelector('.card__head');
    head.querySelector('.segmented')?.remove();
    head.append(peaWidget.control(ctx));
    const body = el.reference.querySelector('.sv-widget__body');
    body.replaceChildren();
    peaWidget.render(body, ctx);
  }

  // Export Excel

  el.exportBtn.addEventListener('click', async () => {
    el.exportBtn.disabled = true;
    el.exportBtn.textContent = 'Préparation…';
    try {
      const workbook = await buildFullWorkbook({
        ref: state.ref,
        pea: pea.accounts(),
        names: state.names,
        today: state.today,
        inflation: state.inflation,
        goals: state.goals,
        market: market(),
        peaSim: pea.simOf,
        livretModels: state.livretModels,
        livretSummary: state.livretSummary,
        rates: state.rates,
      });
      download(new File([workbook.toBlob()], `notre-budget-bilan-complet-${state.today}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      showNotice('Classeur Excel complet prêt : il est dans vos téléchargements.');
    } catch (err) {
      console.error('[export] Échec :', err);
      showNotice('L\'export n\'a pas abouti. Réessayez, ou rechargez la page.');
    } finally {
      el.exportBtn.disabled = false;
      el.exportBtn.textContent = 'Exporter le bilan Excel';
    }
  });

  // Messages

  let noticeTimer = null;
  function showNotice(text, undo = null) {
    clearTimeout(noticeTimer);
    el.noticeText.textContent = text;
    el.undo.hidden = !undo;
    el.undo.onclick = undo ? async () => { el.notice.hidden = true; await undo(); } : null;
    el.notice.hidden = false;
    noticeTimer = setTimeout(() => { el.notice.hidden = true; }, undo ? 8000 : 4000);
  }

  return {
    async show() {
      state.animate = true;
      await load();
    },
  };
}

// Utilitaires

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function parseEuros(text, message) {
  let cents;
  try { cents = toCents(text); } catch { throw new Error(message); }
  if (cents < 0) throw new Error(message);
  return cents;
}
