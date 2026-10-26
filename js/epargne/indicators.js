/**
 * Indicateurs pour juger un placement — fonctions pures.
 *
 *  - Rendement réel (relation de Fisher) : (1 + taux) / (1 + inflation) − 1.
 *    C'est ce que gagne (ou perd) votre pouvoir d'achat chaque année.
 *  - Équivalent brut : ce qu'un placement imposé devrait rapporter avant impôts
 *    pour égaler un livret net d'impôt (taux net ÷ (1 − taux d'imposition)).
 *  - Temps de doublement : ln 2 ÷ ln(1 + taux) — la « règle de 72 » (72 ÷ taux en %)
 *    en est l'approximation de tête. Si le rendement réel est négatif, on calcule à
 *    l'inverse le temps pour que le pouvoir d'achat soit divisé par deux.
 *  - Épargne de précaution (matelas de sécurité) : solde des livrets ÷ dépenses mensuelles
 *    moyennes mesurées dans les relevés ; la fourchette la plus citée est de 3 à 6 mois.
 */
import { OFF_BUDGET_KINDS } from '../db/schema.js';
import {
  ANNUAL_INFLATION, BENCHMARKS, OFFICIAL_RATES, SAFETY_MONTHS, TAX, rateOn,
} from './livret-rates.js';

export const realRate = (ratePct, inflationPct) => (1 + ratePct / 100) / (1 + inflationPct / 100) - 1;

export const grossEquivalent = (netPct, taxPct = TAX.pfu) => netPct / (1 - taxPct / 100);

export const netOfTax = (grossPct, taxPct) => grossPct * (1 - taxPct / 100);

/** Années pour doubler à un taux annuel (fraction) ; null si le taux n'est pas positif. */
export const doublingYears = (fraction) => (fraction > 0 ? Math.log(2) / Math.log(1 + fraction) : null);

/** Années pour diviser par deux à un taux annuel négatif (fraction) ; null sinon. */
export const halvingYears = (fraction) => (fraction < 0 ? Math.log(0.5) / Math.log(1 + fraction) : null);

/** Placements sans risque de référence, en taux nets (après impôts et prélèvements). */
export function benchmarks(ref = BENCHMARKS) {
  return [
    {
      id: 'fondsEuros',
      name: `Fonds euros (moyenne ${ref.fondsEuros.year})`,
      gross: ref.fondsEuros.rate,
      net: netOfTax(ref.fondsEuros.rate, TAX.socialAssuranceVie),
      note: `${ref.fondsEuros.rate.toLocaleString('fr-FR')} % avant prélèvements sociaux (${TAX.socialAssuranceVie.toLocaleString('fr-FR')} %)`,
    },
    {
      id: 'estr',
      name: 'Marché monétaire (€STR)',
      gross: ref.estr.rate,
      net: netOfTax(ref.estr.rate, TAX.pfu),
      note: `${ref.estr.rate.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} % avant prélèvement forfaitaire (${TAX.pfu.toLocaleString('fr-FR')} %)`,
    },
  ];
}

const quinzaineStart = (year, q) =>
  `${year}-${String(Math.floor(q / 2) + 1).padStart(2, '0')}-${q % 2 ? '16' : '01'}`;

/** Taux effectif d'une année civile : moyenne des taux des 24 quinzaines. */
export function yearRate(rates, product, year) {
  let total = 0;
  for (let q = 0; q < 24; q++) total += rateOn(rates, product, quinzaineStart(year, q));
  return total / 24;
}

/**
 * 100 € placés au 1er janvier de la première année connue, intérêts réinvestis,
 * face à l'indice des prix (inflation moyenne annuelle).
 */
export function history(rates, products, annual = ANNUAL_INFLATION) {
  // Les années complètes dont on connaît à la fois l'inflation et les taux
  const firstRateYear = Number(OFFICIAL_RATES[0].from.slice(0, 4));
  const yearsList = Object.keys(annual).map(Number).filter((y) => y >= firstRateYear).sort((a, b) => a - b);
  const ANNUAL = annual;
  const first = yearsList[0];
  const points = [{ year: first - 1, prices: 100, ...Object.fromEntries(products.map((p) => [p, 100])) }];
  const rows = [];
  for (const year of yearsList) {
    const previous = points[points.length - 1];
    const inflation = ANNUAL[year];
    const row = { year, inflation };
    const point = { year, prices: previous.prices * (1 + inflation / 100) };
    for (const p of products) {
      row[p] = yearRate(rates, p, year);
      row[`${p}Real`] = realRate(row[p], inflation);
      point[p] = previous[p] * (1 + row[p] / 100);
    }
    rows.push(row);
    points.push(point);
  }
  return { from: first, to: yearsList[yearsList.length - 1], rows, points };
}

/**
 * Dépenses mensuelles moyennes (hors épargne et virements) des titulaires des
 * livrets, sur les derniers mois complets importés (3 au plus), avec le total de chaque mois.
 */
export function monthlyExpenses(transactions, categories, profiles, currentMonth, count = 3) {
  const kinds = new Map(categories.map((c) => [c.id, c.kind]));
  const months = [...new Set(transactions.map((t) => t.month))].filter((m) => m < currentMonth).sort().slice(-count);
  if (!months.length) return null;
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const t of transactions) {
    if (!byMonth.has(t.month) || !profiles.has(t.profile) || t.type !== 'sortie' || OFF_BUDGET_KINDS.includes(kinds.get(t.categoryId))) continue;
    byMonth.set(t.month, byMonth.get(t.month) + t.amount);
  }
  const totals = [...byMonth.values()];
  const spent = totals.reduce((s, v) => s + v, 0);
  return { average: Math.round(spent / months.length), months, byMonth, min: Math.min(...totals), max: Math.max(...totals) };
}

/**
 * Matelas de sécurité : combien de mois de dépenses les livrets couvrent, l'écart avec la
 * fourchette conseillée et, s'il manque de quoi l'atteindre, le temps qu'il faudra au
 * rythme des versements réguliers.
 */
export function safetyNet(balance, expenses, monthlyPlan = 0, range = SAFETY_MONTHS) {
  if (!expenses?.average) return null;
  const months = balance / expenses.average;
  const low = range.min * expenses.average;
  const high = range.max * expenses.average;
  const gap = Math.max(0, low - balance);
  const surplus = Math.max(0, balance - high);
  const status = months < range.min ? 'court' : months > range.max ? 'large' : 'conseille';
  return {
    months, low, high, gap, surplus, status,
    reachIn: gap > 0 && monthlyPlan > 0 ? Math.ceil(gap / monthlyPlan) : null,
  };
}
