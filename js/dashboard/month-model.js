/**
 * Calculs du tableau de bord : reste à vivre, échéances mensualisées,
 * analyse par catégorie (enveloppes, comparaisons, évolution) et répartition.
 * Module « pur » (aucun accès au DOM ni à la base) : il reçoit les données et
 * renvoie le modèle à afficher.
 *
 * Reste à vivre = revenus + rentrées mensualisées attendues − dépenses déjà passées
 *               − dépenses mensualisées à venir − épargne du mois.
 * L'épargne est nette : un retrait sur l'épargne (rentrée classée en épargne)
 * vient en déduction, et si l'on a plus repris que versé, il s'ajoute au reste.
 * Une échéance mensualisée (dépense ou rentrée) dont la date est dépassée sans
 * qu'on la retrouve dans les relevés est « non retrouvée » : signalée, mais pas comptée.
 * Les transferts sont des mouvements entre vos comptes : ils n'entrent
 * dans aucun de ces calculs. L'épargne reste hors dépenses et hors enveloppes.
 */
import { OFF_BUDGET_KINDS, TRANSACTION_TYPES } from '../db/schema.js';
import { merchantKey } from '../import/categorizer.js';

export const ALL_PROFILES = 'tous';

/** Au-delà de 5 catégories, l'anneau regroupe le reste dans « Autres ». */
export const BREAKDOWN_SLICES = 5;

/** Seuils des enveloppes : vert sous 75 %, orange jusqu'à 100 %, rouge au-delà. */
export const GAUGE_WARNING = 0.75;

/** Combien de mois en arrière chercher les dépenses mensualisées. */
export const RECURRING_LOOKBACK = 2;

/** Moyenne de comparaison : les N mois précédents qui ont des opérations. */
export const AVERAGE_MONTHS = 3;

/** Nombre de mois du graphique d'évolution (mois affiché compris). */
export const TREND_MONTHS = 6;

/** Nombre de commerçants listés. */
export const TOP_MERCHANTS = 5;

/* Mois « YYYY-MM » */

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const daysIn = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Clé d'une échéance mensualisée : même sens, même commerçant (ou émetteur), même profil. */
export const recurringKey = (t) => `${t.type}|${merchantKey(t.label) || t.label}|${t.profile}`;

/** Clé d'une échéance ignorée pour un mois donné (« Pas ce mois-ci »). */
export const skipKey = (month, key) => `${month}|${key}`;

/* Modèle */

/**
 * @param {object} p
 * @param {string} p.month          mois affiché, « YYYY-MM »
 * @param {string} p.today          date du jour, « YYYY-MM-DD »
 * @param {string} p.profile        'tous', 'moi', 'compagne' ou 'commun'
 * @param {Array}  p.transactions   opérations du mois affiché (tous profils)
 * @param {Array}  p.past           opérations des TREND_MONTHS − 1 mois précédents (tous profils)
 * @param {Array}  p.categories
 * @param {Array}  p.budgets
 * @param {Set}    [p.skips]        échéances ignorées (skipKey)
 */
