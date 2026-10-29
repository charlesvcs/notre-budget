/**
 * PEA : rendement des grands indices d'actions et fiscalite : donnees et fonctions pures.
 *
 *  - Performances annuelles en euros, dividendes reinvestis (indices « net return » ou
 *    « dividendes reinvestis »), hors frais d'ETF. Un PEA les suit via des ETF eligibles
 *    (replication synthetique pour les indices mondiaux et americains).
 *  - Rendement moyen = taux annuel compose (moyenne geometrique) : ((Π (1 + r)) ^ (1/n)) − 1.
 *    La moyenne arithmetique des annees, plus flatteuse, n'est pas ce qu'a gagne l'investisseur.
 *  - Fiscalite 2026 (LFSS 2026) : seuls les gains sont imposes, au retrait.
 *    Avant 5 ans : prelevement forfaitaire de 31,4 % (12,8 % d'impot + 18,6 % de prelevements
 *    sociaux) et cloture du plan. Apres 5 ans : 18,6 % de prelevements sociaux seulement.
 *
 * A rafraichir chaque janvier : ajouter l'annee ecoulee a INDEX_RETURNS (fiches MSCI en EUR,
 * Euronext pour le CAC 40 GR) et l'inflation moyenne correspondante dans livret-rates.js.
 */
import { TAX } from './livret-rates.js';

export const PEA = {
  cap: 15_000_000, // plafond des versements, en centimes
  years: 5, // duree de detention ouvrant l'exoneration d'impot sur le revenu
  taxBefore: TAX.pfu, // retrait avant 5 ans : impot + prelevements sociaux, sur les gains
  taxAfter: TAX.social, // retrait apres 5 ans : prelevements sociaux seuls, sur les gains
};

/** Performances annuelles en %, en euros, dividendes reinvestis. */
export const INDEX_RETURNS = [
  {
    id: 'world',
    name: 'MSCI World',
    note: 'Environ 1 300 grandes entreprises de 23 pays développés : l\'indice « monde » de la plupart des ETF du PEA.',
    global: true,
    source: 'MSCI World Index (EUR), net returns',
    returns: { 2016: 10.73, 2017: 7.51, 2018: -4.11, 2019: 30.02, 2020: 6.33, 2021: 31.07, 2022: -12.78, 2023: 19.6, 2024: 26.6, 2025: 6.77 },
  },
  {
    id: 'acwi',
    name: 'MSCI ACWI',
    note: 'Le monde entier, pays émergents compris (47 pays).',
    global: true,
    source: 'MSCI ACWI Index (EUR), net returns',
    returns: { 2016: 11.09, 2017: 8.89, 2018: -4.85, 2019: 28.93, 2020: 6.65, 2021: 27.54, 2022: -13.01, 2023: 18.06, 2024: 25.33, 2025: 7.86 },
  },
  {
    id: 'sp500',
    name: 'S&P 500',
    note: 'Les 500 plus grandes entreprises américaines, converties en euros.',
    source: 'S&P 500 Net Total Return, en euros',
    returns: { 2016: 15.63, 2017: 7.08, 2018: 0.15, 2019: 34.02, 2020: 8.39, 2021: 39.45, 2022: -13.04, 2023: 21.9, 2024: 32.97, 2025: 4.23 },
  },
  {
    id: 'cac40',
    name: 'CAC 40 dividendes réinvestis',
    note: 'Les 40 plus grandes capitalisations de la Bourse de Paris (indice GR).',
    source: 'CAC 40 Gross Total Return (Euronext)',
    returns: { 2016: 8.88, 2017: 12.73, 2018: -8.0, 2019: 30.45, 2020: -4.96, 2021: 31.88, 2022: -6.68, 2023: 20.14, 2024: 0.92, 2025: 14.28 },
  },
];

/** Annees disponibles pour un indice, dans l'ordre. */
export const yearsOf = (index) => Object.keys(index.returns).map(Number).sort((a, b) => a - b);

/** Taux annuel compose (fraction) d'une suite de performances annuelles en %. */
export function annualized(returns) {
  if (!returns.length) return null;
  const growth = returns.reduce((g, r) => g * (1 + r / 100), 1);
  return growth ** (1 / returns.length) - 1;
}

