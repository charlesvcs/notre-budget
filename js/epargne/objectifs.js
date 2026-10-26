/**
 * Objectifs d'investissement face aux stratégies — fonctions pures.
 *
 * Une stratégie répartit l'argent entre une poche sûre (livrets, au taux du Livret A,
 * sans impôt) et une poche actions (ETF dans un PEA, frais déduits). Pour un objectif
 * (montant visé à une échéance), on projette mois par mois chaque stratégie avec le
 * montant de départ et le versement mensuel, puis on retire les prélèvements dus sur les
 * gains des actions au retrait. On en tire : la valeur nette à l'échéance, l'écart avec
 * l'objectif, le versement mensuel nécessaire, et la perte possible si une année comme
 * 2008 (près de −40 % pour les actions mondiales) survenait juste avant l'échéance.
 */
import {
  PEA, globalAverage, monthsBetween, peaTax, portfolio,
} from './pea.js';

export const STRATEGIES = [
  { id: 'livrets', name: 'Livrets', equity: 0, text: 'Livret A et LEP : disponible à tout moment, sans risque ni impôt.' },
  { id: 'prudente', name: 'Prudente', equity: 0.25, text: '25 % d\'actions mondiales, 75 % sur livrets.' },
  { id: 'equilibree', name: 'Équilibrée', equity: 0.5, text: 'Moitié actions mondiales, moitié livrets.' },
  { id: 'dynamique', name: 'Dynamique', equity: 1, text: '100 % actions mondiales (ETF dans un PEA).' },
];
export const strategyById = new Map(STRATEGIES.map((s) => [s.id, s]));

/** Chute des actions retenue pour juger le risque : 2008, près de −40 % pour les actions mondiales. */
export const CRASH = 0.4;

/**
 * Stratégie la plus souvent conseillée selon le temps restant : en dessous de 3 ans,
 * l'argent doit rester disponible ; au-delà de 8 ans, les actions ont le temps de se refaire.
 */
export function suggestedStrategy(years) {
  if (years < 3) return 'livrets';
  if (years < 5) return 'prudente';
  if (years < 8) return 'equilibree';
  return 'dynamique';
}

/**
 * Projection d'une stratégie sur `months` mois.
 * @param {object} o
 * @param {number} o.start  montant de départ (centimes)
 * @param {number} o.monthly  versement mensuel (centimes), en début de mois
 * @param {number} o.equity  part des actions (0 à 1)
 * @param {number} o.equityRate  rendement annuel des actions, frais déduits (fraction)
 * @param {number} o.safeRate  rendement annuel des livrets (fraction)
 * @param {number} [o.peaAge]  âge (en mois) du PEA au départ ; un PEA ouvert aujourd'hui sinon
 */
export function projectStrategy({ start, monthly, months, equity, equityRate, safeRate, peaAge = 0 }) {
  const rate = (r) => (1 + r) ** (1 / 12) - 1;
  const re = rate(equityRate);
  const rs = rate(safeRate);
  let safe = start * (1 - equity);
  let stocks = start * equity;
  let paidIn = stocks;
  for (let k = 0; k < months; k++) {
    safe = (safe + monthly * (1 - equity)) * (1 + rs);
    stocks = (stocks + monthly * equity) * (1 + re);
    paidIn += monthly * equity;
  }
  const gains = Math.max(0, stocks - paidIn);
  const taxRate = equity > 0 ? peaTax((peaAge + months) / 12) : 0;
  const tax = gains * taxRate / 100;
  const value = safe + stocks;
  return {
    value: Math.round(value),
    deposits: Math.round(start + monthly * months),
    tax: Math.round(tax),
    taxRate,
    net: Math.round(value - tax),
    crash: Math.round(stocks * CRASH),
    capped: start * equity + monthly * equity * months > PEA.cap,
  };
}

/** Versement mensuel (centimes, arrondi à 10 € près) pour atteindre `target` net ; 0 si déjà atteint. */
export function requiredMonthly(target, params) {
  if (params.months <= 0) return null;
  if (projectStrategy({ ...params, monthly: 0 }).net >= target) return 0;
  let lo = 0;
  let hi = Math.max(target, 100);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (projectStrategy({ ...params, monthly: mid }).net >= target) hi = mid; else lo = mid;
  }
  return Math.ceil(hi / 1000) * 1000;
}

/** Mois nécessaires pour atteindre `target` net avec le versement prévu (null au-delà de 50 ans). */
export function monthsToReach(target, params) {
  for (let m = 0; m <= 600; m++) {
    if (projectStrategy({ ...params, months: m }).net >= target) return m;
  }
  return null;
}

/**
 * Confronte un objectif à chaque stratégie.
 * @param {object} goal { target, deadline: 'YYYY-MM', saved, monthly }
 * @param {object} market { equityRate, safeRate, peaAge }
 * @param {string} month  mois courant 'YYYY-MM'
 */
export function confront(goal, market, month) {
  const [y1, m1] = month.split('-').map(Number);
  const [y2, m2] = goal.deadline.split('-').map(Number);
  const months = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
  const suggested = suggestedStrategy(months / 12);
  const rows = STRATEGIES.map((s) => {
    const params = { start: goal.saved, monthly: goal.monthly, months, equity: s.equity, equityRate: market.equityRate, safeRate: market.safeRate, peaAge: market.peaAge };
    const result = projectStrategy(params);
    const reach = result.net >= goal.target ? null : monthsToReach(goal.target, params);
    return {
      strategy: s,
      ...result,
      gap: result.net - goal.target,
      reached: result.net >= goal.target,
      needed: requiredMonthly(goal.target, params),
      reachIn: reach,
      suggested: s.id === suggested,
    };
  });
  return { months, years: months / 12, suggested, rows };
}

/** Frais des ETF retenus quand aucun PEA n'est saisi (ETF monde éligibles au PEA), en %. */
export const DEFAULT_TER = 0.2;

export const EQUITY_CHOICES = [
  { id: 'prudent', label: 'Actions à 5 %', text: '5 % par an pour les actions, une hypothèse prudente' },
  { id: 'passe', label: 'Actions comme les 10 dernières années', text: 'le rendement moyen des indices mondiaux sur 10 ans' },
];

/**
 * Hypothèses de marché des stratégies : actions (frais de vos ETF déduits, sinon 0,2 %),
 * livrets au taux du Livret A, âge du plus ancien PEA (pour la fiscalité au retrait).
 * @param {object} o { accounts, annual, equity: 'prudent' | 'passe', livretA (fraction), month 'YYYY-MM' }
 */
export function marketAssumptions({ accounts = [], annual, equity = 'prudent', livretA, month }) {
  const pfs = accounts.map((a) => portfolio(a, annual));
  const value = pfs.reduce((s, p) => s + p.value, 0);
  const ter = value > 0 ? pfs.reduce((s, p) => s + p.ter * p.value, 0) / value : DEFAULT_TER;
  const gross = equity === 'passe' ? globalAverage(10, annual).cagr : 0.05;
  const peaAge = accounts.length ? Math.max(...accounts.map((a) => monthsBetween(a.opened, month))) : 0;
  return { equity, equityRate: gross - ter / 100, gross, ter, safeRate: livretA, peaAge, hasPea: accounts.length > 0 };
}
