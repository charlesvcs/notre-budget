/**
 * Règles et barèmes des livrets réglementés (Livret A, LEP).
 *
 * Les taux sont fixés par l'État (révision au 1er février et au 1er août) et
 * l'inflation est publiée par l'INSEE vers le 15 de chaque mois : l'app ne va
 * rien chercher sur Internet, ces valeurs sont livrées ici et complétables
 * dans l'écran « Épargne » (réglages livretRates et inflation).
 */

export const PRODUCTS = Object.freeze({
  livretA: { id: 'livretA', name: 'Livret A', cap: 2_295_000, keywords: ['LIVRET A', 'LIV A'] },
  lep: { id: 'lep', name: 'LEP', cap: 1_000_000, keywords: ['LEP', 'EPARGNE POPULAIRE'] },
});

/** Couleur bonbon de chaque livret (pastille, rails, courbes). */
export const LIVRET_COLORS = { livretA: 'var(--series-1)', lep: 'var(--series-2)' };

/** Taux nets en %, par date d'effet. Sources : Journal officiel, Banque de France. */
export const OFFICIAL_RATES = [
  { from: '2020-02-01', livretA: 0.5, lep: 1.0 },
  { from: '2022-02-01', livretA: 1.0, lep: 2.2 },
  { from: '2022-08-01', livretA: 2.0, lep: 4.6 },
  { from: '2023-02-01', livretA: 3.0, lep: 6.1 },
  { from: '2023-08-01', livretA: 3.0, lep: 6.0 },
  { from: '2024-02-01', livretA: 3.0, lep: 5.0 },
  { from: '2024-08-01', livretA: 3.0, lep: 4.0 },
  { from: '2025-02-01', livretA: 2.4, lep: 3.5 },
  { from: '2025-08-01', livretA: 1.7, lep: 2.7 },
  { from: '2026-02-01', livretA: 1.5, lep: 2.5 },
  { from: '2026-08-01', livretA: 1.7, lep: 2.5 },
];

/** Inflation sur un an (indice des prix à la consommation, INSEE, résultat définitif). */
export const OFFICIAL_INFLATION = { rate: 3.1, month: '2026-09' };

/**
 * Autres mesures de l'inflation sur un an, même mois (INSEE, Informations rapides n° 247) :
 * IPCH = indice harmonisé européen (celui de la cible de 2 % de la BCE),
 * sous-jacente = hors prix les plus volatils (énergie, produits frais, tarifs publics).
 */
export const INFLATION_INDICES = { month: '2026-09', ipch: 3.4, core: 1.5 };

/** Inflation moyenne annuelle (IPC, INSEE). */
export const ANNUAL_INFLATION = { 2020: 0.5, 2021: 1.6, 2022: 5.2, 2023: 4.9, 2024: 2.0, 2025: 0.9 };

/**
 * Placements sans risque de référence, pour comparer.
 *  - Fonds euros de l'assurance-vie : rendement moyen 2025, net de frais de gestion,
 *    avant prélèvements sociaux (ACPR / France Assureurs).
 *  - €STR : taux interbancaire au jour le jour de la zone euro (BCE), proche de ce que
 *    rapportent un compte à terme ou un fonds monétaire, imposés au prélèvement forfaitaire.
 */
export const BENCHMARKS = {
  fondsEuros: { rate: 2.6, year: 2025 },
  estr: { rate: 2.44, date: '2026-10-21' },
};

/**
 * Fiscalité 2026 des placements imposés (LFSS 2026) : prélèvement forfaitaire unique de
 * 31,4 % (12,8 % d'impôt + 18,6 % de prélèvements sociaux) ; l'assurance-vie reste à
 * 17,2 % de prélèvements sociaux. Livret A et LEP : aucun impôt ni prélèvement.
 */
export const TAX = { pfu: 31.4, socialAssuranceVie: 17.2 };

/**
 * Valeurs de référence pour les calculs : celles récupérées automatiquement
 * quand elles existent, sinon celles livrées avec l'app.
 * @param {object|null} official  réglage « donneesOfficielles » (voir live-data.js)
 */
export function referenceData(official) {
  const insee = official?.insee;
  return {
    indices: {
      month: insee?.indices?.month ?? INFLATION_INDICES.month,
      ipch: insee?.indices?.ipch ?? INFLATION_INDICES.ipch,
      core: insee?.indices?.core ?? INFLATION_INDICES.core,
    },
    annual: { ...ANNUAL_INFLATION, ...insee?.annual },
    benchmarks: { fondsEuros: BENCHMARKS.fondsEuros, estr: official?.estr ?? BENCHMARKS.estr },
  };
}

/** Épargne de précaution : fourchette la plus citée, en mois de dépenses courantes. */
export const SAFETY_MONTHS = { min: 3, max: 6 };

/**
 * Barème complet : taux livrés avec l'app, puis taux récupérés automatiquement,
 * puis taux saisis (à date égale, le plus récent de ces trois l'emporte ; une
 * date future vaut hypothèse).
 */
export function mergeRates(userRates = [], autoRates = []) {
  const byDate = new Map(OFFICIAL_RATES.map((r) => [r.from, { ...r, source: 'officiel' }]));
  for (const r of autoRates) byDate.set(r.from, { ...byDate.get(r.from), ...r, source: 'auto' });
  for (const r of userRates) byDate.set(r.from, { ...byDate.get(r.from), ...r, source: 'saisi' });
  return [...byDate.values()].sort((a, b) => a.from.localeCompare(b.from));
}

/** Taux (en %) en vigueur à une date ISO ; avant le barème, le premier taux connu. */
export function rateOn(rates, product, iso) {
  let rate = null;
  for (const r of rates) {
    if (r[product] == null) continue;
    if (r.from > iso && rate != null) break;
    rate = r[product];
  }
  return rate ?? 0;
}

/** Date d'effet du taux en vigueur, et prochaine révision (barème, sinon 1er février / 1er août). */
export function rateWindow(rates, product, iso) {
  const known = rates.filter((r) => r[product] != null);
  const since = [...known].reverse().find((r) => r.from <= iso)?.from ?? null;
  const next = known.find((r) => r.from > iso);
  if (next) return { since, next: next.from, nextRate: next[product] };
  const [y, m] = iso.split('-').map(Number);
  const revision = m < 2 ? `${y}-02-01` : m < 8 ? `${y}-08-01` : `${y + 1}-02-01`;
  return { since, next: revision, nextRate: null };
}