export function buildMonthModel({ month, today, profile, transactions, past, categories, budgets, skips = new Set() }) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const offBudget = (t) => OFF_BUDGET_KINDS.includes(byId.get(t.categoryId)?.kind);
  const inView = (t) => profile === ALL_PROFILES || t.profile === profile;
  const isExpense = (t) => t.type === TRANSACTION_TYPES.EXPENSE && !offBudget(t);

  const ops = transactions.filter(inView);
  const expenses = ops.filter(isExpense);
  const income = sum(ops.filter((t) => t.type === TRANSACTION_TYPES.INCOME && !offBudget(t)));
  const spent = sum(expenses);
  const savingsOps = ops.filter((t) => byId.get(t.categoryId)?.kind === 'epargne');
  const saved = sum(savingsOps.filter((t) => t.type === TRANSACTION_TYPES.EXPENSE))
    - sum(savingsOps.filter((t) => t.type === TRANSACTION_TYPES.INCOME));

  // Jusqu'où les relevés couvrent-ils le mois ? (toutes personnes confondues)
  const currentMonth = today.slice(0, 7);
  const lastImported = transactions.reduce((max, t) => (t.date > max ? t.date : max), '');
  const asOf = month < currentMonth ? `${month}-${daysIn(month)}` : lastImported || `${month}-00`;

  const lookback = new Set(Array.from({ length: RECURRING_LOOKBACK }, (_, i) => addMonths(month, -(i + 1))));
  // L'épargne mensualisée compte aussi (elle sort du libre) ; seuls les transferts sont exclus
  const recurring = expectedRecurring({
    month,
    ops,
    history: past.filter((t) => lookback.has(t.month) && inView(t)),
    excluded: (t) => byId.get(t.categoryId)?.kind === 'transfert',
    skips,
  });
  const expected = recurring.filter((e) => !e.status);
  const upcoming = expected.filter((e) => e.expectedDate > asOf);
  const missing = expected.filter((e) => e.expectedDate <= asOf);
  const upcomingExpenses = upcoming.filter((e) => e.type === TRANSACTION_TYPES.EXPENSE);
  const upcomingTotal = sum(upcomingExpenses);
  const upcomingIncome = sum(upcoming.filter((e) => e.type === TRANSACTION_TYPES.INCOME));

  // Mois précédents « importés » : ceux où le relevé contient au moins une opération
  const pastMonths = Array.from({ length: TREND_MONTHS - 1 }, (_, i) => addMonths(month, -(TREND_MONTHS - 1 - i)));
  const imported = new Set(past.map((t) => t.month));
  const pastExpenses = past.filter((t) => inView(t) && isExpense(t));
  const byMonth = new Map(pastMonths.map((m) => [m, groupSum(pastExpenses.filter((t) => t.month === m))]));
  const averageOver = pastMonths.filter((m) => imported.has(m)).slice(-AVERAGE_MONTHS);
  const previous = addMonths(month, -1);

  const spentBy = groupSum(expenses);
  const upcomingBy = groupSum(upcomingExpenses);

  return {
    month,
    profile,
    status: month < currentMonth ? 'passe' : month > currentMonth ? 'futur' : 'en-cours',
    asOf: lastImported || null,
    income,
    spent,
    upcoming,
    upcomingTotal,
    upcomingIncome,
    missing,
    recurringPassed: recurring.filter((e) => e.status === 'passee'),
    recurringSkipped: recurring.filter((e) => e.status === 'ignoree'),
    saved, // épargne nette du mois (négative si l'on a repris sur l'épargne)
    remaining: income + upcomingIncome - spent - upcomingTotal - saved,
    averageMonths: averageOver.length,
    hasPrevious: imported.has(previous),
    categories: buildCategoryRows({
      categories, budgets, profile, spentBy, upcomingBy,
      previousBy: byMonth.get(previous), averageBy: averageOf(averageOver.map((m) => byMonth.get(m))),
    }),
    trend: [...pastMonths.map((m) => ({ month: m, imported: imported.has(m), byCategory: byMonth.get(m) })),
      { month, imported: transactions.length > 0, byCategory: spentBy }]
      .map((t) => ({ ...t, total: [...t.byCategory.values()].reduce((s, v) => s + v, 0) })),
    breakdown: buildBreakdown(spentBy, spent),
    merchants: topMerchants(expenses),
    operations: [...ops].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .map((t) => ({ ...t, offBudget: offBudget(t) })),
    isEmpty: ops.length === 0,
  };
}

/**
 * Dépenses et rentrées cochées « Mensualiser » les mois précédents et pas
 * encore apparues ce mois-ci. Montant attendu : celui de la dernière
 * occurrence ; date attendue : le même jour du mois.
 */