/**
 * Statistiques d'un indice sur ses `count` dernieres annees connues.
 * real : rendement compose apres inflation francaise (moyenne annuelle de l'IPC).
 */
export function indexStats(index, count, inflation = {}) {
  const list = yearsOf(index).slice(-count);
  const returns = list.map((y) => index.returns[y]);
  const withInflation = list.filter((y) => inflation[y] != null);
  const realGrowth = withInflation.reduce((g, y) => g * (1 + index.returns[y] / 100) / (1 + inflation[y] / 100), 1);
  const worst = list.reduce((w, y) => (index.returns[y] < index.returns[w] ? y : w), list[0]);
  const best = list.reduce((b, y) => (index.returns[y] > index.returns[b] ? y : b), list[0]);
  return {
    from: list[0],
    to: list.at(-1),
    years: list.length,
    cagr: annualized(returns),
    mean: returns.reduce((s, r) => s + r, 0) / returns.length / 100,
    real: withInflation.length === list.length ? realGrowth ** (1 / list.length) - 1 : null,
    worst: { year: worst, rate: index.returns[worst] / 100 },
    best: { year: best, rate: index.returns[best] / 100 },
    negative: returns.filter((r) => r < 0).length,
  };
}

/**
 * Ce que coute l'imposition des gains au retrait, pour un placement a `rate` (fraction)
 * pendant `years` ans, impose a `taxPct` % sur les gains seulement.
 */
export function taxOnExit(rate, years, taxPct) {
  const growth = (1 + rate) ** years;
  const gain = growth - 1;
  const net = 1 + gain * (1 - taxPct / 100);
  const gainShare = gain > 0 ? gain / growth : 0;
  const netRate = net ** (1 / years) - 1;
  return { gainShare, onWithdrawal: gainShare * (taxPct / 100), netRate, drag: rate - netRate };
}

/** Taux d'imposition des gains d'un PEA selon son age au moment du retrait. */
export const peaTax = (years) => (years < PEA.years ? PEA.taxBefore : PEA.taxAfter);

/** Valeur finale nette d'imposition d'une somme (centimes) placee `years` ans a `rate`. */
export function netValue(cents, rate, years, taxPct) {
  const gross = cents * (1 + rate) ** years;
  return Math.round(gross - Math.max(0, gross - cents) * (taxPct / 100));
}

/** Les indices « monde » de reference : moyenne de leurs rendements composes sur la periode. */
export function globalAverage(count, inflation = {}, list = INDEX_RETURNS) {
  const stats = list.filter((i) => i.global).map((i) => indexStats(i, count, inflation));
  const avg = (key) => stats.reduce((s, x) => s + x[key], 0) / stats.length;
  return { cagr: avg('cagr'), real: stats.every((s) => s.real != null) ? avg('real') : null, from: stats[0].from, to: stats[0].to, years: stats[0].years };
}

// Votre PEA : lignes d'ETF et projection

/**
 * ETF eligibles au PEA les plus repandus. Frais courants (TER) en % par an, d'apres les
 * emetteurs a l'automne 2026 : modifiables ligne par ligne.
 */
export const ETFS = [
  { id: 'dcam', ticker: 'DCAM', name: 'Amundi PEA Monde (MSCI World)', isin: 'FR001400U5Q4', index: 'world', ter: 0.2 },
  { id: 'wpea', ticker: 'WPEA', name: 'iShares MSCI World Swap PEA', isin: 'IE0002XZSHO1', index: 'world', ter: 0.2 },
  { id: 'cw8', ticker: 'CW8', name: 'Amundi MSCI World', isin: 'LU1681043599', index: 'world', ter: 0.38 },
  { id: 'ese', ticker: 'ESE', name: 'BNP Paribas Easy S&P 500', isin: 'FR0011550185', index: 'sp500', ter: 0.12 },
  { id: 'psp5', ticker: 'PSP5', name: 'Amundi PEA S&P 500', isin: 'FR0011871128', index: 'sp500', ter: 0.15 },
  { id: 'c40', ticker: 'C40', name: 'Amundi CAC 40', isin: 'FR0007052782', index: 'cac40', ter: 0.25 },
];
export const OTHER_ETF = 'autre';
export const etfById = new Map(ETFS.map((e) => [e.id, e]));
export const indexById = new Map(INDEX_RETURNS.map((i) => [i.id, i]));

