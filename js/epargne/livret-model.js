/**
 * Calcul des livrets réglementés — fonctions pures, sans accès à la base.
 *
 * Règles appliquées (Livret A et LEP) :
 *  - l'année compte 24 quinzaines (du 1er au 15, du 16 à la fin du mois) ;
 *  - un versement rapporte à partir de la quinzaine qui suit ;
 *  - un retrait cesse de rapporter dès sa propre quinzaine ;
 *  - intérêts d'une quinzaine = solde en valeur × taux / 24, au taux en
 *    vigueur le premier jour de la quinzaine ;
 *  - les intérêts sont versés au 31 décembre et rapportent ensuite à leur tour ;
 *  - au-delà du plafond, plus de versement possible (les intérêts, eux, s'ajoutent).
 *
 * Le solde de départ n'est pas connu : on part du solde que vous avez saisi
 * (le « solde connu », à une date) et on le reconstitue avec les virements
 * des relevés importés. Comme le calcul est linéaire en le solde de départ,
 * deux simulations suffisent pour le retrouver exactement.
 */
import { normalizeLabel } from '../import/categorizer.js';
import { PRODUCTS, rateOn, rateWindow } from './livret-rates.js';

const DAY_MS = 86400000;
const PLAN_DAY_DEFAULT = 5;

// ——— Quinzaines —————————————————————————————————————————————————

const parts = (iso) => iso.split('-').map(Number);

/** Quinzaine (0–23) d'une date de l'année. */
export function quinzaineOf(iso) {
  const [, m, d] = parts(iso);
  return (m - 1) * 2 + (d >= 16 ? 1 : 0);
}

const quinzaineStart = (year, q) =>
  `${year}-${String(Math.floor(q / 2) + 1).padStart(2, '0')}-${q % 2 ? '16' : '01'}`;

