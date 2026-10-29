/**
 * Tableau de bord du mois : la barre du mois (reste à vivre), le tableau
 * « Catégories & enveloppes », l'évolution sur 6 mois, la répartition,
 * les principaux commerçants, les échéances mensualisées et les opérations.
 * Les calculs sont dans month-model.js ; ce module lit la base et dessine.
 */
import { PROFILES } from '../db/schema.js';
import { DEFAULT_PROFILE_NAMES } from '../db/seed.js';
import {
  DATA_CHANGED, HOUSEHOLD, deleteBudget, deleteTransaction, getActiveProfiles, getBudgets, getById, getCategories,
  getLatestMonth, getLivrets, getProfileNames, getSetting, getTransactionsByMonth, notifyDataChanged, put, remove,
  saveRules, saveTransaction, setActiveProfiles, setBudget, setSetting, toCents,
} from '../db/database.js';
import { merchantKey } from '../import/categorizer.js';
import {
  ALL_PROFILES, TREND_MONTHS, addMonths, buildMonthModel, displayLabel, skipKey,
} from './month-model.js';
import { renderDonut } from './donut.js';
import { matchFlows } from '../epargne/livret-model.js';
import { PRODUCTS } from '../epargne/livret-rates.js';
import { buildFullWorkbook } from '../epargne/export.js';
import { download } from '../backup/backup-core.js';

const euro0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euro2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const minus = (s) => s.replace('-', '−');
const money = (cents) => minus(euro0.format(Math.round(cents / 100)));
const moneyExact = (cents) => minus(euro2.format(cents / 100));
const percentFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const monthTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const formatMonth = (month) => monthTitle.format(asDate(`${month}-01`));

const ICONS = {
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  attention: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 16.8v.2"/>',
  depasse: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16v.2"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
};
const icon = (name, size = 15) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const STATUS_LABELS = { ok: 'Dans l\'enveloppe', attention: 'Bientôt atteinte', depasse: 'Dépassée' };