/** Hypotheses de rendement des actions, avant frais des ETF. */
export const SCENARIOS = [
  { id: 'passe', label: 'Passé 10 ans', text: 'le rendement moyen de vos indices sur les 10 dernières années' },
  { id: 'prudent', label: 'Prudent 5 %', rate: 5, text: '5 % par an, une hypothèse prudente pour les actions mondiales' },
  { id: 'pessimiste', label: 'Pessimiste 2 %', rate: 2, text: '2 % par an, à peine au-dessus de l\'inflation' },
];

/** Une ligne enregistree { etf, name?, index?, ter, amount } completee par le catalogue. */
export function lineInfo(line) {
  const etf = etfById.get(line.etf);
  return {
    ...line,
    name: etf?.name ?? (line.name || 'Autre ETF'),
    ticker: etf?.ticker ?? '',
    isin: etf?.isin ?? '',
    index: etf?.index ?? line.index ?? 'world',
    ter: line.ter ?? etf?.ter ?? 0,
  };
}

/**
 * Le portefeuille d'un PEA : valeur, poids de chaque ligne, frais moyens et rendement
 * passe des indices suivis (moyenne ponderee sur 10 ans, en fraction).
 */
export function portfolio(account, inflation = {}) {
  const lines = (account.lines ?? []).map(lineInfo);
  const value = lines.reduce((s, l) => s + l.amount, 0);
  const weight = (l) => (value > 0 ? l.amount / value : 1 / lines.length);
  const withWeights = lines.map((l) => ({ ...l, weight: weight(l), past: indexStats(indexById.get(l.index), 10, inflation).cagr }));
  const avg = (key) => withWeights.reduce((s, l) => s + l.weight * l[key], 0);
  return {
    value,
    deposits: account.deposits ?? value,
    lines: withWeights,
    ter: lines.length ? avg('ter') : 0, // en %
    past: lines.length ? avg('past') : 0, // fraction
  };
}

/** Rendement annuel net de frais (fraction) retenu pour un scenario. */
export function scenarioRate(pf, scenarioId) {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  return (scenario.rate == null ? pf.past : scenario.rate / 100) - pf.ter / 100;
}

/** Mois ecoules entre deux mois « YYYY-MM ». */
export const monthsBetween = (from, to) => {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};

/**
 * Projection mois par mois : versement en debut de mois (jusqu'au plafond des versements),
 * puis croissance au taux mensuel equivalent. Un point complet par annee ecoulee (fiscalite,
 * valeur nette et pouvoir d'achat en euros d'aujourd'hui calcules pour chaque annee).
 */
export function projectPea({ value, deposits, monthly, rate, years, opened, start, inflation = 0 }) {
  const monthlyRate = (1 + rate) ** (1 / 12) - 1;
  const baseMonths = opened && start ? monthsBetween(opened, start) : 0;

  const makePoint = (y, val, dep) => {
    const roundedVal = Math.round(val);
    const gains = roundedVal - dep;
    const age = (baseMonths + y * 12) / 12;
    const taxRate = peaTax(age);
    const tax = Math.round(Math.max(0, gains) * taxRate / 100);
    const net = roundedVal - tax;
    const deflator = (1 + inflation / 100) ** y;
    return {
      year: y,
      value: roundedVal,
      deposits: dep,
      gains,
      age,
      taxRate,
      tax,
      net,
      real: Math.round(roundedVal / deflator),
      netReal: Math.round(net / deflator),
      capped: dep >= PEA.cap,
    };
  };

  let v = value;
  let d = deposits;
  const points = [makePoint(0, v, d)];
  for (let k = 1; k <= years * 12; k++) {
    const add = Math.max(0, Math.min(monthly, PEA.cap - d));
    v = (v + add) * (1 + monthlyRate);
    d += add;
    if (k % 12 === 0) points.push(makePoint(k / 12, v, d));
  }
  const final = points.at(-1);
  return {
    points,
    final,
  };
}