export function expectedRecurring({ month, ops, history, excluded = () => false, skips = new Set() }) {
  // Modèles : pour chaque commerçant, les opérations mensualisées du mois le plus
  // récent où il en a (deux virements permanents au même bénéficiaire = deux modèles)
  const byKey = new Map();
  for (const t of history) {
    if (!t.recurring || excluded(t)) continue;
    const key = recurringKey(t);
    const group = byKey.get(key);
    if (!group || group.month < t.month) byKey.set(key, { month: t.month, items: [t] });
    else if (group.month === t.month) group.items.push(t);
  }

  const opsByKey = new Map();
  for (const t of ops) {
    const key = recurringKey(t);
    opsByKey.set(key, [...(opsByKey.get(key) ?? []), t]);
  }

  const lastDay = daysIn(month);
  const result = [];
  for (const [baseKey, { items }] of byKey) {
    const templates = [...items].sort((a, b) => b.amount - a.amount);
    const matches = matchByAmount(templates, opsByKey.get(baseKey) ?? []);
    for (const t of templates) {
      // Clé propre à chaque modèle quand un commerçant en a plusieurs (pour « Pas ce mois-ci »)
      const key = templates.length > 1 ? `${baseKey}#${t.amount}` : baseKey;
      const matched = matches.get(t) ?? null;
      result.push({
        status: matched ? 'passee' : skips.has(skipKey(month, key)) ? 'ignoree' : null,
        matched,
        key,
        sourceId: t.id,
        type: t.type,
        label: t.label,
        amount: t.amount,
        categoryId: t.categoryId,
        profile: t.profile,
        expectedDate: `${month}-${String(Math.min(Number(t.date.slice(8, 10)), lastDay)).padStart(2, '0')}`,
        lastSeen: t.date,
      });
    }
  }
  return result.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

/**
 * Associe chaque modèle à l'opération du mois dont le montant est le plus
 * proche, une opération ne servant qu'une fois. Au-delà d'un écart du simple
 * au double, ce n'est pas la même échéance (un virement de 200 € n'honore pas
 * celui de 900 €), mais une facture qui varie (86 € → 150 €) reste reconnue.
 */
export const RECURRING_MATCH_RATIO = 0.5;

function matchByAmount(templates, candidates) {
  const pairs = [];
  for (const t of templates) {
    for (const op of candidates) {
      const ratio = Math.min(t.amount, op.amount) / Math.max(t.amount, op.amount);
      if (ratio >= RECURRING_MATCH_RATIO) pairs.push({ t, op, ratio });
    }
  }
  pairs.sort((a, b) => b.ratio - a.ratio);
  const matches = new Map();
  const used = new Set();
  for (const { t, op } of pairs) {
    if (matches.has(t) || used.has(op)) continue;
    matches.set(t, op);
    used.add(op);
  }
  return matches;
}

/** Une ligne par catégorie de dépense : ce mois, mois dernier, moyenne, enveloppe. */
function buildCategoryRows({ categories, budgets, profile, spentBy, upcomingBy, previousBy, averageBy }) {
  // Vue « Tous » : l'enveloppe globale si elle existe, sinon la somme des enveloppes ;
  // en vue « Moi », repli sur l'enveloppe globale si aucune enveloppe propre n'est définie.
  const own = (categoryId) => {
    const forCategory = budgets.filter((b) => b.categoryId === categoryId);
    const exact = forCategory.filter((b) => b.profile === profile);
    if (exact.length) return exact;
    if (profile === ALL_PROFILES) return forCategory;
    if (profile === 'moi') {
      const global = forCategory.filter((b) => b.profile === ALL_PROFILES);
      if (global.length) return global;
    }
    return exact;
  };

  return categories
    .filter((c) => c.kind === TRANSACTION_TYPES.EXPENSE)
    .map((category) => {
      const id = category.id;
      const spent = spentBy.get(id) ?? 0;
      const limits = own(id);
      const limit = limits.length ? limits.reduce((s, b) => s + b.monthlyLimit, 0) : null;
      const ratio = limit ? spent / limit : null;
      const average = averageBy?.get(id) ?? null;
      return {
        category,
        spent,
        upcoming: upcomingBy.get(id) ?? 0,
        previous: previousBy?.get(id) ?? 0,
        average,
        limit,
        budget: limits.length === 1 && limits[0].profile === profile ? limits[0] : null,
        ratio,
        status: ratio == null || spent === 0 ? null : ratio > 1 ? 'depasse' : ratio >= GAUGE_WARNING ? 'attention' : 'ok',
      };
    })
    .filter((r) => r.limit != null || r.spent > 0 || r.upcoming > 0 || r.previous > 0 || r.average > 0)
    .sort((a, b) => b.spent - a.spent || (b.average ?? 0) - (a.average ?? 0) || (b.limit ?? 0) - (a.limit ?? 0));
}

/** Moyenne mensuelle par catégorie (null s'il n'y a aucun mois de référence). */
function averageOf(maps) {
  if (!maps.length) return null;
  const totals = new Map();
  for (const map of maps) for (const [id, v] of map) totals.set(id, (totals.get(id) ?? 0) + v);
  return new Map([...totals].map(([id, v]) => [id, Math.round(v / maps.length)]));
}

/** Les plus gros commerçants du mois (cumul et nombre de passages). */
function topMerchants(expenses) {
  const groups = new Map();
  for (const t of expenses) {
    const key = merchantKey(t.label) || t.label;
    const g = groups.get(key) ?? { key, label: t.label, categoryId: t.categoryId, amount: 0, count: 0 };
    g.amount += t.amount;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_MERCHANTS);
}

/** Les plus grosses catégories, puis « Autres » ; ordre décroissant. */
function buildBreakdown(spentBy, total) {
  const rows = [...spentBy.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
  // Un seul reste ne mérite pas un « Autres » : on l'affiche tel quel
  const head = rows.length <= BREAKDOWN_SLICES + 1 ? rows : rows.slice(0, BREAKDOWN_SLICES);
  const tail = rows.slice(head.length);
  if (tail.length) head.push({ categoryId: null, ids: tail.map((r) => r.categoryId), amount: sum(tail), count: tail.length });
  return head.map((r) => ({ ...r, share: total ? r.amount / total : 0 }));
}

/* Libellés lisibles */

const OPERATION_KINDS = [
  [/^(CARTE|CB)\b(\s+X\d{4})?/, 'Carte'],
  [/^(PRELEVEMENT EUROPEEN|PRLV( SEPA)?|PRELEVEMENT)\b/, 'Prélèvement'],
  [/^(VIR(EMENT)? (RECU|INST RE)|VIR RECU)\b/, 'Virement reçu'],
  [/^(VIR(EMENT)?( EUROPEEN| INSTANTANE| PERM(ANENT)?)? EMIS|VIR(EMENT)?)\b/, 'Virement'],
  [/^(CHEQUE|CHQ)\b/, 'Chèque'],
  [/^(RETRAIT( DAB)?)\b/, 'Retrait'],
];

/**
 * « CARTE X4821 12/10 LECLERC DRIVE » → { kind: 'Carte', name: 'Leclerc Drive' }
 * « PRELEVEMENT EUROPEEN 4512398 DE: FREE MOBILE ID: FR12… » → { kind: 'Prélèvement', name: 'Free Mobile' }
 */
export function displayLabel(label) {
  let text = label.toUpperCase().trim();
  let kind = null;
  for (const [re, name] of OPERATION_KINDS) {
    if (re.test(text)) {
      kind = name;
      text = text.replace(re, ' ');
      break;
    }
  }
  const name = text
    .split(/\bMOTIF\s*:/)[0] // le motif d'un virement est trop long pour une liste
    .replace(/\b(ID|REF|MDT|N°)\s*:?\s*\S+/g, ' ')
    .replace(/\b(DE|POUR)\s*:/g, ' ')
    .replace(/\bLOGITEL\b/g, ' ')
    .replace(/\S*\d\S*/g, ' ')
    .replace(/[():*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { kind, name: titleCase(name) || kind || label };
}

const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'a', 'au', 'aux', 'en', 'sur', 'pour']);
const SPECIAL = new Map();
const ACRONYMS = new Set(['edf', 'gdf', 'sncf', 'ratp', 'sfr', 'kfc', 'caf', 'cpam', 'urssaf', 'dgfip', 'aprr', 'ugc', 'mgen', 'maif', 'macif', 'maaf', 'gmf', 'axa', 'ikea', 'tgv', 'ter', 'dab', 'pel', 'pea', 'ldds', 'lep']);

function titleCase(text) {
  const words = text.toLowerCase().split(' ');
  return words.map((w, i) => {
    if (!w) return w;
    if (i > 0 && i < words.length - 1 && SMALL_WORDS.has(w)) return w;
    if (w.length === 1) return w.toUpperCase(); // « Livret A »
    if (SPECIAL.has(w)) return SPECIAL.get(w);
    if (ACRONYMS.has(w) || !/[aeiouy]/.test(w)) return w.toUpperCase(); // sigles : SNCF, EDF, KFC
    // Majuscule après un trait d'union ou une élision (« O'Tacos »), pas sur « Donald's »
    const parts = w.split(/(['’-])/);
    return parts.map((part, j) => (j === 0 || (j % 2 === 0 && (parts[j - 1] === '-' || parts[j - 2].length === 1))
      ? part.charAt(0).toUpperCase() + part.slice(1) : part)).join('');
  }).join(' ');
}

/* Utilitaires */

const sum = (list) => list.reduce((s, t) => s + t.amount, 0);

function groupSum(list) {
  const map = new Map();
  for (const t of list) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
  return map;
}