function quinzaineEnd(year, q) {
  const month = Math.floor(q / 2) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${q % 2 ? String(last) : '15'}`;
}

const isoOf = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;

// ——— Simulation ————————————————————————————————————————————————

/**
 * Déroule le livret année par année, quinzaine par quinzaine.
 * @param {object} o
 * @param {number} o.startYear   année de départ (solde au 1er janvier = o.startBalance)
 * @param {Array}  o.flows       [{ date, amount }] montants signés en centimes (+ versement, − retrait)
 * @param {Array}  [o.plan]      [{ amount, day, after }] virements réguliers prévus chaque mois après la date `after`
 * @param {boolean} [o.exact]    false = calcul brut (sans arrondi ni plancher), pour la résolution
 * @param {number} [o.compoundFrom]  année à partir de laquelle on mesure les intérêts sur les intérêts
 */
function simulate({ product, rates, startYear, startBalance, endYear, flows, plan = [], exact = true, today = null, compoundFrom = null }) {
  const cap = PRODUCTS[product].cap;
  const byQuinzaine = new Map();
  for (const f of flows) {
    const key = `${f.date.slice(0, 4)}:${quinzaineOf(f.date)}`;
    if (!byQuinzaine.has(key)) byQuinzaine.set(key, []);
    byQuinzaine.get(key).push(f);
  }

  const years = [];
  const applied = []; // mouvements réellement passés sur le livret (versements prévus plafonnés compris)
  let balance = startBalance;
  let capitalized = 0; // intérêts versés depuis compoundFrom, qui rapportent à leur tour

  for (let year = startYear; year <= endYear; year++) {
    const start = balance;
    let interest = 0;
    let yearRate = 0; // Σ taux/24 de l'année, en %
    let earned = 0; // intérêts des quinzaines terminées (année en cours)
    let deposits = 0;
    let withdrawals = 0;

    for (let q = 0; q < 24; q++) {
      const list = [...(byQuinzaine.get(`${year}:${q}`) ?? [])];
      const month = Math.floor(q / 2) + 1;
      for (const item of plan) {
        const date = isoOf(year, month, item.day);
        if (item.amount > 0 && (item.day >= 16) === (q % 2 === 1) && date > item.after) {
          list.push({ date, amount: item.amount, planned: true });
        }
      }
      list.sort((a, b) => a.date.localeCompare(b.date));

      const out = list.reduce((s, f) => s + Math.min(0, f.amount), 0);
      const value = balance + out;
      const rate = rateOn(rates, product, quinzaineStart(year, q));
      yearRate += rate / 24;
      const gain = (exact ? Math.max(0, value) : value) * rate / 100 / 24;
      interest += gain;
      if (today && quinzaineEnd(year, q) < today) earned += gain;

      for (const f of list) {
        let amount = f.amount;
        // Plafond : un versement prévu est réduit à ce qui reste possible
        if (f.planned) amount = Math.min(amount, Math.max(0, cap - balance));
        if (amount === 0) continue;
        balance += amount;
        if (amount > 0) deposits += amount; else withdrawals -= amount;
        applied.push({ ...f, amount });
      }
    }

    if (exact) interest = Math.round(interest);
    // Intérêts composés : la part des intérêts de l'année produite par les intérêts déjà versés
    const compound = compoundFrom != null && year >= compoundFrom ? Math.round(capitalized * yearRate / 100) : 0;
    balance += interest;
    if (compoundFrom != null && year >= compoundFrom) capitalized += interest;
    years.push({ year, start, interest, compound, earned: exact ? Math.round(earned) : earned, deposits, withdrawals, end: balance });
  }

  /** Solde en fin de journée : intérêts compris le 31 décembre. */
  function balanceAt(iso) {
    const y = Number(iso.slice(0, 4));
    const entry = years.find((e) => e.year === y);
    if (!entry) return null;
    const moved = applied.filter((f) => f.date.startsWith(`${y}-`) && f.date <= iso).reduce((s, f) => s + f.amount, 0);
    return entry.start + moved + (iso.endsWith('-12-31') ? entry.interest : 0);
  }

  return { years, applied, balanceAt };
}

// ——— Virements réguliers ————————————————————————————————————————

// Virement permanent ou automatique, tel que les banques l'écrivent
const REGULAR_HINT = /\b(VIR(EMENT)?\s+(PERM|PERMANENT|PERIODIQUE|AUTO|AUTOMATIQUE)|PERMANENT|AUTOMATIQUE|PERIODIQUE)\b/i;
const templateKey = (f) => `${(f.label ?? '').toUpperCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim()}|${f.amount}`;

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/**
 * Virements qui renflouent le livret chaque mois. Un virement est « régulier »
 * s'il est mensualisé, si son libellé dit « permanent » ou « automatique », ou
 * s'il revient au même montant au moins 2 mois sur les 3 derniers mois complets.
 * Il doit être encore actif (vu ce mois-ci ou le mois dernier).
 */
export function regularTransfers(flows, today) {
  const month = today.slice(0, 7);
  const since = shiftMonth(month, -3);
  const lastMonth = shiftMonth(month, -1);
  const groups = new Map();
  for (const f of flows) {
    if (f.amount <= 0 || f.date.slice(0, 7) < since) continue;
    const key = templateKey(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const items = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const last = list.at(-1);
    const months = new Set(list.map((f) => f.date.slice(0, 7)).filter((m) => m < month));
    const flagged = list.some((f) => f.recurring);
    const permanent = list.some((f) => REGULAR_HINT.test(f.label ?? ''));
    if (!(flagged || permanent || months.size >= 2) || last.date.slice(0, 7) < lastMonth) continue;
    items.push({
      amount: last.amount,
      day: Math.min(28, Number(last.date.slice(8, 10))),
      label: last.label,
      reason: flagged ? 'mensualisé' : permanent ? 'virement permanent' : `${months.size} mois sur 3`,
      seenThisMonth: list.some((f) => f.date.startsWith(month)),
    });
  }
  return items.sort((a, b) => a.day - b.day);
}

/**
 * Versements mensuels prévus : le montant réglé sur le livret s'il existe,
 * sinon la somme des virements réguliers repérés dans les relevés.
 */
export function monthlyPlan(livret, flows, today) {
  const items = regularTransfers(flows, today);
  if (livret.monthlyPlan != null) {
    const day = items[0]?.day ?? PLAN_DAY_DEFAULT;
    return {
      monthly: livret.monthlyPlan, day, source: 'reglage',
      items: [{ amount: livret.monthlyPlan, day, label: 'réglé par vous', seenThisMonth: items.some((i) => i.seenThisMonth) }],
    };
  }
  return {
    monthly: items.reduce((s, i) => s + i.amount, 0),
    day: items[0]?.day ?? PLAN_DAY_DEFAULT,
    source: items.length ? 'releves' : 'aucun',
    items,
  };
}

/**
 * Modèle complet d'un livret.
 * @param {object} livret   { product, anchor: { date, balance }, monthlyPlan }
 * @param {Array}  flows    mouvements des relevés [{ date, amount, recurring }]
 * @param {Array}  rates    barème fusionné (mergeRates)
 * @param {string} today    "YYYY-MM-DD"
 * @param {number} inflation  % sur un an
 * @param {number} horizon  nombre d'années projetées après l'année en cours
 */
export function buildLivretModel({ livret, flows, rates, today, inflation, horizon }) {
  const { product, anchor } = livret;
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const thisYear = Number(today.slice(0, 4));
  const anchorYear = Number(anchor.date.slice(0, 4));
  const startYear = Math.min(anchorYear, Number(sorted[0]?.date.slice(0, 4) ?? anchorYear));
  const base = { product, rates, startYear, endYear: anchorYear, flows: sorted.filter((f) => f.date <= anchor.date), exact: false };

  // Le solde au point connu est affine en le solde de départ : a·x + b
  const b = simulate({ ...base, startBalance: 0 }).balanceAt(anchor.date);
  const a = simulate({ ...base, startBalance: 1 }).balanceAt(anchor.date) - b;
  const startBalance = Math.round((anchor.balance - b) / a);

  // Ce mois-ci, un virement régulier ne compte que s'il n'est pas déjà passé
  const plan = monthlyPlan(livret, sorted, today);
  const month = today.slice(0, 7);
  const schedule = plan.items.map((item) => {
    const date = `${month}-${String(item.day).padStart(2, '0')}`;
    return { ...item, after: item.seenThisMonth || date <= today ? `${month}-31` : today };
  });

  const run = simulate({
    product, rates, startYear, startBalance, endYear: thisYear + horizon, flows: sorted,
    plan: schedule, today, compoundFrom: thisYear,
  });

  const balance = run.balanceAt(today);
  const rate = rateOn(rates, product, today);
  const real = (1 + rate / 100) / (1 + inflation / 100) - 1;
  const current = run.years.find((y) => y.year === thisYear);
  const deflate = (iso) => (1 + inflation / 100) ** (daysBetween(today, iso) / 365.25);

  return {
    product,
    name: PRODUCTS[product].name,
    // Les 12 prochains mois, au solde actuel : intérêts gagnés et hausse des prix sur la même somme
    next12: {
      interest: Math.round(balance * rate / 100),
      erosion: Math.round(balance * inflation / 100),
      gain: Math.round(balance * rate / 100) - Math.round(balance * inflation / 100),
    },
    cap: PRODUCTS[product].cap,
    balance,
    capRoom: Math.max(0, PRODUCTS[product].cap - balance),
    rate,
    window: rateWindow(rates, product, today),
    real, // rendement réel annuel, en fraction (−0,013 = −1,3 %)
    interestYear: current?.interest ?? 0,
    interestEarned: current?.earned ?? 0,
    plan,
    // Le solde reconstitué au 1er janvier est négatif : il manque des virements ou le solde saisi est faux
    inconsistent: startBalance < -100,
    startYear,
    years: run.years.filter((y) => y.year >= thisYear).map((y) => ({
      year: y.year,
      end: y.end,
      real: Math.round(y.end / deflate(`${y.year}-12-31`)),
      interest: y.interest,
      compound: y.compound,
      deposits: y.deposits,
    })),
  };
}

// ——— Virements des relevés —————————————————————————————————————

/** Mots du libellé d'un livret : ceux réglés, sinon ceux du produit. */
export const livretKeywords = (livret) =>
  (livret.keywords?.length ? livret.keywords : PRODUCTS[livret.product].keywords).map(normalizeLabel).filter(Boolean);

/**
 * Répartit les opérations d'épargne des relevés entre les livrets.
 * Un rattachement fait à la main (assign) l'emporte ; sinon, le livret du
 * même titulaire dont un mot apparaît dans le libellé (le plus long gagne).
 * Côté livret, une sortie du compte courant est un versement (+), une
 * rentrée un retrait (−).
 * @param {Array} transactions  opérations candidates (épargne + rattachées)
 * @param {Set}   savingsCategories  catégories de type « épargne »
 * @returns {{ byLivret: Map<string, Array>, unmatched: Array }}
 */
export function matchFlows(transactions, livrets, assign, savingsCategories) {
  const byLivret = new Map(livrets.map((l) => [l.id, []]));
  const words = livrets.map((l) => ({ livret: l, words: livretKeywords(l) }));
  const unmatched = [];

  for (const tx of transactions) {
    const override = assign[tx.id];
    let target = null;
    if (override) {
      target = byLivret.has(override) ? override : null;
    } else if (savingsCategories.has(tx.categoryId)) {
      const padded = ` ${normalizeLabel(`${tx.label} ${tx.note ?? ''}`)} `;
      let best = 0;
      for (const { livret, words: list } of words) {
        if (livret.profile !== tx.profile) continue;
        for (const w of list) {
          if (w.length > best && padded.includes(` ${w} `)) { best = w.length; target = livret.id; }
        }
      }
      if (!target) unmatched.push(tx);
    }
    if (!target) continue;
    byLivret.get(target).push({
      id: tx.id,
      date: tx.date,
      amount: tx.type === 'sortie' ? tx.amount : -tx.amount,
      recurring: Boolean(tx.recurring),
      label: tx.note || tx.label,
      manual: Boolean(override),
    });
  }
  for (const list of byLivret.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  unmatched.sort((a, b) => b.date.localeCompare(a.date));
  return { byLivret, unmatched };
}

/** Additionne les livrets année par année et résume la situation face à l'inflation. */
export function summarize(models, inflation) {
  const balance = models.reduce((s, m) => s + m.balance, 0);
  const yearly = models.reduce((s, m) => s + m.balance * m.rate / 100, 0);
  const erosion = balance * inflation / 100;
  const years = (models[0]?.years ?? []).map((y, i) => ({
    year: y.year,
    end: models.reduce((s, m) => s + m.years[i].end, 0),
    real: models.reduce((s, m) => s + m.years[i].real, 0),
    interest: models.reduce((s, m) => s + m.years[i].interest, 0),
    compound: models.reduce((s, m) => s + m.years[i].compound, 0),
    deposits: models.reduce((s, m) => s + m.years[i].deposits, 0),
  }));
  return {
    balance,
    rate: balance > 0 ? (yearly / balance) * 100 : 0,
    yearlyInterest: Math.round(yearly),
    yearlyErosion: Math.round(erosion),
    // Gain (ou perte) de pouvoir d'achat sur un an : intérêts − hausse des prix sur la même somme
    realGain: Math.round(yearly) - Math.round(erosion),
    years,
  };
}
