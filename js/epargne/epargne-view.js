/**
 * Écran « Épargne » : les livrets réglementés (Livret A, LEP). Solde estimé,
 * intérêts de l'année, plafond, rendement face à l'inflation et projection.
 * Les calculs sont dans livret-model.js ; ce module lit la base et dessine.
 */
import { PROFILES, STORES } from '../db/schema.js';
import {
  DATA_CHANGED, deleteLivret, getActiveProfiles, getById, getByIndex, getCategories, getEarliestMonth, getLivrets,
  getProfileNames, getSetting, getTransactionsByMonth, saveLivret, setSetting, toCents,
} from '../db/database.js';
import { normalizeLabel } from '../import/categorizer.js';
import { buildLivretModel, livretKeywords, matchFlows, summarize } from './livret-model.js';
import { LIVRET_COLORS, OFFICIAL_INFLATION, PRODUCTS, mergeRates, referenceData } from './livret-rates.js';
import { SOURCES, isStale, refreshOfficialData } from './live-data.js';
import { monthlyExpenses } from './indicators.js';
import { buildEpargneWorkbook } from './export.js';
import { download } from '../backup/backup-core.js';
import { OFF_BUDGET_KINDS } from '../db/schema.js';
import { DEFAULT_WIDGETS, WIDGETS, widgetById } from './widgets.js';
import {
  asDate, h, longDate, money, moneyExact, monthLong, pct, pctOf, realBadge, setWidths, signedMoney, gainBadge,
} from './format.js';

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const dateLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const HOLDERS = [PROFILES.ME, PROFILES.PARTNER];
const RATE_ROWS_SHOWN = 5;
const UNMATCHED_SHOWN = 8;