export function mountDashboard(root = document) {
  const $ = (id) => root.getElementById(id);
  const el = {
    title: $('dash-month'),
    prev: $('dash-prev'),
    next: $('dash-next'),
    today: $('dash-today'),
    profiles: $('dash-view'),
    exportBtn: $('dash-export'),
    hero: root.querySelector('.hero'),
    heroValue: $('hero-value'),
    heroNote: $('hero-note'),
    bar: $('month-bar'),
    segs: {
      spent: root.querySelector('.monthbar__seg--spent'), upcoming: root.querySelector('.monthbar__seg--upcoming'),
      saved: root.querySelector('.monthbar__seg--saved'), free: $('month-free'), over: root.querySelector('.monthbar__seg--over'),
    },
    eq: {
      income: $('eq-income'), spent: $('eq-spent'), upcoming: $('eq-upcoming'), free: $('eq-free'),
      saved: $('eq-saved'), savedLabel: $('eq-saved-label'), savedSign: $('eq-saved-sign'), savedTerm: $('eq-saved-term'),
      upcomingSign: $('eq-upcoming-sign'), upcomingTerm: $('eq-upcoming-term'),
      expected: $('eq-expected'), expectedSign: $('eq-expected-sign'), expectedTerm: $('eq-expected-term'),
    },
    empty: $('dash-empty'),
    emptyText: $('dash-empty-text'),
    latest: $('dash-latest'),
    catsCard: $('cats-card'),
    catsHint: $('cats-hint'),
    catsBody: $('cats-body'),
    catsEmpty: $('cats-empty'),
    compareHead: $('cats-compare-head'),
    envEdit: $('env-edit'),
    envBar: $('env-bar'),
    envTotal: $('env-total'),
    envSuggest: $('env-suggest'),
    envCancel: $('env-cancel'),
    envSave: $('env-save'),
    grid: $('dash-grid'),
    trend: $('trend'),
    trendTitle: $('trend-title'),
    trendHint: $('trend-hint'),
    trendClear: $('trend-clear'),
    trendReadout: $('trend-readout'),
    donut: {
      figure: $('donut'), segments: $('donut-segments'), value: $('donut-value'),
      label: $('donut-label'), legend: $('split-legend'),
    },
    split: $('split'),
    splitHint: $('split-hint'),
    splitEmpty: $('split-empty'),
    merchants: $('merchants'),
    merchantsEmpty: $('merchants-empty'),
    dueCard: $('due-upcoming-group').closest('.card'),
    dueUpcomingGroup: $('due-upcoming-group'),
    dueUpcomingTitle: $('due-upcoming-title'),
    dueUpcoming: $('due-upcoming'),
    dueMissingGroup: $('due-missing-group'),
    dueMissingHint: $('due-missing-hint'),
    dueMissing: $('due-missing'),
    dueEmpty: $('due-empty'),
    duePassedGroup: $('due-passed-group'),
    duePassedTitle: $('due-passed-title'),
    duePassed: $('due-passed'),
    dueSkippedGroup: $('due-skipped-group'),
    dueSkippedTitle: $('due-skipped-title'),
    dueSkipped: $('due-skipped'),
    opsCard: $('ops-card'),
    opsNotice: $('ops-notice'),
    opsNoticeText: $('ops-notice-text'),
    opsUndo: $('ops-undo'),
    opEditTemplate: $('op-edit-template'),
    opsHint: $('ops-hint'),
    opsEdit: $('ops-edit'),
    opsEditBar: $('ops-edit-bar'),
    opsEditStatus: $('ops-edit-status'),
    opsLearn: $('ops-learn'),
    opsLearnWrap: $('ops-learn-wrap'),
    opsCancel: $('ops-cancel'),
    opsSave: $('ops-save'),
    fQ: $('f-q'),
    fType: $('f-type'),
    fCat: $('f-cat'),
    fProfile: $('f-profile'),
    fProfileWrap: $('f-profile-wrap'),
    fRecurring: $('f-recurring'),
    fReset: $('f-reset'),
    opsCount: $('ops-count'),
    ops: $('ops-done'),
    opTemplate: $('op-template'),
  };

  const state = {
    month: todayIso().slice(0, 7),
    profile: PROFILES.ME,
    userSelectedProfile: false,
    profileNames: {},
    activeProfiles: [PROFILES.ME],
    categories: [],
    budgets: [],
    skips: [],
    model: null,
    selected: null, // catégorie mise en avant (évolution + opérations)
    editing: false, // réglage des enveloppes en cours
    filters: emptyFilters(),
    editOps: false, // mode édition de la liste des opérations
    drafts: new Map(), // modifications en attente de « Valider », par opération
    toDelete: new Set(),
    undo: null, // états précédents, pour « Annuler » après validation
    livrets: [], // livrets suivis dans l'écran « Épargne »
    assign: {}, // rattachements faits à la main : opération → livret ou 'aucun'
    destinations: new Map(), // opération d'épargne → livret (rattachement ou libellé)
    detected: new Map(), // opération d'épargne → livret d'après le seul libellé
    loadId: 0,
  };
  const categoryOf = (id) => state.categories.find((c) => c.id === id);
  const isSolo = () => state.activeProfiles.length <= 1;

  /* Chargement */

  async function load({ animate = true } = {}) {
    const loadId = ++state.loadId;
    const pastMonths = Array.from({ length: TREND_MONTHS - 1 }, (_, i) => addMonths(state.month, -(i + 1)));
    const [categories, budgets, transactions, past, names, activeProfiles, skips, livrets, assign] = await Promise.all([
      getCategories(),
      getBudgets(),
      getTransactionsByMonth(state.month),
      Promise.all(pastMonths.map(getTransactionsByMonth)).then((lists) => lists.flat()),
      getProfileNames(),
      getActiveProfiles(),
      getSetting('recurringSkips'),
      getLivrets(),
      getSetting('livretAssign'),
    ]);
    if (loadId !== state.loadId) return; // un chargement plus récent est parti entre-temps

    Object.assign(state, {
      categories,
      budgets,
      profileNames: names,
      activeProfiles,
      skips: skips ?? [],
      livrets,
      assign: assign ?? {},
    });
    if (!state.userSelectedProfile) {
      state.profile = activeProfiles.length > 1 ? ALL_PROFILES : activeProfiles[0];
    } else if (state.profile === ALL_PROFILES && activeProfiles.length <= 1) {
      state.profile = activeProfiles[0];
    } else if (state.profile !== ALL_PROFILES && !activeProfiles.includes(state.profile)) {
      state.profile = activeProfiles.length > 1 ? ALL_PROFILES : activeProfiles[0];
    }
    // Vers quel livret va chaque ligne d'épargne du mois
    const savings = new Set(categories.filter((c) => c.kind === 'epargne').map((c) => c.id));
    const destinationsOf = (links) => new Map([...matchFlows(transactions, livrets, links, savings).byLivret]
      .flatMap(([livretId, flows]) => flows.map((f) => [f.id, livretId])));
    state.destinations = destinationsOf(state.assign);
    state.detected = destinationsOf({});
    state.model = buildMonthModel({
      month: state.month,
      today: todayIso(),
      profile: state.profile,
      transactions,
      past,
      categories,
      budgets,
      skips: new Set(state.skips),
    });
    if (state.selected && !state.model.categories.some((r) => r.category.id === state.selected)) state.selected = null;
    if (state.filters.categories && !state.model.operations.some((t) => state.filters.categories.includes(t.categoryId))) {
      state.filters.categories = null;
      state.selected = null;
    }
    render(animate);
    if (state.model.isEmpty) showLatestMonthHint();
  }

  function render(animate) {
    const m = state.model;
    el.title.textContent = formatMonth(m.month);
    el.today.hidden = m.month === todayIso().slice(0, 7);
    renderProfiles();
    renderHero(m, animate);
    renderCategories(m, animate);
    renderTrend(m, animate);
    renderSplit(m);
    renderMerchants(m, animate);
    renderDue(m);
    renderFilters(m);
    renderOperations(m);
  }

  /* Sélecteur de vue */

  function renderProfiles() {
    const options = [
      ...(state.activeProfiles.length > 1 ? [[ALL_PROFILES, 'Tous']] : []),
      ...state.activeProfiles.map((p) => [p, state.profileNames[p] ?? DEFAULT_PROFILE_NAMES[p]]),
    ];
    const addable = [
      ...(!state.activeProfiles.includes(PROFILES.PARTNER) ? [[PROFILES.PARTNER, '+ Profil', 'Ajouter un second profil']] : []),
      ...(!state.activeProfiles.includes(PROFILES.SHARED) ? [[PROFILES.SHARED, '+ Compte commun', 'Ajouter un compte commun']] : []),
    ];
    const signature = `${options.map((o) => o.join(':')).join('|')}//${addable.map((a) => a[0]).join(',')}`;
    if (el.profiles.dataset.signature !== signature) {
      el.profiles.dataset.signature = signature;
      el.profiles.querySelectorAll('label, .seg-add').forEach((n) => n.remove());
      for (const [value, name] of options) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'dash-profile';
        input.value = value;
        const span = document.createElement('span');
        span.textContent = name;
        if (value !== ALL_PROFILES) label.title = 'Double-cliquez pour changer ce nom';
        label.append(input, span);
        if (value === PROFILES.PARTNER || value === PROFILES.SHARED) {
          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'seg-remove';
          rm.dataset.removeProfile = value;
          rm.title = `Retirer « ${name} » de l'affichage`;
          rm.setAttribute('aria-label', `Retirer ${name}`);
          rm.textContent = '×';
          label.append(rm);
        }
        el.profiles.append(label);
      }
      for (const [profile, text, title] of addable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seg-add';
        btn.dataset.addProfile = profile;
        btn.title = title;
        btn.textContent = text;
        el.profiles.append(btn);
      }
    }
    const radio = el.profiles.querySelector(`input[value="${state.profile}"]`);
    if (radio) radio.checked = true;
  }

  /* Noms des profils : double-clic sur un nom du sélecteur */

  function startRename(label) {
    const profile = label.querySelector('input').value;
    if (profile === ALL_PROFILES || label.querySelector('.seg-input')) return;
    const span = label.querySelector('span');
    const before = state.profileNames[profile] ?? DEFAULT_PROFILE_NAMES[profile];
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'seg-input';
    input.value = before;
    input.maxLength = 24;
    input.size = Math.max(before.length, 4);
    input.setAttribute('aria-label', `Nouveau nom pour « ${before} » (Entrée pour valider, Échap pour annuler)`);
    span.hidden = true;
    label.append(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      const others = Object.values(PROFILES).filter((p) => p !== profile)
        .map((p) => (state.profileNames[p] ?? DEFAULT_PROFILE_NAMES[p]).toLowerCase());
      input.remove();
      span.hidden = false;
      if (!save || !name || name === before || others.includes(name.toLowerCase())) return;
      span.textContent = name;
      await setSetting('profileNames', { ...DEFAULT_PROFILE_NAMES, ...state.profileNames, [profile]: name });
      notifyDataChanged(); // tableau de bord et écran d'import se mettent à jour
    };
    input.addEventListener('input', () => { input.size = Math.max(input.value.length, 4); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      e.stopPropagation(); // les flèches ne doivent pas changer de vue pendant la saisie
    });
    input.addEventListener('blur', () => finish(true));
  }

  el.profiles.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-add-profile]');
    if (addBtn) {
      const added = addBtn.dataset.addProfile;
      await setActiveProfiles([...state.activeProfiles, added]);
      state.userSelectedProfile = true;
      state.profile = ALL_PROFILES;
      notifyDataChanged();
      if (added === PROFILES.PARTNER) {
        requestAnimationFrame(() => {
          const label = el.profiles.querySelector(`input[value="${PROFILES.PARTNER}"]`)?.closest('label');
          if (label) startRename(label);
        });
      }
      return;
    }
    const rmBtn = e.target.closest('[data-remove-profile]');
    if (rmBtn) {
      e.preventDefault();
      e.stopPropagation();
      const removed = rmBtn.dataset.removeProfile;
      const next = state.activeProfiles.filter((p) => p !== removed);
      await setActiveProfiles(next);
      if (state.profile === removed || next.length <= 1) {
        state.profile = next.length > 1 ? ALL_PROFILES : next[0];
      }
      notifyDataChanged();
    }
  });

  el.profiles.addEventListener('dblclick', (e) => {
    const label = e.target.closest('label');
    if (label && !e.target.closest('.seg-remove')) startRename(label);
  });
  // Équivalent clavier : F2 sur la vue sélectionnée
  el.profiles.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && e.target.matches('input[type="radio"]')) startRename(e.target.closest('label'));
  });

  const profileName = (p) => (p === ALL_PROFILES ? 'l\'ensemble des comptes' : state.profileNames[p] ?? p);

  /* La barre du mois */

  function renderHero(m, animate) {
    const empty = m.isEmpty && !m.upcoming.length;
    const hasEnvelopes = m.categories.some((r) => r.limit != null);
    el.hero.classList.toggle('is-empty', empty);
    el.empty.hidden = !empty;
    el.catsCard.hidden = empty && !hasEnvelopes && !state.editing;
    el.grid.hidden = empty;
    el.opsCard.hidden = empty;
    el.hero.dataset.tone = m.remaining < 0 ? 'negative' : 'positive';
    el.heroValue.textContent = empty ? '' : money(m.remaining);

    if (empty) {
      el.heroNote.textContent = '';
      const suffix = isSolo() || state.profile === ALL_PROFILES ? '' : ` pour ${profileName(state.profile)}`;
      el.emptyText.textContent = `Aucune opération en ${formatMonth(m.month)}${suffix}. Importez le relevé du mois pour voir votre reste à vivre.`;
      return;
    }

    el.heroNote.textContent = heroNote(m);
    // Rentrées attendues et sommes reprises sur l'épargne s'ajoutent aux ressources du mois
    const resources = m.income + m.upcomingIncome + Math.max(-m.saved, 0);
    const saved = Math.max(m.saved, 0);
    const used = m.spent + m.upcomingTotal + saved;
    const scale = Math.max(resources, used, 1);
    const over = used > resources;
    // En dépassement, la barre s'étend au-delà des revenus : le repère marque leur fin
    let room = resources;
    const take = (amount) => { const w = over ? Math.max(Math.min(amount, room), 0) : amount; room -= w; return w; };
    const spentW = take(m.spent);
    const upcomingW = take(m.upcomingTotal);
    const savedW = take(saved);
    const freeW = over ? 0 : m.remaining;
    const overW = over ? used - resources : 0;
    el.bar.dataset.over = String(over);
    el.bar.style.setProperty('--mark', pct(resources / scale));
    setWidths([
      [el.segs.spent, spentW / scale], [el.segs.upcoming, upcomingW / scale], [el.segs.saved, savedW / scale],
      [el.segs.free, freeW / scale], [el.segs.over, overW / scale],
    ], animate);
    state.freeRatio = freeW / scale;
    placeHeroValue();

    el.eq.income.textContent = money(m.income);
    el.eq.spent.textContent = money(m.spent);
    el.eq.upcoming.textContent = money(m.upcomingTotal);
    el.eq.upcomingSign.hidden = el.eq.upcomingTerm.hidden = m.upcomingTotal === 0;
    el.eq.expectedSign.hidden = el.eq.expectedTerm.hidden = m.upcomingIncome === 0;
    el.eq.expected.textContent = money(m.upcomingIncome);
    el.eq.savedSign.hidden = el.eq.savedTerm.hidden = m.saved === 0;
    el.eq.savedSign.textContent = m.saved > 0 ? '−' : '+';
    el.eq.saved.textContent = money(Math.abs(m.saved));
    el.eq.savedLabel.textContent = m.saved > 0 ? 'épargnés' : 'repris sur l\'épargne';
    el.eq.free.textContent = over ? `dépassement de ${money(-m.remaining)}` : `${money(m.remaining)} libres`;
  }

  /** Le montant se pose dans la partie libre quand elle est assez large, sinon juste sous la barre. */
  function placeHeroValue() {
    const value = el.heroValue;
    if (value.parentElement !== el.hero) el.bar.after(value);
    const room = el.bar.clientWidth * (state.freeRatio ?? 0);
    if (room >= value.offsetWidth + 32) el.segs.free.append(value);
  }

  new ResizeObserver(() => {
    if (state.model && !el.hero.classList.contains('is-empty')) placeHeroValue();
  }).observe(el.bar);

  function heroNote(m) {
    const parts = [];
    if (m.remaining < 0 && m.income > 0) parts.push('Le mois dépasse vos revenus');
    if (m.income === 0) parts.push('Aucun revenu enregistré ce mois-ci');
    if (m.status === 'en-cours') {
      if (m.asOf && m.asOf < todayIso()) parts.push(`Relevés importés jusqu'au ${dayMonth.format(asDate(m.asOf))}`);
      const end = new Date(Date.UTC(+m.month.slice(0, 4), +m.month.slice(5, 7), 0)).getUTCDate();
      const left = end - Number(todayIso().slice(8, 10)) + 1;
      parts.push(left > 1 ? `${left} jours jusqu'à la fin du mois` : 'Dernier jour du mois');
    } else if (m.status === 'passe') {
      parts.push('Mois terminé');
    } else {
      parts.push('Prévision : seules les échéances mensualisées sont comptées');
    }
    return parts.join(' · ');
  }

  /* Catégories et enveloppes */

  function renderCategories(m, animate) {
    const scope = isSolo() ? '' : state.profile === ALL_PROFILES ? ' (total)' : ` (${profileName(state.profile)})`;
    el.catsHint.textContent = state.editing
      ? `Enveloppes mensuelles${scope}, en euros. Laissez vide pour ne pas fixer d'enveloppe.`
      : 'Choisissez une catégorie pour voir son évolution et ses opérations.';
    el.compareHead.textContent = m.averageMonths
      ? `Par rapport à la moyenne (${m.averageMonths} mois)`
      : 'Par rapport à la moyenne';
    el.envEdit.hidden = state.editing;
    el.envBar.hidden = !state.editing;
    el.catsCard.classList.toggle('is-editing', state.editing);

    // En réglage, toutes les catégories de dépense sont proposées
    let rows = m.categories;
    if (state.editing) {
      const shown = new Set(rows.map((r) => r.category.id));
      rows = [...rows, ...state.categories
        .filter((c) => c.kind === 'sortie' && !shown.has(c.id))
        .map((category) => ({ category, spent: 0, upcoming: 0, previous: 0, average: null, limit: null, ratio: null, status: null }))];
    }
    el.catsEmpty.hidden = rows.length > 0;

    const widths = [];
    el.catsBody.replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.category = r.category.id;
      tr.classList.toggle('is-selected', state.selected === r.category.id && !state.editing);

      const th = document.createElement('th');
      th.scope = 'row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cat-btn';
      button.disabled = state.editing;
      button.setAttribute('aria-pressed', String(state.selected === r.category.id));
      button.innerHTML = '<span class="icon" aria-hidden="true"></span><span class="name"></span>';
      button.querySelector('.icon').textContent = r.category.icon ?? '';
      button.querySelector('.name').textContent = r.category.name;
      th.append(button);

      const amount = document.createElement('td');
      amount.className = 'num';
      amount.innerHTML = '<span class="amount"></span>';
      amount.querySelector('.amount').textContent = money(r.spent);
      if (r.upcoming) amount.append(small(`+ ${money(r.upcoming)} à venir`));

      const compare = document.createElement('td');
      compare.className = 'num cats__compare';
      compare.append(...compareCell(r, m));

      const env = document.createElement('td');
      env.className = 'cats__env';
      env.append(state.editing ? envInput(r) : envCell(r, widths));

      tr.append(th, amount, compare, env);
      return tr;
    }));
    setWidths(widths, animate);
    if (state.editing) updateEnvelopeTotal();
  }

  /**
   * « ▲ +129 € » au-dessus de la moyenne, « ▼ −20 € » en dessous, « ≈ » si l'écart est faible.
   * On compare ce qui est passé + ce qui est encore à venir, pour ne pas
   * voir une baisse trompeuse en milieu de mois.
   */
  function compareCell(r, m) {
    if (!m.averageMonths || r.average == null) {
      const none = document.createElement('span');
      none.className = 'delta';
      none.dataset.trend = 'none';
      none.textContent = 'pas d\'historique';
      return [none];
    }
    const delta = r.spent + r.upcoming - r.average;
    const flat = Math.abs(delta) < Math.max(500, r.average * 0.05);
    const trend = flat ? 'flat' : delta > 0 ? 'up' : 'down';
    const span = document.createElement('span');
    span.className = 'delta';
    span.dataset.trend = trend;
    if (flat) span.textContent = '≈ comme d\'habitude';
    else {
      span.innerHTML = icon(trend, 13);
      span.append(` ${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`);
    }
    span.title = `Ce mois, à venir compris : ${money(r.spent + r.upcoming)} · mois dernier : ${money(r.previous)} · moyenne ${m.averageMonths} mois : ${money(r.average)}`;
    return [span, small(`moy. ${money(r.average)}`)];
  }

  function envCell(r, widths) {
    if (r.limit == null) {
      const none = document.createElement('span');
      none.className = 'env__none';
      none.textContent = 'Pas d\'enveloppe';
      return none;
    }
    const wrap = document.createElement('div');
    wrap.className = 'env';
    // L'à-venir qui fait passer l'enveloppe au-delà de sa limite compte comme un dépassement
    const projectedOver = r.status !== 'depasse' && r.spent + r.upcoming > r.limit ? r.spent + r.upcoming - r.limit : 0;
    wrap.dataset.status = projectedOver ? 'depasse' : r.status ?? 'none';

    const meter = document.createElement('div');
    meter.className = 'meter';
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', `Enveloppe ${r.category.name}`);
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', String(r.limit / 100));
    meter.setAttribute('aria-valuenow', String(r.spent / 100));
    meter.setAttribute('aria-valuetext', `${money(r.spent)} sur ${money(r.limit)}`);
    const fill = document.createElement('span');
    fill.className = 'meter__fill';
    const upcoming = document.createElement('span');
    upcoming.className = 'meter__upcoming';
    meter.append(fill, upcoming);
    const scale = Math.max(r.limit, r.spent + r.upcoming);
    widths.push([fill, r.spent / scale], [upcoming, r.upcoming / scale]);

    const line = document.createElement('div');
    line.className = 'env__line';
    const status = document.createElement('span');
    status.className = 'status';
    if (projectedOver) {
      status.innerHTML = icon('depasse');
      status.append(`Dépassée de ${money(projectedOver)} avec l'à-venir`);
    } else if (r.status) {
      status.innerHTML = icon(r.status);
      status.append(r.status === 'depasse'
        ? `Dépassée de ${money(r.spent - r.limit)}`
        : r.spent === r.limit ? 'Atteinte' : `${STATUS_LABELS[r.status]} · ${percentFormat.format(r.ratio)}`);
    } else {
      status.textContent = 'Aucune dépense';
    }
    const figures = document.createElement('span');
    figures.className = 'env__figures';
    figures.innerHTML = r.spent < r.limit ? 'reste <strong></strong>' : 'sur <strong></strong>';
    figures.querySelector('strong').textContent = money(r.spent < r.limit ? r.limit - r.spent : r.limit);
    line.append(status, figures);

    wrap.append(meter, line);
    return wrap;
  }

  function envInput(r) {
    const label = document.createElement('label');
    label.className = 'env-input';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.className = 'js-envelope';
    input.dataset.category = r.category.id;
    input.dataset.average = String(r.average ?? '');
    // Valeur propre à la vue (ou globale en mode solo) : c'est elle qu'on enregistre
    const own = state.budgets.find((b) => b.categoryId === r.category.id && b.profile === budgetScope())
      ?? (isSolo() ? state.budgets.find((b) => b.categoryId === r.category.id && b.profile === HOUSEHOLD) : null);
    input.value = own ? String(own.monthlyLimit / 100).replace('.', ',') : '';
    input.placeholder = r.average ? `≈ ${roundUp(r.average) / 100}` : '';
    input.setAttribute('aria-label', `Enveloppe mensuelle ${r.category.name}, en euros`);
    label.append(input, '€ / mois');
    return label;
  }

  const budgetScope = () => (state.profile === ALL_PROFILES ? HOUSEHOLD : state.profile);
  const roundUp = (cents) => Math.ceil(cents / 1000) * 1000; // à la dizaine d'euros supérieure

  function readEnvelopes() {
    const values = new Map();
    let valid = true;
    for (const input of el.catsBody.querySelectorAll('.js-envelope')) {
      const raw = input.value.trim();
      let cents = null;
      if (raw !== '') {
        try { cents = toCents(raw); } catch { cents = -1; }
      }
      const bad = cents != null && cents <= 0;
      if (bad) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      if (bad) valid = false;
      values.set(input.dataset.category, cents);
    }
    return { values, valid };
  }

  function updateEnvelopeTotal() {
    const { values } = readEnvelopes();
    const total = [...values.values()].reduce((s, v) => s + (v > 0 ? v : 0), 0);
    el.envTotal.innerHTML = 'Total des enveloppes : <strong></strong> · revenus du mois : <strong></strong>';
    const [t, i] = el.envTotal.querySelectorAll('strong');
    t.textContent = money(total);
    i.textContent = money(state.model.income);
  }

  el.envEdit.addEventListener('click', () => {
    state.editing = true;
    state.selected = null;
    renderCategories(state.model, false);
    el.catsBody.querySelector('.js-envelope')?.focus();
  });

  el.envCancel.addEventListener('click', () => {
    state.editing = false;
    render(false);
    el.envEdit.focus();
  });

  el.envSuggest.addEventListener('click', () => {
    // Ne remplit que les enveloppes vides : celles déjà fixées restent telles quelles
    for (const input of el.catsBody.querySelectorAll('.js-envelope')) {
      const average = Number(input.dataset.average);
      if (average > 0 && !input.value.trim()) input.value = String(roundUp(average) / 100);
    }
    updateEnvelopeTotal();
  });

  el.catsBody.addEventListener('input', (e) => {
    if (e.target.matches('.js-envelope')) updateEnvelopeTotal();
  });

  el.catsBody.addEventListener('keydown', (e) => {
    if (!e.target.matches('.js-envelope')) return;
    if (e.key === 'Enter') el.envSave.click();
    if (e.key === 'Escape') el.envCancel.click();
  });

  el.envSave.addEventListener('click', async () => {
    const { values, valid } = readEnvelopes();
    if (!valid) {
      el.catsBody.querySelector('[aria-invalid]')?.focus();
      return;
    }
    const scope = budgetScope();
    el.envSave.disabled = true;
    try {
      for (const [categoryId, cents] of values) {
        const existing = state.budgets.find((b) => b.categoryId === categoryId && b.profile === scope);
        const fallback = isSolo() ? state.budgets.find((b) => b.categoryId === categoryId && b.profile === HOUSEHOLD) : null;
        if (cents == null) {
          if (existing) await deleteBudget(existing.id);
          if (fallback) await deleteBudget(fallback.id);
        } else if (cents !== (existing ?? fallback)?.monthlyLimit) {
          await setBudget({ categoryId, profile: scope, monthlyLimit: cents });
        }
      }
    } finally {
      el.envSave.disabled = false;
    }
    state.editing = false;
    await load();
    el.envEdit.focus();
  });

  el.catsBody.addEventListener('click', (e) => {
    const button = e.target.closest('.cat-btn');
    if (!button) return;
    const id = button.closest('tr').dataset.category;
    filterCategories(state.selected === id ? null : [id]);
  });

  /* Évolution sur 6 mois */

  function renderTrend(m, animate) {
    const selected = state.selected ? m.categories.find((r) => r.category.id === state.selected) : null;
    const values = m.trend.map((t) => ({
      ...t,
      value: selected ? t.byCategory.get(selected.category.id) ?? 0 : t.total,
    }));
    const limit = selected ? selected.limit
      : m.categories.some((r) => r.limit != null) ? m.categories.reduce((s, r) => s + (r.limit ?? 0), 0) : null;

    el.trendTitle.textContent = selected ? `Évolution · ${selected.category.name}` : 'Évolution sur 6 mois';
    // L'enveloppe est nommée dans l'aide : une étiquette sur le trait chevauchait les montants
    el.trendHint.textContent = (selected
      ? 'Dépenses de cette catégorie, mois par mois.'
      : 'Toutes les dépenses du mois, hors épargne.')
      + (limit != null ? ` Trait : enveloppe de ${money(limit)}.` : '');
    el.trendClear.hidden = !selected;
    if (selected) {
      el.trendClear.textContent = selected.category.name;
      el.trendClear.setAttribute('aria-label', `Revenir à toutes les catégories (${selected.category.name})`);
    }

    const max = Math.max(1, limit ?? 0, ...values.map((v) => v.value)) * 1.12;
    const current = values.length - 1;
    const activeIdx = state.trendIdx ?? current;
    const maxIndex = values.reduce((best, v, i) => (v.imported && v.value > values[best].value ? i : best), 0);
    const heights = [];
    const cols = values.map((v, i) => {
      const col = document.createElement('button');
      col.type = 'button';
      col.className = 'trend__col';
      col.dataset.idx = String(i);
      col.setAttribute('role', 'listitem');
      col.classList.toggle('is-current', i === current);
      col.classList.toggle('is-selected', i === activeIdx);
      col.classList.toggle('is-max', i === maxIndex && i !== current && v.value > 0);
      const label = `${formatMonth(v.month)} : ${v.imported ? money(v.value) : 'relevé non importé'}`;
      col.setAttribute('aria-label', label);
      col.dataset.readout = label + (v.imported && limit != null ? ` · enveloppe ${money(limit)}` : '');
      if (v.imported) {
        const bar = document.createElement('span');
        bar.className = 'trend__bar';
        const value = document.createElement('span');
        value.className = 'trend__value';
        value.textContent = money(v.value);
        col.append(value, bar);
        heights.push([col, v.value / max]);
      } else {
        const missing = document.createElement('span');
        missing.className = 'trend__missing';
        missing.textContent = 'non importé';
        col.append(missing);
      }
      return col;
    });

    const nodes = [...cols];
    if (limit != null) {
      const line = document.createElement('span');
      line.className = 'trend__limit';
      line.style.setProperty('--hr', String(Math.min(1, limit / max)));
      line.setAttribute('aria-hidden', 'true');
      nodes.push(line);
    }
    el.trend.replaceChildren(...nodes);

    const labels = document.createElement('div');
    labels.className = 'trend__labels';
    labels.setAttribute('aria-hidden', 'true');
    labels.append(...values.map((v, i) => {
      const s = document.createElement('span');
      s.textContent = monthShort.format(asDate(`${v.month}-01`)).replace('.', '');
      s.classList.toggle('is-current', i === current);
      return s;
    }));
    if (el.trend.nextElementSibling?.classList.contains('trend__labels')) el.trend.nextElementSibling.remove();
    el.trend.after(labels);
    el.trendReadout.textContent = cols[activeIdx]?.dataset.readout ?? '';

    if (animate) {
      for (const [col] of heights) col.style.setProperty('--h', '0%');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const [col, ratio] of heights) col.style.setProperty('--h', pct(ratio));
      }));
    } else {
      for (const [col, ratio] of heights) col.style.setProperty('--h', pct(ratio));
    }
  }

  const selectTrendCol = (e) => {
    const col = e.target.closest('.trend__col');
    if (!col) return;
    state.trendIdx = Number(col.dataset.idx);
    el.trend.querySelectorAll('.trend__col').forEach((n) => n.classList.toggle('is-selected', n === col));
    el.trendReadout.textContent = col.dataset.readout;
  };
  el.trend.addEventListener('click', selectTrendCol);
  el.trend.addEventListener('focusin', selectTrendCol);
  el.trendClear.addEventListener('click', () => filterCategories(null));

  /* Répartition */

  function renderSplit(m) {
    el.split.hidden = !m.breakdown.length;
    el.splitEmpty.hidden = m.breakdown.length > 0;
    if (!m.breakdown.length) return;
    const slices = m.breakdown.map((r, i) => {
      const category = r.categoryId ? categoryOf(r.categoryId) : null;
      return {
        name: category?.name ?? `Autres (${r.count})`,
        icon: category?.icon ?? '',
        amount: r.amount,
        share: r.share,
        color: category ? `var(--series-${i + 1})` : 'var(--series-other)',
        ids: category ? [category.id] : r.ids,
      };
    });
    el.splitHint.textContent = 'La part de chaque catégorie dans les dépenses du mois.';
    renderDonut(el.donut, slices, {
      total: money(m.spent),
      totalLabel: 'dépensés',
      format: money,
      onSelect: (i) => filterCategories(slices[i].ids, { scroll: true }),
    });
  }

  /* Principaux commerçants */

  function renderMerchants(m, animate) {
    el.merchantsEmpty.hidden = m.merchants.length > 0;
    const max = m.merchants[0]?.amount ?? 1;
    const widths = [];
    el.merchants.replaceChildren(...m.merchants.map((g) => {
      const li = document.createElement('li');
      li.innerHTML = '<div class="line"><span class="icon" aria-hidden="true"></span><span class="name"></span><span class="amount"></span></div><div class="rail" aria-hidden="true"><span></span></div>';
      const name = li.querySelector('.name');
      name.textContent = displayLabel(g.label).name;
      if (g.count > 1) {
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = ` · ${g.count} passages`;
        name.append(count);
      }
      li.querySelector('.icon').textContent = categoryOf(g.categoryId)?.icon ?? '';
      li.querySelector('.amount').textContent = money(g.amount);
      widths.push([li.querySelector('.rail span'), g.amount / max]);
      return li;
    }));
    setWidths(widths, animate);
  }

  /* Échéances mensualisées */

  function renderDue(m) {
    el.dueUpcomingGroup.hidden = !m.upcoming.length;
    el.dueUpcomingTitle.textContent = 'À venir';
    el.dueUpcoming.replaceChildren(...m.upcoming.map((u) => dueRow(u, 'a-venir')));

    el.dueMissingGroup.hidden = !m.missing.length;
    el.dueMissingHint.textContent = m.status === 'passe'
      ? 'Absentes du relevé de ce mois. Elles ne sont pas déduites du reste à vivre.'
      : `Leur date est passée mais elles n'apparaissent pas dans vos relevés${m.asOf ? ` (importés jusqu'au ${dayMonth.format(asDate(m.asOf))})` : ''}. Elles ne sont pas déduites du reste à vivre.`;
    el.dueMissing.replaceChildren(...m.missing.map((u) => dueRow(u, 'non-retrouvee')));

    el.duePassedGroup.hidden = !m.recurringPassed.length;
    el.duePassedTitle.textContent = `Déjà passées ce mois-ci (${m.recurringPassed.length})`;
    el.duePassed.replaceChildren(...m.recurringPassed.map((u) => dueRow(u, 'passee')));

    el.dueSkippedGroup.hidden = !m.recurringSkipped.length;
    el.dueSkippedTitle.textContent = `Ignorées ce mois-ci (${m.recurringSkipped.length})`;
    el.dueSkipped.replaceChildren(...m.recurringSkipped.map((u) => dueRow(u, 'ignoree')));

    el.dueEmpty.hidden = m.upcoming.length + m.missing.length + m.recurringPassed.length + m.recurringSkipped.length > 0;
  }

  /** kind : 'a-venir', 'non-retrouvee', 'passee' (retrouvée dans le mois) ou 'ignoree'. */
  function dueRow(u, kind) {
    const li = document.createElement('li');
    li.dataset.key = u.key;
    li.dataset.source = u.sourceId;
    li.dataset.type = u.type;
    li.innerHTML = '<span class="due__date"></span><span class="due__name"></span><span class="due__amount"></span><span class="due__actions"></span>';
    const shown = kind === 'passee' ? u.matched : u;
    li.querySelector('.due__date').textContent = dayMonth.format(asDate(kind === 'passee' ? u.matched.date : u.expectedDate));
    const { name } = displayLabel(u.label);
    const nameEl = li.querySelector('.due__name');
    nameEl.textContent = name;
    nameEl.title = kind === 'passee'
      ? `Mensualisée le ${dayMonth.format(asDate(u.lastSeen))}, retrouvée ce mois-ci : ${u.matched.label}`
      : `${u.label} (dernière fois le ${dayMonth.format(asDate(u.lastSeen))})`;
    li.querySelector('.due__amount').textContent = `${u.type === 'entree' ? '+' : '−'}${moneyExact(shown.amount)}`;
    const actions = li.querySelector('.due__actions');
    if (kind === 'a-venir' || kind === 'non-retrouvee') {
      actions.append(linkButton('Pas ce mois-ci', 'js-skip', `Ignorer ${name} pour ce mois`));
    }
    if (kind === 'non-retrouvee' || kind === 'ignoree') {
      actions.append(linkButton('Ne plus mensualiser', 'js-stop', `Ne plus mensualiser ${name}`));
    }
    if (kind === 'ignoree') actions.prepend(linkButton('Rétablir', 'js-unskip', `Compter de nouveau ${name} ce mois-ci`));
    if (kind === 'passee') {
      const note = document.createElement('span');
      note.className = 'due__note';
      note.textContent = u.matched.amount === u.amount
        ? 'passée ce mois-ci'
        : `passée ce mois-ci (attendue à ${moneyExact(u.amount)})`;
      actions.append(note);
    }
    return li;
  }

  el.dueCard.addEventListener('click', async (e) => {
    const button = e.target.closest('.js-skip, .js-unskip, .js-stop');
    if (!button) return;
    const li = button.closest('li');
    button.disabled = true;
    if (button.matches('.js-skip, .js-unskip')) {
      const skips = new Set(state.skips);
      const key = skipKey(state.month, li.dataset.key);
      if (button.matches('.js-skip')) skips.add(key);
      else skips.delete(key);
      await setSetting('recurringSkips', [...skips]);
    } else {
      const record = await getById('transactions', li.dataset.source);
      if (record) await saveTransaction({ ...record, recurring: false });
    }
    await load({ animate: false });
  });

  /* Opérations : filtres */

  const TYPE_FILTERS = {
    depenses: (t) => t.type === 'sortie' && !t.offBudget,
    rentrees: (t) => t.type === 'entree' && !t.offBudget,
    epargne: (t) => categoryOf(t.categoryId)?.kind === 'epargne',
  };

  function filteredOperations(m) {
    const f = state.filters;
    const q = normalize(f.q);
    return m.operations.filter((t) => (!f.type || TYPE_FILTERS[f.type](t))
      && (!f.categories || f.categories.includes(t.categoryId))
      && (!f.profile || t.profile === f.profile)
      && (!f.recurring || t.recurring)
      && (!q || normalize(`${t.label} ${t.note ?? ''} ${opName(t)}`).includes(q)));
  }

  const isFiltered = () => {
    const f = state.filters;
    return Boolean(f.q || f.type || f.categories || f.profile || f.recurring);
  };

  function renderFilters(m) {
    const f = state.filters;
    el.fQ.value = f.q;
    el.fType.value = f.type;
    el.fRecurring.checked = f.recurring;

    // Catégories présentes ce mois-ci (+ celle filtrée, + « Autres » de l'anneau)
    const present = new Set(m.operations.map((t) => t.categoryId));
    const options = [new Option('Toutes les catégories', '')];
    if (f.categories?.length > 1) options.push(new Option(`Autres (${f.categories.length} catégories)`, '__group'));
    options.push(...state.categories
      .filter((c) => present.has(c.id) || f.categories?.includes(c.id))
      .map((c) => new Option(`${c.icon ?? ''} ${c.name}`.trim(), c.id)));
    el.fCat.replaceChildren(...options);
    el.fCat.value = !f.categories ? '' : f.categories.length > 1 ? '__group' : f.categories[0];

    el.fProfileWrap.hidden = state.profile !== ALL_PROFILES || isSolo();
    el.fProfile.replaceChildren(new Option('Tous les profils', ''),
      ...state.activeProfiles.map((p) => new Option(state.profileNames[p] ?? p, p)));
    el.fProfile.value = f.profile;
    el.fReset.hidden = !isFiltered();
  }

  /** Point d'entrée commun : tableau, anneau, barre du mois et menu « Catégorie ». */
  function filterCategories(ids, { scroll = false } = {}) {
    state.filters.categories = ids?.length ? ids : null;
    state.selected = ids?.length === 1 ? ids[0] : null;
    el.catsBody.querySelectorAll('tr').forEach((tr) => {
      const on = tr.dataset.category === state.selected;
      tr.classList.toggle('is-selected', on);
      tr.querySelector('.cat-btn').setAttribute('aria-pressed', String(on));
    });
    renderTrend(state.model, true);
    renderFilters(state.model);
    renderOperations(state.model);
    if (scroll) showOperations();
  }

  function filterType(type) {
    state.filters = { ...emptyFilters(), type };
    filterCategories(null, { scroll: true });
  }

  // Barre du mois : chaque partie mène aux opérations correspondantes
  const SEGMENT_ACTIONS = [
    ['spent', 'Voir les dépenses du mois', () => filterType('depenses')],
    ['over', 'Voir les dépenses du mois', () => filterType('depenses')],
    ['saved', 'Voir l\'épargne du mois', () => filterType('epargne')],
    ['upcoming', 'Voir les échéances à venir', () => {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.dueCard.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }],
  ];
  for (const [key, label, action] of SEGMENT_ACTIONS) {
    const seg = el.segs[key];
    seg.setAttribute('role', 'button');
    seg.tabIndex = 0;
    seg.setAttribute('aria-label', label);
    seg.title = label;
    seg.classList.add('is-action');
    seg.addEventListener('click', action);
    seg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); }
    });
  }

  function showOperations() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.opsCard.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  el.fQ.addEventListener('input', () => { state.filters.q = el.fQ.value; renderOperations(state.model); el.fReset.hidden = !isFiltered(); });
  el.fType.addEventListener('change', () => { state.filters.type = el.fType.value; renderOperations(state.model); el.fReset.hidden = !isFiltered(); });
  el.fProfile.addEventListener('change', () => { state.filters.profile = el.fProfile.value; renderOperations(state.model); el.fReset.hidden = !isFiltered(); });
  el.fRecurring.addEventListener('change', () => { state.filters.recurring = el.fRecurring.checked; renderOperations(state.model); el.fReset.hidden = !isFiltered(); });
  el.fCat.addEventListener('change', () => {
    if (el.fCat.value === '__group') return;
    filterCategories(el.fCat.value ? [el.fCat.value] : null);
  });
  el.fReset.addEventListener('click', () => {
    state.filters = emptyFilters();
    filterCategories(null);
    el.fQ.focus();
  });

  /* Opérations : liste */

  const opName = (t) => t.note?.trim() || displayLabel(t.label).name;

  function renderOperations(m) {
    const ops = filteredOperations(m);
    const net = ops.reduce((s, t) => s + (t.type === 'entree' ? t.amount : -t.amount), 0);
    el.opsCount.textContent = isFiltered()
      ? `${ops.length} opération${ops.length > 1 ? 's' : ''} sur ${m.operations.length} · total ${net > 0 ? '+' : ''}${moneyExact(net)}`
      : `${ops.length} opération${ops.length > 1 ? 's' : ''}`;
    el.ops.classList.toggle('is-editing', state.editOps);
    el.ops.replaceChildren(...(ops.length
      ? ops.map((t) => (state.editOps ? editRow(t) : opNode(t)))
      : [emptyRow(isFiltered() ? 'Aucune opération ne correspond à ces filtres.' : 'Aucune opération enregistrée pour ce mois.')]));
    if (state.editOps) updateEditStatus();
  }

  function opNode(t) {
    const node = el.opTemplate.content.firstElementChild.cloneNode(true);
    const category = categoryOf(t.categoryId);
    const { kind } = displayLabel(t.label);
    node.dataset.type = t.type;
    node.dataset.id = t.id;
    node.classList.toggle('is-offbudget', Boolean(t.offBudget));
    node.querySelector('.js-date').textContent = dayMonth.format(asDate(t.date));
    node.querySelector('.js-icon').textContent = category?.icon ?? '';
    const nameEl = node.querySelector('.js-name');
    nameEl.textContent = opName(t);
    nameEl.title = t.label;
    const meta = [kind, category?.name];
    if (state.profile === ALL_PROFILES) meta.push(state.profileNames[t.profile] ?? t.profile);
    if (t.recurring) meta.push('mensualisée');
    if (category?.kind === 'epargne' && state.livrets.length) {
      const dest = state.destinations.get(t.id);
      meta.push(dest ? `épargne vers ${livretName(dest)}` : state.assign[t.id] === 'aucun' ? 'épargne, autre placement' : 'épargne, livret à préciser');
    } else if (t.offBudget) {
      meta.push(category?.kind === 'epargne' ? 'épargne du mois' : 'hors budget');
    }
    node.querySelector('.js-meta').textContent = meta.filter(Boolean).join(' · ');
    node.querySelector('.js-amount').textContent = (t.type === 'entree' ? '+' : '−') + moneyExact(t.amount);
    return node;
  }

  /* Opérations : mode édition (validé d'un coup) */

  function editRow(t) {
    const node = el.opEditTemplate.content.firstElementChild.cloneNode(true);
    const draft = state.drafts.get(t.id) ?? {};
    const value = (field) => (field in draft ? draft[field] : t[field]);
    node.dataset.id = t.id;
    const f = (name) => node.querySelector(`[name="${name}"]`);
    const name = displayLabel(t.label).name;

    f('date').value = value('date');
    f('note').value = value('note') ?? '';
    f('note').placeholder = name;
    f('note').title = t.label;
    f('categoryId').append(...state.categories.map((c) => new Option(`${c.icon ?? ''} ${c.name}`.trim(), c.id)));
    f('categoryId').value = value('categoryId');
    f('type').value = value('type');
    const profileChoices = state.activeProfiles.includes(value('profile'))
      ? state.activeProfiles
      : [...state.activeProfiles, value('profile')];
    f('profile').append(...profileChoices.map((p) => new Option(state.profileNames[p] ?? p, p)));
    f('profile').value = value('profile');
    f('profile').closest('label').hidden = profileChoices.length <= 1;
    f('amount').value = 'amount' in draft ? draft.amount : centsToInput(t.amount);
    f('recurring').checked = Boolean(value('recurring'));
    const auto = state.detected.get(t.id);
    f('destination').append(
      new Option(auto ? `${livretName(auto)} (d'après le libellé)` : 'À préciser', ''),
      ...state.livrets.filter((l) => l.id !== auto).map((l) => new Option(livretName(l.id), l.id)),
      new Option('Autre placement (pas un livret)', 'aucun'),
    );
    f('destination').value = 'destination' in draft ? draft.destination : (state.assign[t.id] ?? '');
    f('destination').setAttribute('aria-label', `Vers quel livret (${name})`);
    toggleDestination(node, value('categoryId'));
    for (const el2 of node.querySelectorAll('input, select')) el2.setAttribute('aria-describedby', '');
    node.querySelectorAll('.visually-hidden').forEach((s) => { s.textContent += ` (${name})`; });

    const del = node.querySelector('.js-delete');
    const doomed = state.toDelete.has(t.id);
    del.setAttribute('aria-pressed', String(doomed));
    del.setAttribute('aria-label', doomed ? `Garder ${name}` : `Supprimer ${name}`);
    node.classList.toggle('is-doomed', doomed);
    node.classList.toggle('is-dirty', state.drafts.has(t.id));
    node.querySelectorAll('input, select').forEach((i) => { i.disabled = doomed; });
    return node;
  }

  /** Nom d'un livret suivi, avec son titulaire s'il y en a plusieurs. */
  function livretName(id) {
    const livret = state.livrets.find((l) => l.id === id);
    if (!livret) return 'un livret';
    const holders = new Set(state.livrets.map((l) => l.profile));
    const name = PRODUCTS[livret.product].name;
    return holders.size > 1 ? `${name} · ${state.profileNames[livret.profile] ?? livret.profile}` : name;
  }

  /** Le choix du livret n'apparaît que pour une ligne d'épargne, et s'il y a des livrets suivis. */
  function toggleDestination(row, categoryId) {
    row.querySelector('.op-edit__dest').hidden = !state.livrets.length || categoryOf(categoryId)?.kind !== 'epargne';
  }

  const centsToInput = (cents) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, useGrouping: false });

  function readRow(row) {
    const original = state.model.operations.find((t) => t.id === row.dataset.id);
    const f = (name) => row.querySelector(`[name="${name}"]`);
    const draft = {};
    if (f('date').value !== original.date) draft.date = f('date').value;
    if (f('note').value.trim() !== (original.note ?? '')) draft.note = f('note').value.trim();
    if (f('categoryId').value !== original.categoryId) draft.categoryId = f('categoryId').value;
    if (f('type').value !== original.type) draft.type = f('type').value;
    if (f('profile').value !== original.profile) draft.profile = f('profile').value;
    if (f('recurring').checked !== Boolean(original.recurring)) draft.recurring = f('recurring').checked;
    if (f('amount').value.trim() !== centsToInput(original.amount)) draft.amount = f('amount').value.trim();
    toggleDestination(row, f('categoryId').value);
    if (!row.querySelector('.op-edit__dest').hidden && f('destination').value !== (state.assign[original.id] ?? '')) {
      draft.destination = f('destination').value;
    }
    if (Object.keys(draft).length) state.drafts.set(original.id, draft);
    else state.drafts.delete(original.id);
    row.classList.toggle('is-dirty', state.drafts.has(original.id));
    updateEditStatus();
  }

  function updateEditStatus() {
    const changed = state.drafts.size;
    const removed = state.toDelete.size;
    const parts = [];
    if (changed) parts.push(`${changed} modifiée${changed > 1 ? 's' : ''}`);
    if (removed) parts.push(`${removed} à supprimer`);
    el.opsEditStatus.textContent = parts.length ? `Opérations : ${parts.join(' · ')}` : 'Aucune modification pour l\'instant.';
    el.opsSave.disabled = !parts.length;
    el.opsLearnWrap.hidden = ![...state.drafts.values()].some((d) => 'categoryId' in d);
  }

  function setEditMode(on) {
    state.editOps = on;
    state.drafts = new Map();
    state.toDelete = new Set();
    el.opsEdit.hidden = on;
    el.opsEditBar.hidden = !on;
    el.opsHint.textContent = on
      ? 'Modifiez les opérations dans la liste, puis validez. Rien n\'est enregistré avant « Valider ».'
      : 'Filtrez la liste, ou touchez le crayon pour corriger, mensualiser ou supprimer des opérations.';
    renderOperations(state.model);
  }

  el.opsEdit.addEventListener('click', () => {
    el.opsNotice.hidden = true;
    setEditMode(true);
    el.ops.querySelector('.op-edit input')?.focus();
  });

  el.opsCancel.addEventListener('click', () => {
    setEditMode(false);
    el.opsEdit.focus();
  });

  el.ops.addEventListener('input', (e) => { const row = e.target.closest('.op-edit'); if (row) readRow(row); });
  el.ops.addEventListener('change', (e) => { const row = e.target.closest('.op-edit'); if (row) readRow(row); });

  el.ops.addEventListener('click', (e) => {
    const del = e.target.closest('.js-delete');
    if (!del) return;
    const id = del.closest('.op-edit').dataset.id;
    if (state.toDelete.has(id)) state.toDelete.delete(id);
    else state.toDelete.add(id);
    const row = editRow(state.model.operations.find((t) => t.id === id));
    del.closest('.op-edit').replaceWith(row);
    row.querySelector('.js-delete').focus();
    updateEditStatus();
  });

  el.opsSave.addEventListener('click', async () => {
    // Vérification de toutes les lignes modifiées avant d'écrire quoi que ce soit
    const changes = [];
    const destinations = []; // nouveaux rattachements à un livret (réglage, pas l'opération)
    let firstBad = null;
    for (const [id, { destination, ...draft }] of state.drafts) {
      if (state.toDelete.has(id)) continue;
      if (destination !== undefined) destinations.push({ id, destination });
      if (!Object.keys(draft).length) continue;
      const original = await getById('transactions', id);
      const next = { ...original, ...draft };
      if ('amount' in draft) {
        try { next.amount = toCents(draft.amount); } catch { next.amount = NaN; }
      }
      const bad = !(next.amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(next.date);
      const row = el.ops.querySelector(`.op-edit[data-id="${id}"]`);
      row?.querySelector('[name="amount"]').toggleAttribute('aria-invalid', !(next.amount > 0));
      if (bad) { firstBad ??= row ?? true; continue; }
      changes.push({ original, next });
    }
    if (firstBad) {
      el.opsEditStatus.textContent = 'Un montant ou une date n\'est pas valide : corrigez la ligne signalée.';
      if (firstBad !== true) firstBad.querySelector('[aria-invalid]')?.focus();
      return;
    }

    el.opsSave.disabled = true;
    const removed = await Promise.all([...state.toDelete].map((id) => getById('transactions', id)));
    for (const { next } of changes) await saveTransaction(next);
    for (const record of removed) await deleteTransaction(record.id);
    const previousAssign = state.assign;
    if (destinations.length) {
      const assign = { ...state.assign };
      for (const { id, destination } of destinations) {
        if (destination) assign[id] = destination; else delete assign[id];
      }
      await setSetting('livretAssign', assign);
    }
    // Comme à l'import : une catégorie corrigée est retenue pour ce commerçant
    const previousRules = [];
    if (el.opsLearn.checked) {
      const rules = changes
        .filter(({ original, next }) => original.categoryId !== next.categoryId && merchantKey(original.label))
        .map(({ original, next }) => ({ key: merchantKey(original.label), categoryId: next.categoryId, recurring: next.recurring }));
      for (const rule of rules) previousRules.push({ key: rule.key, previous: await getById('rules', rule.key) ?? null });
      await saveRules(rules);
    }

    state.undo = {
      restore: [...changes.map((c) => c.original), ...removed],
      rules: previousRules,
      assign: destinations.length ? previousAssign : null,
    };
    const parts = [];
    const edited = new Set([...changes.map((c) => c.original.id), ...destinations.map((d) => d.id)]).size;
    if (edited) parts.push(`${edited} opération${edited > 1 ? 's' : ''} modifiée${edited > 1 ? 's' : ''}`);
    if (removed.length) parts.push(`${removed.length} supprimée${removed.length > 1 ? 's' : ''}`);
    const moved = changes.filter(({ next }) => next.date.slice(0, 7) !== state.month).length;
    if (moved) parts.push(`${moved} déplacée${moved > 1 ? 's' : ''} dans un autre mois`);
    showNotice(`${parts.join(', ')}.`, true);
    setEditMode(false);
    await load({ animate: false });
    el.opsUndo.focus();
  });

  function showNotice(text, undo = false) {
    el.opsNotice.hidden = false;
    el.opsNoticeText.textContent = text;
    el.opsUndo.hidden = !undo;
  }

  el.opsUndo.addEventListener('click', async () => {
    if (!state.undo) return;
    for (const record of state.undo.restore) await put('transactions', record);
    for (const { key, previous } of state.undo.rules) {
      if (previous) await put('rules', previous);
      else await remove('rules', key);
    }
    if (state.undo.assign) await setSetting('livretAssign', state.undo.assign);
    state.undo = null;
    showNotice('Modifications annulées : les opérations sont revenues à leur état précédent.');
    await load({ animate: false });
  });

  /* Navigation */

  async function showLatestMonthHint() {
    const latest = await getLatestMonth();
    el.latest.hidden = !latest || latest === state.month;
    if (!el.latest.hidden) {
      el.latest.textContent = `Voir ${formatMonth(latest)}`;
      el.latest.dataset.month = latest;
    }
  }

  const goTo = (month) => {
    Object.assign(state, { month, editing: false, editOps: false, filters: emptyFilters(), selected: null });
    el.opsEdit.hidden = false;
    el.opsEditBar.hidden = true;
    el.opsNotice.hidden = true;
    load();
  };

  el.prev.addEventListener('click', () => goTo(addMonths(state.month, -1)));
  el.next.addEventListener('click', () => goTo(addMonths(state.month, 1)));
  el.today.addEventListener('click', () => goTo(todayIso().slice(0, 7)));
  el.latest.addEventListener('click', () => goTo(el.latest.dataset.month));
  el.profiles.addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return; // le champ de renommage émet aussi « change »
    Object.assign(state, { profile: e.target.value, userSelectedProfile: true, editing: false, editOps: false });
    state.filters.profile = '';
    el.opsEdit.hidden = false;
    el.opsEditBar.hidden = true;
    load();
  });

  window.addEventListener(DATA_CHANGED, () => load({ animate: false }));

  if (el.exportBtn) {
    el.exportBtn.addEventListener('click', async () => {
      el.exportBtn.disabled = true;
      el.exportBtn.textContent = 'Préparation…';
      try {
        const today = todayIso();
        const workbook = await buildFullWorkbook({
          today,
          month: state.month,
          profile: state.profile,
          names: state.profileNames,
        });
        download(new File([workbook.toBlob()], `notre-budget-bilan-complet-${today}.xlsx`, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }));
      } catch (err) {
        console.error('[export] Échec :', err);
      } finally {
        el.exportBtn.disabled = false;
        el.exportBtn.textContent = 'Exporter le bilan Excel';
      }
    });
  }

  return {
    /** À appeler quand l'écran redevient visible. */
    show: () => load(),
  };
}

/* Utilitaires */

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const emptyFilters = () => ({ q: '', type: '', categories: null, profile: '', recurring: false });
const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const pct = (ratio) => `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(2)}%`;

function small(text) {
  const s = document.createElement('small');
  s.textContent = text;
  return s;
}

function linkButton(text, className, ariaLabel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `link-btn ${className}`;
  b.textContent = text;
  b.setAttribute('aria-label', ariaLabel);
  return b;
}

function emptyRow(text) {
  const li = document.createElement('li');
  li.className = 'card__empty';
  li.textContent = text;
  return li;
}

/**
 * Applique des largeurs (--w). Avec animate, on part de 0 pour que tout se
 * remplisse ensemble ; sinon la transition part de l'état actuel.
 */
function setWidths(pairs, animate) {
  for (const [node, ratio] of pairs) node.hidden = ratio <= 0;
  if (animate) {
    for (const [node] of pairs) node.style.setProperty('--w', '0%');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const [node, ratio] of pairs) node.style.setProperty('--w', pct(ratio));
    }));
  } else {
    for (const [node, ratio] of pairs) node.style.setProperty('--w', pct(ratio));
  }
}