export function mountEpargneView(root = document) {
  const $ = (id) => root.getElementById(id);
  const el = {
    view: $('view-epargne'),
    add: $('sv-add'),
    exportBtn: $('sv-export'),
    notice: $('sv-notice'),
    noticeText: $('sv-notice-text'),
    undo: $('sv-undo'),
    setup: $('sv-setup'),
    setupFound: $('sv-setup-found'),
    setupForm: $('sv-setup-form'),
    setupRows: $('sv-setup-rows'),
    setupError: $('sv-setup-error'),
    setupMore: $('sv-setup-more'),
    setupCancel: $('sv-setup-cancel'),
    setupRowTemplate: $('sv-setup-row-template'),
    hero: $('sv-hero'),
    heroNote: $('sv-hero-note'),
    ledger: $('sv-ledger'),
    verdict: $('sv-verdict'),
    verdictNote: $('sv-verdict-note'),
    livrets: $('sv-livrets'),
    livretTemplate: $('sv-livret-template'),
    unmatchedCard: $('sv-unmatched-card'),
    unmatched: $('sv-unmatched'),
    board: $('sv-board'),
    boardEdit: $('sv-board-edit'),
    widgets: $('sv-widgets'),
    catalog: $('sv-catalog'),
    catalogList: $('sv-catalog-list'),
    boardBar: $('sv-board-bar'),
    boardStatus: $('sv-board-status'),
    boardCancel: $('sv-board-cancel'),
    boardSave: $('sv-board-save'),
    paramsCard: $('sv-params-card'),
    liveStatus: $('sv-live-status'),
    liveList: $('sv-live-list'),
    liveAuto: $('sv-live-auto'),
    liveRefresh: $('sv-live-refresh'),
    inflationForm: $('sv-inflation-form'),
    inflationError: $('sv-inflation-error'),
    rateBody: $('sv-rate-body'),
    rateMore: $('sv-rate-more'),
    rateForm: $('sv-rate-form'),
    rateError: $('sv-rate-error'),
  };

  const state = {
    today: todayIso(),
    livrets: [],
    profileNames: {},
    activeProfiles: [PROFILES.ME],
    userRates: [],
    rates: mergeRates(),
    inflation: OFFICIAL_INFLATION,
    assign: {},
    candidates: [],
    savingsCategories: new Set(),
    earliest: null,
    flows: new Map(),
    unmatched: [],
    models: [],
    summary: null,
    horizon: 5,
    widgets: DEFAULT_WIDGETS,
    widgetDraft: null, // ordre des widgets pendant « Personnaliser » (rien n'est enregistré avant « Valider »)
    expenses: null,
    setup: null, // 'premier' | 'ajout' | null
    editing: null, // id du livret en cours de modification
    allRates: false,
    allUnmatched: false,
    animate: true,
  };

  const nameOf = (profile) => state.profileNames[profile] ?? profile;
  const activeHolders = () => {
    const set = new Set([...state.activeProfiles.filter((p) => HOLDERS.includes(p)), ...state.livrets.map((l) => l.profile)]);
    return HOLDERS.filter((p) => set.has(p));
  };
  const sameHolders = () => new Set(state.livrets.map((l) => l.profile)).size <= 1;
  const isSolo = () => activeHolders().length <= 1 && sameHolders();
  const titleOf = (livret) => (sameHolders() ? PRODUCTS[livret.product].name : `${PRODUCTS[livret.product].name} · ${nameOf(livret.profile)}`);

  // ——— Données ———————————————————————————————————————————————————

  async function load() {
    state.today = todayIso();
    const recentMonths = [1, 2, 3, 4].map((n) => addMonths(state.today.slice(0, 7), -n));
    const [livrets, categories, names, activeProfiles, userRates, inflation, assign, earliest, widgets, recent, official, auto] = await Promise.all([
      getLivrets(), getCategories({ includeArchived: true }), getProfileNames(), getActiveProfiles(), getSetting('livretRates'),
      getSetting('inflation'), getSetting('livretAssign'), getEarliestMonth(), getSetting('epargneWidgets'),
      Promise.all(recentMonths.map(getTransactionsByMonth)).then((lists) => lists.flat()),
      getSetting('donneesOfficielles'), getSetting('donneesAuto'),
    ]);
    state.livrets = livrets.sort((a, b) => HOLDERS.indexOf(a.profile) - HOLDERS.indexOf(b.profile)
      || Object.keys(PRODUCTS).indexOf(a.product) - Object.keys(PRODUCTS).indexOf(b.product));
    state.profileNames = names ?? {};
    state.activeProfiles = activeProfiles;
    state.userRates = userRates ?? [];
    state.official = official ?? null;
    state.auto = auto ?? true;
    state.ref = referenceData(state.official);
    state.rates = mergeRates(state.userRates, state.official?.livrets?.rates ?? []);
    // Inflation : la mesure la plus récente entre celle de l'INSEE et une saisie ; à mois égal, la saisie l'emporte
    const fetched = state.official?.insee?.inflation;
    if (inflation && (!fetched || inflation.month >= fetched.month)) state.inflation = { ...inflation, source: 'saisie' };
    else if (fetched) state.inflation = { ...fetched, source: 'insee' };
    else state.inflation = { ...OFFICIAL_INFLATION, source: 'app' };
    state.assign = assign ?? {};
    state.earliest = earliest;
    state.savingsCategories = new Set(categories.filter((c) => c.kind === 'epargne').map((c) => c.id));
    state.widgets = (widgets ?? DEFAULT_WIDGETS).filter((id) => widgetById.has(id));
    // Dépenses des titulaires des livrets, pour l'épargne de précaution
    const holders = new Set(state.livrets.map((l) => l.profile));
    state.expenses = monthlyExpenses(recent, categories, holders, state.today.slice(0, 7));
    if (state.expenses && !state.expenses.average) state.expenses = null;

    // Opérations d'épargne, plus celles rattachées à la main quelle que soit leur catégorie
    const byId = new Map();
    for (const id of state.savingsCategories) {
      for (const tx of await getByIndex(STORES.TRANSACTIONS, 'categoryId', id)) byId.set(tx.id, tx);
    }
    for (const id of Object.keys(state.assign)) {
      if (byId.has(id)) continue;
      const tx = await getById(STORES.TRANSACTIONS, id);
      if (tx) byId.set(id, tx);
    }
    state.candidates = [...byId.values()];

    const { byLivret, unmatched } = matchFlows(state.candidates, state.livrets, state.assign, state.savingsCategories);
    state.flows = byLivret;
    state.unmatched = unmatched;
    if (!state.livrets.length && !state.setup) openSetup('premier', false);
    compute();
  }

  function compute() {
    state.models = state.livrets.map((livret) => buildLivretModel({
      livret,
      flows: state.flows.get(livret.id) ?? [],
      rates: state.rates,
      today: state.today,
      inflation: state.inflation.rate,
      horizon: state.horizon,
    }));
    state.summary = summarize(state.models, state.inflation.rate);
    render();
  }

  function render() {
    const has = state.livrets.length > 0;
    el.setup.hidden = !state.setup;
    el.add.hidden = !has || Boolean(state.setup);
    el.exportBtn.hidden = !has;
    for (const card of [el.hero, el.board, el.paramsCard]) card.hidden = !has;
    if (has) {
      renderHero();
      renderBoard();
    }
    renderLivrets();
    renderUnmatched();
    renderParams();
    state.animate = false;
  }

  // ——— Vue d'ensemble —————————————————————————————————————————————

  function renderHero() {
    const { summary, models } = state;
    const inflation = state.inflation.rate;
    el.heroNote.textContent = `Inflation : ${pctOf(inflation)} sur un an (${state.inflation.source === 'saisie' ? 'saisie par vous' : 'INSEE'}, ${monthLong(state.inflation.month)})`;

    // Un tableau à filets : une ligne par livret, le total entre liteaux.
    // La colonne « face à l'inflation » garde la grammaire des longueurs : taux en indigo, inflation en trait.
    const scale = Math.max(inflation, ...models.map((m) => m.rate)) * 1.2 || 1;
    const mark = pct(inflation / scale);
    const cell = (tag, className, ...children) => h(tag, className, ...children);
    const fills = [];
    const railCell = (rate, color) => {
      const rail = h('span', 'sv-rate__rail');
      rail.style.setProperty('--mark', mark);
      if (color) rail.style.setProperty('--c', color);
      const fill = h('span', 'sv-rate__fill');
      fills.push([fill, rate / scale]);
      rail.append(fill, h('span', 'sv-rate__mark'));
      return cell('td', 'sv-ledger__rail', rail);
    };
    const tag = h('span', 'sv-rates__tag', `Inflation ${pctOf(inflation)}`);
    tag.style.setProperty('--mark', mark);
    const head = h('tr', null,
      cell('th', null, 'Livret'), cell('th', 'num', 'Solde'), cell('th', 'num', 'Taux net'),
      cell('th', 'sv-ledger__rail', h('span', 'visually-hidden', 'Taux face à l\'inflation'), h('span', 'sv-ledger__tag', tag)),
      cell('th', 'num', 'Réel'), cell('th', 'num', 'Gain réel sur 12 mois'));
    const rows = models.map((m, i) => {
      const name = cell('th', 'sv-ledger__name', titleOf(state.livrets[i]));
      name.scope = 'row';
      return h('tr', null, name, cell('td', 'num', money(m.balance)), cell('td', 'num', pctOf(m.rate)),
        railCell(m.rate, LIVRET_COLORS[m.product]), cell('td', 'num', realBadge(m.real)), cell('td', 'num', gainBadge(m.next12.gain)));
    });
    const totalName = cell('th', 'sv-ledger__name', 'Total');
    totalName.scope = 'row';
    const foot = h('tr', 'is-total', totalName, cell('td', 'num', money(summary.balance)), cell('td', 'num', pctOf(summary.rate)),
      railCell(summary.rate), cell('td', 'num', realBadge((1 + summary.rate / 100) / (1 + inflation / 100) - 1)),
      cell('td', 'num', gainBadge(summary.realGain)));
    el.ledger.replaceChildren(
      h('caption', 'visually-hidden', 'Vos livrets face à l\'inflation'),
      h('thead', null, head), h('tbody', null, ...rows), h('tfoot', null, foot));
    setWidths(fills, state.animate);

    const { yearlyInterest: interest, yearlyErosion: erosion, realGain: gain } = summary;
    el.verdict.textContent = gain < 0
      ? `Sur un an, ${money(summary.balance)} placés à ${pctOf(summary.rate)} en moyenne rapportent environ ${money(interest)}, mais les prix montent d'environ ${money(erosion)} sur la même somme : en pouvoir d'achat, vos livrets reculent d'environ ${money(-gain)}.`
      : `Sur un an, ${money(summary.balance)} placés à ${pctOf(summary.rate)} en moyenne rapportent environ ${money(interest)}, plus que les ${money(erosion)} de hausse des prix : en pouvoir d'achat, vos livrets gagnent environ ${money(gain)}.`;

    const next = models[0].window.next;
    const notes = [`Si taux et inflation restaient les mêmes pendant un an. Prochaine révision des taux le ${longDate(next)}.`];
    // Conseil factuel : le LEP d'une personne rapporte plus que son Livret A et n'est pas plein
    const indexOf = (product, profile) => state.livrets.findIndex((l) => l.product === product && l.profile === profile);
    const lep = models.find((m, i) => m.product === 'lep' && m.capRoom > 0 && indexOf('livretA', state.livrets[i].profile) >= 0);
    const livretA = lep && models[indexOf('livretA', state.livrets[models.indexOf(lep)].profile)];
    if (lep && livretA && lep.rate > livretA.rate) {
      notes.push(`Le LEP rapporte plus que le Livret A : tant qu'il n'est pas plein (encore ${money(lep.capRoom)}), c'est là qu'un versement rapporte le plus.`);
    }
    el.verdictNote.textContent = notes.join(' ');
  }

  // ——— Cartes des livrets ————————————————————————————————————————

  function renderLivrets() {
    const year = state.today.slice(0, 4);
    const cards = state.livrets.map((livret, i) => {
      const m = state.models[i];
      const node = el.livretTemplate.content.firstElementChild.cloneNode(true);
      const q = (sel) => node.querySelector(sel);
      node.dataset.id = livret.id;
      node.style.setProperty('--c', LIVRET_COLORS[livret.product]);
      q('.js-name').textContent = PRODUCTS[livret.product].name;
      q('.js-owner').textContent = isSolo() ? '' : `Titulaire : ${nameOf(livret.profile)}`;
      q('.js-rate').textContent = pctOf(m.rate);
      q('.js-rate-note').textContent = m.window.since ? `net, depuis le ${longDate(m.window.since)}` : 'net';

      q('.js-balance').textContent = money(m.balance);
      q('.js-balance-note').textContent = livret.anchor.date === state.today
        ? 'solde saisi aujourd\'hui'
        : `estimé aujourd'hui · ${moneyExact(livret.anchor.balance)} saisis le ${longDate(livret.anchor.date)}`;

      // Plafond : le rail se remplit avec le solde
      const full = m.capRoom === 0;
      q('.js-cap-text').textContent = full
        ? 'Plafond atteint : seuls les intérêts le font encore grandir'
        : `Encore ${money(m.capRoom)} de versements possibles`;
      q('.js-cap-figures').innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = money(m.balance);
      q('.js-cap-figures').append(strong, ` / plafond ${money(m.cap)}`);
      setWidths([[q('.js-cap-fill'), m.balance / m.cap]], state.animate);

      q('.js-interest-title').textContent = `Intérêts ${year}`;
      q('.js-interest').textContent = `≈ ${money(m.interestYear)}`;
      q('.js-interest-note').textContent = `versés le 31 décembre · ${money(m.interestEarned)} déjà acquis`;
      q('.js-real').replaceChildren(realBadge(m.real, ' / an'));

      // Ce que rapportent les intérêts une fois la hausse des prix déduite
      const n = m.next12;
      q('.js-calc-interest-label').textContent = `Intérêts à ${pctOf(m.rate)}`;
      q('.js-calc-interest').textContent = signedMoney(n.interest);
      q('.js-calc-erosion-label').textContent = `Hausse des prix à ${pctOf(state.inflation.rate)}`;
      q('.js-calc-erosion').textContent = signedMoney(-n.erosion);
      q('.js-calc-gain').replaceChildren(gainBadge(n.gain));
      q('.js-calc-note').textContent = n.gain < 0
        ? `Dans un an, vous aurez ${money(n.interest)} de plus sur ce livret, mais il faudra ${money(n.erosion)} de plus pour acheter ce que ${money(m.balance)} achètent aujourd'hui.`
        : `Dans un an, les ${money(n.interest)} d'intérêts couvrent la hausse des prix (${money(n.erosion)}) : le livret gagne en pouvoir d'achat.`;
      q('.js-plan').textContent = m.plan.monthly > 0 ? `${money(m.plan.monthly)} / mois` : 'Aucun';
      // Les virements réguliers repérés, un par un : montant, jour, et pourquoi il est compté
      const items = m.plan.items.map((item) => `${money(item.amount)} le ${item.day} (${item.reason ?? item.label})`);
      q('.js-plan-note').textContent = {
        reglage: m.plan.monthly > 0 ? `le ${m.plan.day} du mois, réglé par vous` : 'réglé par vous',
        releves: `${items.length > 1 ? `${items.length} virements réguliers : ` : 'virement régulier : '}${items.join(', ')}`,
        aucun: 'aucun virement régulier repéré dans les relevés',
      }[m.plan.source] + (m.plan.monthly > 0 && m.capRoom < m.plan.monthly * 12 ? ' ; jusqu\'au plafond' : '');

      const warning = q('.js-warning');
      warning.hidden = !m.inconsistent;
      if (m.inconsistent) {
        warning.textContent = `Le solde saisi est plus bas que ce que donnent les virements repérés depuis ${m.startYear} : il manque sans doute un retrait, ou un virement est rattaché à tort. Vérifiez les mouvements ci-dessous.`;
      }

      renderMoves(node, livret);
      setupEditForm(node, livret);
      return node;
    });
    el.livrets.replaceChildren(...cards);
    el.livrets.hidden = !cards.length;
  }

  function renderMoves(node, livret) {
    const flows = [...(state.flows.get(livret.id) ?? [])].reverse();
    const title = node.querySelector('.js-moves-title');
    const list = node.querySelector('.js-moves');
    title.textContent = flows.length
      ? `${flows.length} mouvement${flows.length > 1 ? 's' : ''} repéré${flows.length > 1 ? 's' : ''} dans vos relevés`
      : 'Aucun mouvement repéré dans vos relevés';

    const intro = document.createElement('li');
    intro.className = 'sv-moves__intro';
    const words = livretKeywords(livret).map((w) => `« ${w} »`).join(', ');
    const ownerPart = isSolo() ? '' : ` de ${nameOf(livret.profile)}`;
    intro.textContent = (state.earliest ? `Relevés importés depuis ${monthLong(state.earliest)}. ` : 'Aucun relevé importé pour l\'instant. ')
      + `Sont comptés les virements d'épargne${ownerPart} qui contiennent ${words}, et ceux que vous rattachez.`;

    list.replaceChildren(intro, ...flows.map((f) => {
      const li = document.createElement('li');
      li.className = 'sv-move';
      const date = document.createElement('span');
      date.className = 'sv-move__date';
      date.textContent = dateShort.format(asDate(f.date)).replace('.', '');
      const label = document.createElement('span');
      label.className = 'sv-move__label';
      label.textContent = f.label;
      if (f.manual) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.dataset.kind = 'learned';
        badge.textContent = 'rattaché';
        label.append(' ', badge);
      }
      const amount = document.createElement('span');
      amount.className = 'sv-move__amount';
      amount.dataset.sign = f.amount > 0 ? 'in' : 'out';
      amount.textContent = `${f.amount > 0 ? '+' : '−'}${moneyExact(Math.abs(f.amount))}`;
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'link-btn sv-move__action';
      action.textContent = 'Pas ce livret';
      action.setAttribute('aria-label', `${f.label}, ${dateLong.format(asDate(f.date))} : ne pas compter sur le ${PRODUCTS[livret.product].name}`);
      action.addEventListener('click', () => assignTo(f.id, 'aucun', `Mouvement retiré du ${PRODUCTS[livret.product].name}.`));
      li.append(date, label, amount, action);
      return li;
    }));
  }

  function setupEditForm(node, livret) {
    const form = node.querySelector('.js-edit');
    const tools = node.querySelector('.js-tools');
    const error = node.querySelector('.js-edit-error');
    const editing = state.editing === livret.id;
    form.hidden = !editing;
    tools.hidden = editing;
    fillHolders(form.elements.profile, livret.profile);

    const open = () => {
      state.editing = livret.id;
      render();
      el.livrets.querySelector(`[data-id="${livret.id}"] input[name="balance"]`)?.focus();
    };
    node.querySelector('.js-edit-btn').addEventListener('click', open);
    node.querySelector('.js-cancel').addEventListener('click', () => { state.editing = null; render(); });
    node.querySelector('.js-delete').addEventListener('click', () => removeLivret(livret));

    if (!editing) return;
    const model = state.models[state.livrets.indexOf(livret)];
    form.elements.balance.value = decimal.format(model.balance / 100);
    form.elements.date.value = state.today;
    form.elements.date.max = state.today;
    form.elements.plan.value = livret.monthlyPlan == null ? '' : decimal.format(livret.monthlyPlan / 100);
    form.elements.keywords.value = livret.keywords?.length ? livret.keywords.join(', ') : PRODUCTS[livret.product].keywords.join(', ');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.hidden = true;
      try {
        const balance = parseEuros(form.elements.balance.value, 'Indiquez le solde affiché par la banque.');
        const date = form.elements.date.value;
        if (!date || date > state.today) throw new Error('Choisissez une date passée ou aujourd\'hui.');
        const planText = form.elements.plan.value.trim();
        const monthlyPlan = planText === '' ? null : parseEuros(planText, 'Versement mensuel invalide.');
        const profile = form.elements.profile.value;
        if (state.livrets.some((l) => l.id !== livret.id && l.product === livret.product && l.profile === profile)) {
          throw new Error(`${nameOf(profile)} a déjà un ${PRODUCTS[livret.product].name} suivi ici.`);
        }
        const keywords = form.elements.keywords.value.split(',').map((w) => w.trim()).filter(Boolean);
        const defaults = PRODUCTS[livret.product].keywords;
        const sameAsDefault = keywords.map(normalizeLabel).join('|') === defaults.map(normalizeLabel).join('|');
        await saveLivret({
          ...livret, profile, monthlyPlan, anchor: { date, balance }, keywords: sameAsDefault ? [] : keywords,
        });
        state.editing = null;
        showNotice(`${PRODUCTS[livret.product].name} mis à jour.`);
        await load();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
  }

  async function removeLivret(livret) {
    const name = PRODUCTS[livret.product].name;
    const ownerPart = isSolo() ? '' : ` de ${nameOf(livret.profile)}`;
    if (!window.confirm(`Ne plus suivre le ${name}${ownerPart} ? Le solde saisi et les rattachements sont oubliés ; vos opérations, elles, restent.`)) return;
    await deleteLivret(livret.id);
    const assign = Object.fromEntries(Object.entries(state.assign).filter(([, v]) => v !== livret.id));
    await setSetting('livretAssign', assign);
    state.editing = null;
    showNotice(`Le ${name} n'est plus suivi.`);
    await load();
  }

  // ——— Virements à rattacher ——————————————————————————————————————

  function renderUnmatched() {
    const list = state.livrets.length ? state.unmatched : [];
    el.unmatchedCard.hidden = !list.length;
    if (!list.length) return;
    const shown = state.allUnmatched ? list : list.slice(0, UNMATCHED_SHOWN);

    const items = shown.map((tx) => {
      const li = document.createElement('li');
      li.className = 'sv-move sv-move--assign';
      const date = document.createElement('span');
      date.className = 'sv-move__date';
      date.textContent = dateShort.format(asDate(tx.date)).replace('.', '');
      const label = document.createElement('span');
      label.className = 'sv-move__label';
      label.textContent = tx.note || tx.label;
      const meta = document.createElement('small');
      const moveType = tx.type === 'sortie' ? 'versement' : 'retrait';
      meta.textContent = isSolo() ? moveType : `${nameOf(tx.profile)} · ${moveType}`;
      label.append(meta);
      const amount = document.createElement('span');
      amount.className = 'sv-move__amount';
      amount.textContent = moneyExact(tx.amount);
      const actions = document.createElement('span');
      actions.className = 'sv-move__actions';
      const owners = state.livrets.filter((l) => l.profile === tx.profile);
      for (const livret of owners.length ? owners : state.livrets) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link-btn';
        b.textContent = titleOf(livret);
        b.setAttribute('aria-label', `${tx.note || tx.label} : rattacher au ${titleOf(livret)}`);
        b.addEventListener('click', () => assignTo(tx.id, livret.id, `Virement rattaché au ${titleOf(livret)}.`));
        actions.append(b);
      }
      const other = document.createElement('button');
      other.type = 'button';
      other.className = 'link-btn';
      other.textContent = 'Autre placement';
      other.setAttribute('aria-label', `${tx.note || tx.label} : autre placement, pas un livret`);
      other.addEventListener('click', () => assignTo(tx.id, 'aucun', 'Virement classé hors livrets.'));
      actions.append(other);
      li.append(date, label, amount, actions);
      return li;
    });

    if (list.length > shown.length) {
      const li = document.createElement('li');
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'link-btn';
      more.textContent = `Afficher les ${list.length - shown.length} autres`;
      more.addEventListener('click', () => { state.allUnmatched = true; renderUnmatched(); });
      li.append(more);
      items.push(li);
    }
    el.unmatched.replaceChildren(...items);
  }

  /** Rattache (ou détache) une opération, avec possibilité d'annuler. */
  async function assignTo(txId, target, message) {
    const previous = state.assign[txId];
    const write = async (value) => {
      const assign = { ...state.assign };
      if (value == null) delete assign[txId]; else assign[txId] = value;
      await setSetting('livretAssign', assign);
      await load();
    };
    await write(target);
    showNotice(message, () => write(previous));
  }

  // ——— Tableau de bord (widgets) ——————————————————————————————————

  const widgetContext = () => ({
    models: state.models,
    livrets: state.livrets,
    summary: state.summary,
    inflation: state.inflation,
    rates: state.rates,
    titleOf: (i) => titleOf(state.livrets[i]),
    horizon: state.horizon,
    setHorizon(n) {
      state.horizon = n;
      state.animate = true;
      compute();
    },
    expenses: state.expenses,
    holders: isSolo() ? '' : [...new Set(state.livrets.map((l) => nameOf(l.profile)))].join(' et '),
    animate: state.animate,
    today: state.today,
    ref: state.ref,
    official: state.official,
  });

  function renderBoard() {
    const editing = state.widgetDraft != null;
    const order = editing ? state.widgetDraft : state.widgets;
    const ctx = widgetContext();
    el.board.classList.toggle('is-editing', editing);
    el.boardEdit.hidden = editing;
    el.boardBar.hidden = !editing;
    el.catalog.hidden = !editing;

    el.widgets.replaceChildren(...order.map((id, index) => {
      const widget = widgetById.get(id);
      const titleId = `sv-w-${id}`;
      const head = h('header', 'card__head card__head--row',
        h('div', null, h('h3', 'sv-widget__title', widget.title), h('p', 'card__hint', widget.hint(ctx))));
      head.querySelector('h3').id = titleId;
      if (widget.control && !editing) head.append(widget.control(ctx));
      const card = h('article', `card sv-widget${widget.wide ? ' is-wide' : ''}`, head);
      card.setAttribute('aria-labelledby', titleId);
      card.dataset.widget = id;
      if (editing) {
        card.append(h('div', 'sv-widget__tools',
          toolButton('Monter', `Monter « ${widget.title} »`, index === 0, () => moveWidget(index, -1)),
          toolButton('Descendre', `Descendre « ${widget.title} »`, index === order.length - 1, () => moveWidget(index, 1)),
          toolButton('Retirer', `Retirer « ${widget.title} » du tableau de bord`, false, () => {
            state.widgetDraft = order.filter((w) => w !== id);
            renderBoard();
          })));
      } else {
        const body = h('div', 'sv-widget__body');
        card.append(body);
        widget.render(body, ctx);
      }
      return card;
    }));
    if (!order.length) el.widgets.append(h('p', 'card__empty', 'Aucun widget : ajoutez-en depuis la liste ci-dessous.'));

    if (editing) {
      const absent = WIDGETS.filter((w) => !order.includes(w.id));
      el.catalogList.replaceChildren(...absent.map((w) => {
        const add = h('button', 'btn btn--ghost btn--small', 'Ajouter');
        add.type = 'button';
        add.setAttribute('aria-label', `Ajouter « ${w.title} »`);
        add.addEventListener('click', () => {
          state.widgetDraft = [...order, w.id];
          renderBoard();
        });
        return h('li', 'sv-catalog__item', h('span', null, h('strong', null, w.title), h('small', null, w.description)), add);
      }));
      if (!absent.length) el.catalogList.replaceChildren(h('li', 'card__empty', 'Tous les widgets sont déjà sur le tableau de bord.'));
      const changed = order.join() !== state.widgets.join();
      el.boardStatus.textContent = changed ? `${order.length} widget${order.length > 1 ? 's' : ''} · modifications non enregistrées` : 'Aucune modification pour l\'instant.';
      el.boardSave.disabled = !changed;
    }
  }

  function toolButton(text, label, disabled, onClick) {
    const b = h('button', 'link-btn', text);
    b.type = 'button';
    b.disabled = disabled;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }

  function moveWidget(index, delta) {
    const order = [...state.widgetDraft];
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    state.widgetDraft = order;
    renderBoard();
    el.widgets.children[index + delta]?.querySelector('.link-btn:not(:disabled)')?.focus();
  }

  // ——— Export Excel —————————————————————————————————————————————————

  /** Dépenses des titulaires sur les 12 derniers mois, par catégorie (feuille « Dépenses par mois »). */
  async function spendingByMonth() {
    const months = Array.from({ length: 12 }, (_, i) => addMonths(state.today.slice(0, 7), -11 + i));
    const [categories, lists] = await Promise.all([getCategories({ includeArchived: true }), Promise.all(months.map(getTransactionsByMonth))]);
    const kinds = new Map(categories.map((c) => [c.id, c.kind]));
    const holders = new Set(state.livrets.map((l) => l.profile));
    const byMonth = new Map();
    const used = new Map();
    months.forEach((month, i) => {
      const spent = lists[i].filter((t) => t.type === 'sortie' && holders.has(t.profile) && !OFF_BUDGET_KINDS.includes(kinds.get(t.categoryId)));
      if (!spent.length) return;
      const map = new Map();
      for (const t of spent) {
        map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
        used.set(t.categoryId, (used.get(t.categoryId) ?? 0) + t.amount);
      }
      byMonth.set(month, map);
    });
    const ordered = categories.filter((c) => used.has(c.id)).sort((a, b) => used.get(b.id) - used.get(a.id));
    return { months: months.filter((m) => byMonth.has(m)), categories: ordered, byMonth };
  }

  el.exportBtn.addEventListener('click', async () => {
    el.exportBtn.disabled = true;
    el.exportBtn.textContent = 'Préparation…';
    try {
      const projection = state.livrets.map((livret) => buildLivretModel({
        livret, flows: state.flows.get(livret.id) ?? [], rates: state.rates, today: state.today, inflation: state.inflation.rate, horizon: 10,
      }));
      const ctx = { ...widgetContext(), names: state.profileNames };
      const workbook = buildEpargneWorkbook(ctx, { flows: state.flows, projection, spending: await spendingByMonth() });
      download(new File([workbook.toBlob()], `mon-budget-epargne-${state.today}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      showNotice('Classeur Excel prêt : il est dans vos téléchargements.');
    } catch (err) {
      console.error('[export] Échec :', err);
      showNotice('L\'export n\'a pas abouti. Réessayez, ou rechargez la page.');
    } finally {
      el.exportBtn.disabled = false;
      el.exportBtn.textContent = 'Exporter en Excel';
    }
  });

  el.boardEdit.addEventListener('click', () => {
    state.widgetDraft = [...state.widgets];
    renderBoard();
    el.board.scrollIntoView({ block: 'start' });
  });
  el.boardCancel.addEventListener('click', () => {
    state.widgetDraft = null;
    renderBoard();
    el.boardEdit.focus();
  });
  el.boardSave.addEventListener('click', async () => {
    await setSetting('epargneWidgets', state.widgetDraft);
    state.widgets = state.widgetDraft;
    state.widgetDraft = null;
    state.animate = true;
    renderBoard();
    state.animate = false;
    showNotice('Tableau de bord enregistré.');
  });

  // ——— Taux et inflation ——————————————————————————————————————————

  // ——— Données publiques mises à jour automatiquement ———————————————

  async function refreshPublicData() {
    state.refreshing = true;
    renderLive();
    try {
      const data = await refreshOfficialData(state.official);
      await setSetting('donneesOfficielles', data);
      const failed = Object.keys(data.errors).length;
      if (failed) showNotice(`Données publiques mises à jour, sauf ${failed} source${failed > 1 ? 's' : ''} : les dernières valeurs connues sont gardées.`);
    } finally {
      state.refreshing = false;
      await load();
    }
  }

  const dateTime = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function renderLive() {
    const o = state.official;
    el.liveAuto.checked = state.auto;
    el.liveRefresh.disabled = state.refreshing;
    el.liveRefresh.textContent = state.refreshing ? 'Mise à jour…' : 'Actualiser maintenant';
    el.liveStatus.textContent = state.refreshing
      ? 'Lecture des sources officielles…'
      : o?.fetchedAt
        ? `Mis à jour le ${dateTime.format(new Date(o.fetchedAt))}. L'app lit seulement ces séries publiques : aucune de vos données n'est envoyée.`
        : state.auto
          ? 'Pas encore mis à jour : les valeurs livrées avec l\'app sont utilisées en attendant.'
          : 'Mise à jour automatique désactivée : les valeurs livrées avec l\'app ou saisies par vous sont utilisées.';

    const row = (label, value, source, error) => {
      const li = h('li', 'sv-live__item', h('span', 'sv-live__label', label));
      const val = h('span', 'sv-live__value', error ? 'indisponible' : value);
      if (error) val.title = error;
      const src = source ? h('a', 'sv-live__source', source.name) : h('span', 'sv-live__source', '—');
      if (source) { src.href = source.url; src.target = '_blank'; src.rel = 'noopener noreferrer'; }
      li.append(val, src);
      if (error) li.append(h('small', 'sv-live__error', `${error} : dernières valeurs connues conservées.`));
      return li;
    };
    const errors = o?.errors ?? {};
    const insee = o?.insee;
    const estr = o?.estr;
    const liv = o?.livrets;
    const latestRate = (product) => [...state.rates].reverse().find((r) => r[product] != null && r.from <= state.today);
    const a = latestRate('livretA');
    const l = latestRate('lep');
    el.liveList.replaceChildren(
      row('Inflation sur un an (IPC)', insee ? `${pctOf(insee.inflation.rate)} · ${monthLong(insee.inflation.month)}` : '—', insee ? SOURCES.insee : null, errors.insee),
      row('IPCH · sous-jacente', insee ? `${pctOf(insee.indices.ipch)} · ${pctOf(insee.indices.core)}` : '—', insee ? SOURCES.insee : null, errors.insee),
      row('Taux du marché monétaire (€STR)', estr ? `${estr.rate.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} % · ${longDate(estr.date)}` : '—', estr ? SOURCES.bce : null, errors.bce),
      row('Livret A · LEP', `${pctOf(a?.livretA ?? 0)} · ${pctOf(l?.lep ?? 0)}${liv ? ` (depuis le ${longDate(a.from > l.from ? a.from : l.from)})` : ''}`,
        liv ? SOURCES[liv.source] : null, errors.livrets),
    );
  }

  el.liveRefresh.addEventListener('click', () => { if (!state.refreshing) refreshPublicData(); });
  el.liveAuto.addEventListener('change', async () => {
    await setSetting('donneesAuto', el.liveAuto.checked);
    state.auto = el.liveAuto.checked;
    if (state.auto && isStale(state.official)) refreshPublicData(); else renderLive();
  });

  function renderParams() {
    renderLive();
    const form = el.inflationForm;
    if (document.activeElement?.form !== form) {
      form.elements.rate.value = decimal.format(state.inflation.rate);
      const months = [];
      for (let i = 1; i <= 13; i++) months.push(addMonths(state.today.slice(0, 7), -i));
      if (!months.includes(state.inflation.month)) months.push(state.inflation.month);
      form.elements.month.replaceChildren(...months.sort().reverse().map((m) => new Option(monthLong(m), m)));
      form.elements.month.value = state.inflation.month;
    }

    const rows = [...state.rates].reverse();
    const shown = state.allRates ? rows : rows.slice(0, RATE_ROWS_SHOWN);
    el.rateBody.replaceChildren(...shown.map((r) => {
      const tr = document.createElement('tr');
      const future = r.from > state.today;
      tr.classList.toggle('is-future', future);
      const date = document.createElement('th');
      date.scope = 'row';
      date.textContent = longDate(r.from);
      const cells = ['livretA', 'lep'].map((p) => {
        const td = document.createElement('td');
        td.className = 'num';
        td.textContent = r[p] == null ? '—' : pctOf(r[p]);
        return td;
      });
      const origin = document.createElement('td');
      origin.className = 'sv-rate-table__origin';
      if (future) {
        const key = document.createElement('i');
        key.className = 'key key--upcoming';
        key.setAttribute('aria-hidden', 'true');
        origin.append(key, ' hypothèse');
      } else if (r.source === 'saisi') {
        origin.append('saisi par vous');
      } else if (r.source === 'auto') {
        origin.append('officiel, mis à jour');
      }
      if (r.source === 'saisi') {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'link-btn';
        del.textContent = 'Supprimer';
        del.setAttribute('aria-label', `Supprimer le taux du ${longDate(r.from)}`);
        del.addEventListener('click', async () => {
          await setSetting('livretRates', state.userRates.filter((u) => u.from !== r.from));
          await load();
        });
        origin.append(' ', del);
      }
      tr.append(date, ...cells, origin);
      return tr;
    }));
    el.rateMore.hidden = rows.length <= RATE_ROWS_SHOWN;
    el.rateMore.textContent = state.allRates ? 'Afficher seulement les derniers taux' : `Voir tout l'historique (${rows.length} taux)`;
  }

  el.rateMore.addEventListener('click', () => { state.allRates = !state.allRates; renderParams(); });

  el.inflationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.inflationError.hidden = true;
    const rate = parsePercent(el.inflationForm.elements.rate.value);
    if (rate == null || rate < -5 || rate > 30) {
      el.inflationError.textContent = 'Indiquez l\'inflation en %, par exemple 3,1.';
      el.inflationError.hidden = false;
      return;
    }
    await setSetting('inflation', { rate, month: el.inflationForm.elements.month.value });
    el.inflationForm.elements.rate.blur();
    showNotice('Inflation mise à jour : les calculs en tiennent compte.');
    await load();
  });

  el.rateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.rateError.hidden = true;
    const f = el.rateForm.elements;
    const from = f.from.value;
    const livretA = parsePercent(f.livretA.value);
    const lep = parsePercent(f.lep.value);
    const invalid = (v) => v != null && (v < 0 || v > 20);
    let message = null;
    if (!from) message = 'Choisissez la date d\'effet.';
    else if (livretA == null && lep == null) message = 'Indiquez au moins un taux.';
    else if (invalid(livretA) || invalid(lep)) message = 'Un taux s\'écrit en %, par exemple 1,7.';
    if (message) {
      el.rateError.textContent = message;
      el.rateError.hidden = false;
      return;
    }
    const entry = { from };
    if (livretA != null) entry.livretA = livretA;
    if (lep != null) entry.lep = lep;
    await setSetting('livretRates', [...state.userRates.filter((u) => u.from !== from), entry]);
    el.rateForm.reset();
    showNotice(from > state.today ? 'Taux ajouté comme hypothèse pour la projection.' : 'Taux ajouté au barème.');
    await load();
  });

  // ——— Premier lancement / ajout d'un livret ——————————————————————

  function openSetup(mode, focus = true) {
    state.setup = mode;
    const holders = activeHolders();
    const taken = new Set(state.livrets.map((l) => `${l.product}:${l.profile}`));
    const free = holders.flatMap((p) => Object.keys(PRODUCTS).map((product) => ({ product, profile: p })))
      .filter((c) => !taken.has(`${c.product}:${c.profile}`));
    const initial = mode === 'premier' ? free.filter((c) => c.profile === PROFILES.ME) : (free.length ? free.slice(0, 1) : [{ product: 'livretA', profile: PROFILES.ME }]);
    el.setupRows.replaceChildren(...initial.map(setupRow));
    el.setupCancel.hidden = mode === 'premier';
    el.setupError.hidden = true;
    el.setupMore.hidden = free.length <= initial.length;

    const found = state.candidates.filter((tx) => state.savingsCategories.has(tx.categoryId)
      && Object.values(PRODUCTS).some((p) => p.keywords.some((w) => ` ${normalizeLabel(tx.label)} `.includes(` ${normalizeLabel(w)} `))));
    el.setupFound.textContent = found.length
      ? `${found.length} virement${found.length > 1 ? 's' : ''} vers un Livret A ou un LEP repéré${found.length > 1 ? 's' : ''} dans vos relevés importés.`
      : state.earliest ? '' : 'Pas encore de relevé importé : le suivi part du solde saisi, et les virements s\'ajouteront à chaque import.';
    render();
    if (focus) el.setupRows.querySelector('input[name="balance"]')?.focus();
  }

  function setupRow({ product, profile }) {
    const node = el.setupRowTemplate.content.firstElementChild.cloneNode(true);
    node.elements.product.value = product;
    fillHolders(node.elements.profile, profile);
    node.elements.date.value = state.today;
    node.elements.date.max = state.today;
    node.querySelector('.js-remove').addEventListener('click', () => {
      if (el.setupRows.children.length > 1) node.remove();
    });
    return node;
  }

  el.add.addEventListener('click', () => openSetup('ajout'));
  el.setupCancel.addEventListener('click', () => { state.setup = null; render(); });
  el.setupMore.addEventListener('click', () => {
    const holders = activeHolders();
    const used = new Set([...state.livrets.map((l) => `${l.product}:${l.profile}`),
      ...[...el.setupRows.children].map((r) => `${r.elements.product.value}:${r.elements.profile.value}`)]);
    const next = holders.flatMap((p) => Object.keys(PRODUCTS).map((product) => ({ product, profile: p })))
      .find((c) => !used.has(`${c.product}:${c.profile}`)) ?? { product: 'livretA', profile: holders[0] };
    const row = setupRow(next);
    el.setupRows.append(row);
    row.elements.balance.focus();
  });

  el.setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.setupError.hidden = true;
    try {
      const seen = new Set(state.livrets.map((l) => `${l.product}:${l.profile}`));
      const inputs = [...el.setupRows.children].map((row) => {
        const f = row.elements;
        const product = f.product.value;
        const profile = f.profile.value;
        const key = `${product}:${profile}`;
        if (seen.has(key)) throw new Error(`Ce ${PRODUCTS[product].name} est déjà suivi : une seule ligne par livret.`);
        seen.add(key);
        const balance = parseEuros(f.balance.value, `Indiquez le solde du ${PRODUCTS[product].name}.`);
        if (!f.date.value || f.date.value > state.today) throw new Error('La date du solde doit être passée ou aujourd\'hui.');
        return { product, profile, anchor: { date: f.date.value, balance } };
      });
      for (const input of inputs) await saveLivret(input);
      state.setup = null;
      state.animate = true;
      showNotice(inputs.length > 1 ? 'Livrets ajoutés.' : 'Livret ajouté.');
      await load();
    } catch (err) {
      el.setupError.textContent = err.message;
      el.setupError.hidden = false;
    }
  });

  // ——— Outils ————————————————————————————————————————————————————

  function fillHolders(select, value) {
    const holders = activeHolders();
    const choices = holders.includes(value) ? holders : [...holders, value];
    select.replaceChildren(...choices.map((p) => new Option(nameOf(p), p)));
    select.value = value;
    const wrap = select.closest('label');
    if (wrap) wrap.hidden = choices.length <= 1;
  }

  let noticeTimer = null;
  function showNotice(text, undo = null) {
    clearTimeout(noticeTimer);
    el.noticeText.textContent = text;
    el.undo.hidden = !undo;
    el.undo.onclick = undo ? async () => { el.notice.hidden = true; await undo(); } : null;
    el.notice.hidden = false;
    noticeTimer = setTimeout(() => { el.notice.hidden = true; }, undo ? 8000 : 4000);
  }

  window.addEventListener(DATA_CHANGED, () => { if (!el.view.hidden) load(); });

  return {
    async show() {
      state.animate = true;
      await load();
      // Données publiques : une mise à jour par ouverture de l'écran au plus, si elles datent de plus de 12 h
      if (state.auto && isStale(state.official) && !state.refreshing) refreshPublicData();
    },
  };
}

// ——— Utilitaires ————————————————————————————————————————————————

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function parseEuros(text, message) {
  if (!text.trim()) throw new Error(message);
  let cents;
  try { cents = toCents(text); } catch { throw new Error(message); }
  if (cents < 0) throw new Error(message);
  return cents;
}

function parsePercent(text) {
  const s = text.replace(/[\s%]/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
