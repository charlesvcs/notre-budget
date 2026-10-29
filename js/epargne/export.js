/**
 * Export complet de l'application « Mon Budget » en classeur Excel (.xlsx) :
 * - Vue d'ensemble exécutive (Budget + Patrimoine + Trajectoire + Guide des onglets)
 * - Budget & Enveloppes du mois (Reste à vivre, catégories & enveloppes, échéances mensualisées, principaux commerçants)
 * - Suivi Mensuel complet (Revenus, Dépenses, Épargne, Reste à vivre et détail par catégorie pour tous les mois importés)
 * - Journal des Opérations (toutes les transactions avec libellé nettoyé, libellé brut, catégorie, profil, formules SUMIF)
 * - Bilan Patrimoine consolidé (Livrets + PEA, répartition explicite Fonds investis vs Intérêts composés & plus-values)
 * - Projection 25 ans (modèle interactif piloté par formules Excel modifiables : Fonds investis cumulés vs Intérêts composés nets)
 * - PEA détaillés (lignes ETF, comparaison des 3 scénarios, échéancier annuel sur 25 ans Fonds investis vs Intérêts composés + graphique empilé)
 * - Livrets & Sécurité (synthèse face à l'inflation, matelas de sécurité, détail des livrets, bulletin de santé, comparateur, projection 20 ans)
 * - Mouvements Épargne (virements affectés aux livrets et mouvements à rattacher)
 * - Objectifs & Stratégies (projets de vie confrontés aux 4 stratégies + grille de référence)
 * - Marchés, Fiscalité & Taux (indices boursiers depuis 2016, fiscalité PEA vs CTO, historique depuis 2020, barème des taux, méthode & sources)
 */
import { Workbook, colName, excelDate } from '../export/xlsx-writer.js';
import { OFF_BUDGET_KINDS, PROFILES, STORES, TRANSACTION_TYPES } from '../db/schema.js';
import {
  getActiveProfiles, getAll, getBudgets, getCategories, getLatestMonth, getLivrets, getProfileNames, getSetting,
} from '../db/database.js';
import { ALL_PROFILES, addMonths, buildMonthModel, displayLabel } from '../dashboard/month-model.js';
import { benchmarks, doublingYears, grossEquivalent, history, monthlyExpenses, safetyNet } from './indicators.js';
import {
  INDEX_RETURNS, PEA, SCENARIOS, indexById, monthsBetween, peaTax, portfolio, projectPea, scenarioRate, yearsOf,
} from './pea.js';
import { CRASH, EQUITY_CHOICES, STRATEGIES, confront, marketAssumptions } from './objectifs.js';
import { PRODUCTS, SAFETY_MONTHS, TAX, currentInflation, mergeRates, rateOn, referenceData } from './livret-rates.js';
import { buildLivretModel, matchFlows, summarize } from './livret-model.js';
import { INSEE_SERIES, SOURCES } from './live-data.js';
import { bulletinItems } from './widgets.js';
import { longDate, monthLong } from './format.js';

// Palette patrimoniale (hex sans #)
const COBALT = '1D4ED8';
const TEAL = '0D9488';
const EMERALD = '15803D';
const AMBER = 'D97706';
const SLATE = '64748B';
const INK = '141A24';

const HOLDERS = [PROFILES.ME, PROFILES.PARTNER];
const eur = (cents) => Math.round(cents ?? 0) / 100;
const frac = (pct) => (pct ?? 0) / 100;

const INVEST_SOURCES = [
  ['MSCI World (EUR), performances nettes', 'https://www.msci.com/documents/10199/890dd84d-3750-4656-87f2-1229ed5a5d6e'],
  ['MSCI ACWI (EUR), performances nettes', 'https://www.msci.com/documents/10199/1ee87397-6313-4f46-87ae-6761f666558e'],
  ['CAC 40 dividendes réinvestis', 'https://www.zonebourse.com/cours/indice/CAC-40-DIVIDENDES-REINVES-3869660/cotations/'],
  ['S&P 500 en euros, dividendes réinvestis', 'https://www.eupersonalfinance.eu/articles/average-annual-return-sp500'],
  ['Fiscalité du PEA en 2026 (CSG à 10,6 %)', 'https://placement.meilleurtaux.com/bourse/actualites/2025-decembre/csg-10-6-impact-pea-avant-apres-5-ans.html'],
];

const INVEST_METHOD = [
  ['Fonds investis vs Intérêts composés', 'Dans chaque tableau et graphique du classeur, le capital est décomposé explicitement entre les « Fonds investis cumulés » (vos versements initiaux et mensuels) et les « Intérêts composés & plus-values gagnés » (gains générés par la capitalisation des intérêts et dividendes réinvestis).'],
  ['Rendement moyen des indices', 'Taux annuel composé : (Π (1 + performance annuelle))^(1/n) − 1, en euros, dividendes réinvestis.'],
  ['Imposition d\'un PEA', `Seule la part des gains (intérêts composés et plus-values) est taxée lors d'un retrait : ${PEA.taxBefore.toLocaleString('fr-FR')} % avant ${PEA.years} ans, puis ${PEA.taxAfter.toLocaleString('fr-FR')} % (prélèvements sociaux uniquement) après ${PEA.years} ans.`],
  ['Objectifs face aux stratégies', `Projection mois par mois : poche livrets au taux du Livret A, poche actions au rendement retenu moins les frais des ETF ; versements en début de mois ; gains des actions imposés au retrait comme dans un PEA. Perte « si 2008 » : ${CRASH * 100} % de la poche actions à l'échéance.`],
  ['Rente mensuelle potentielle (4 %)', 'Règle patrimoniale dite des 4 % (étude Trinity) : retrait annuel de 4 % du capital net disponible divisé par 12 mois, permettant d\'estimer le revenu mensuel soutenable à long terme sans épuiser le capital.'],
];

/**
 * Construit le classeur Excel complet restituant l'intégralité des données du site
 * (Budget du mois, Suivi mensuel, Opérations, Patrimoine, Projection 25 ans, PEA, Livrets, Objectifs, Marchés & Fiscalité).
 */
export async function buildFullWorkbook(overrides = {}) {
  const today = overrides.today ?? new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  const [
    allTransactions,
    categories,
    budgets,
    rawSkips,
    livretsRaw,
    assignRaw,
    peaRaw,
    goalsRaw,
    inflationRaw,
    official,
    userRates,
    names,
    activeProfiles,
    latestMonth,
  ] = await Promise.all([
    getAll(STORES.TRANSACTIONS),
    getCategories({ includeArchived: true }),
    getBudgets(),
    getSetting('recurringSkips'),
    getLivrets(),
    getSetting('livretAssign'),
    getSetting('peaAccounts'),
    getSetting('objectifs'),
    getSetting('inflation'),
    getSetting('donneesOfficielles'),
    getSetting('livretRates'),
    getProfileNames(),
    getActiveProfiles(),
    getLatestMonth(),
  ]);

  const profileNames = { ...names, ...(overrides.names ?? {}) };
  const inflation = overrides.inflation ?? currentInflation(inflationRaw, official);
  const ref = overrides.ref ?? referenceData(official);
  const rates = overrides.rates ?? mergeRates(userRates ?? [], official?.livrets?.rates ?? []);
  const peaAccounts = overrides.pea ?? peaRaw ?? [];
  const goals = overrides.goals ?? goalsRaw ?? [];
  const assign = assignRaw ?? {};
  const skips = new Set(Array.isArray(rawSkips) ? rawSkips : []);

  const livrets = [...(livretsRaw ?? [])].sort((a, b) => HOLDERS.indexOf(a.profile) - HOLDERS.indexOf(b.profile)
    || Object.keys(PRODUCTS).indexOf(a.product) - Object.keys(PRODUCTS).indexOf(b.product));

  const savingsCats = new Set(categories.filter((c) => c.kind === 'epargne').map((c) => c.id));
  const candidateMap = new Map();
  for (const tx of allTransactions) {
    if (savingsCats.has(tx.categoryId) || assign[tx.id]) candidateMap.set(tx.id, tx);
  }
  const { byLivret: flows, unmatched } = matchFlows([...candidateMap.values()], livrets, assign, savingsCats);

  const livretModels = livrets.map((livret) => buildLivretModel({
    livret,
    flows: flows.get(livret.id) ?? [],
    rates,
    today,
    inflation: inflation.rate,
    horizon: 20,
  }));
  const livretSummary = summarize(livretModels, inflation.rate);

  const holdersSet = new Set([
    ...activeProfiles.filter((p) => HOLDERS.includes(p)),
    ...livrets.map((l) => l.profile),
  ]);
  const recentMonths = [1, 2, 3, 4].map((n) => addMonths(currentMonth, -n));
  const recentTx = allTransactions.filter((t) => recentMonths.includes(t.month));
  const expensesInfo = monthlyExpenses(recentTx, categories, holdersSet, currentMonth);
  const expenses = expensesInfo?.average ? expensesInfo : null;
  const plannedMonthly = livretModels.reduce((s, m) => s + m.plan.monthly, 0);
  const safety = safetyNet(livretSummary.balance, expenses, plannedMonthly);

  const sameHolders = new Set(livrets.map((l) => l.profile)).size <= 1;
  const titleOf = (idx) => {
    const l = livrets[idx];
    if (!l) return `Livret #${idx + 1}`;
    return sameHolders ? PRODUCTS[l.product].name : `${PRODUCTS[l.product].name} · ${profileNames[l.profile] ?? l.profile}`;
  };

  const livretARate = rateOn(rates, 'livretA', today) / 100;
  const market = overrides.market ?? marketAssumptions({
    accounts: peaAccounts,
    annual: ref.annual,
    equity: overrides.equity ?? 'prudent',
    livretA: livretARate,
    month: currentMonth,
  });

  // Mois de référence pour l'onglet Budget & Enveloppes (mois affiché ou dernier mois importé)
  const refMonth = overrides.month ?? latestMonth ?? currentMonth;
  const refProfile = overrides.profile ?? ALL_PROFILES;
  const monthTx = allTransactions.filter((t) => t.month === refMonth);
  const pastTx = allTransactions.filter((t) => t.month < refMonth);
  const monthModel = buildMonthModel({
    month: refMonth,
    today,
    profile: refProfile,
    transactions: monthTx,
    past: pastTx,
    categories,
    budgets,
    skips,
  });

  const ctx = {
    today,
    refMonth,
    refProfile,
    allTransactions,
    categories,
    budgets,
    skips,
    monthModel,
    livrets,
    models: livretModels,
    livretModels,
    summary: livretSummary,
    livretSummary,
    flows,
    unmatched,
    expenses,
    safety,
    rates,
    inflation,
    ref,
    official,
    pea: peaAccounts,
    peaSim: overrides.peaSim ?? null,
    goals,
    market,
    names: profileNames,
    activeProfiles,
    titleOf,
    holders: [...holdersSet].map((p) => profileNames[p] ?? p).join(' et '),
  };

  const wb = new Workbook({
    title: 'Mon Budget — Bilan Complet (Budget, Épargne & Investissements)',
    author: 'Mon Budget',
  });

  // 1. Vue d'ensemble (Tableau de bord exécutif et sommaire)
  addOverviewSheet(wb, ctx);

  // 2. Budget & Enveloppes du mois
  addBudgetMonthSheet(wb, ctx);

  // 3. Suivi Mensuel complet (Revenus, Dépenses, Épargne et toutes les catégories mois par mois)
  addMonthlyHistorySheet(wb, ctx);

  // 4. Journal complet des Opérations
  addTransactionsSheet(wb, ctx);

  // 5. Bilan Patrimoine & 6. Projection 25 ans
  addPatrimoineSheets(wb, ctx);

  // 7. Feuilles détaillées par PEA (ETF, scénarios, échéancier 25 ans Fonds investis vs Intérêts composés)
  addPeaDetailSheets(wb, ctx);

  // 8. Livrets & Sécurité (Synthèse, Matelas, Livrets, Bulletin, Comparateur, Projection 20 ans)
  addLivretsAndSafetySheet(wb, ctx);

  // 9. Mouvements d'Épargne
  addSavingsMovementsSheet(wb, ctx);

  // 10. Objectifs & Stratégies
  addGoalsAndStrategiesSheet(wb, ctx);

  // 11. Marchés, Fiscalité & Taux (Indices boursiers, Fiscalité PEA vs CTO, Historique 2020, Taux, Sources)
  addMarketsTaxAndRatesSheet(wb, ctx);

  return wb;
}

/**
 * 1. Feuille « Vue d'ensemble » : synthèse exécutive de tout le site sur une seule page.
 */
function addOverviewSheet(wb, ctx) {
  const sh = wb.addSheet('Vue d\'ensemble', { widths: [38, 20, 22, 22, 22, 22, 24], freeze: 4 });
  const { monthModel, livretSummary, inflation } = ctx;

  // Calculs préliminaires PEA & Patrimoine
  const currentMonth = ctx.today.slice(0, 7);
  let peaGrossCents = 0;
  let peaDepCents = 0;
  let peaTaxCents = 0;
  let peaMonthlyCents = 0;
  ctx.pea.forEach((acc) => {
    const pf = portfolio(acc, ctx.ref.annual);
    const sim = ctx.peaSim?.(acc.id) ?? { monthly: acc.monthly ?? 0, scenario: 'prudent' };
    const ageYears = monthsBetween(acc.opened, currentMonth) / 12;
    const taxRate = peaTax(ageYears);
    const gain = Math.max(0, pf.value - pf.deposits);
    const tax = Math.round(gain * taxRate / 100);
    peaGrossCents += pf.value;
    peaDepCents += pf.deposits;
    peaTaxCents += tax;
    peaMonthlyCents += sim.monthly ?? acc.monthly ?? 0;
  });
  const peaNetCents = peaGrossCents - peaTaxCents;
  const peaGainGrossCents = peaGrossCents - peaDepCents;
  const peaGainNetCents = peaNetCents - peaDepCents;

  const livretGrossCents = livretSummary.balance;
  const livretInterestCents = ctx.models.reduce((s, m) => s + (m.interestEarned ?? 0), 0);
  const livretDepCents = Math.max(0, livretGrossCents - livretInterestCents);
  const livretMonthlyCents = ctx.models.reduce((s, m) => s + (m.plan?.monthly ?? 0), 0);

  const totalGrossCents = livretGrossCents + peaGrossCents;
  const totalDepCents = livretDepCents + peaDepCents;
  const totalGainNetCents = livretInterestCents + peaGainNetCents;
  const totalNetCents = livretGrossCents + peaNetCents;
  const totalMonthlyCents = livretMonthlyCents + peaMonthlyCents;

  sh.row([{ v: 'MON BUDGET — SYNTHÈSE GÉNÉRALE DU FOYER (BUDGET, ÉPARGNE & INVESTISSEMENTS)', s: 'title' }]);
  sh.merge('A1:G1');
  sh.row([{
    v: `Bilan arrêté au ${longDate(ctx.today)} · Mois budgétaire de référence : ${monthLong(ctx.refMonth)} · Inflation retenue : ${inflation.rate.toLocaleString('fr-FR')} % (${monthLong(inflation.month)}).`,
    s: 'note',
  }]);
  sh.merge('A2:G2');
  sh.blank();

  // Bloc A : Synthèse du Budget du mois
  sh.row(['1. SYNTHÈSE BUDGÉTAIRE DU MOIS DE RÉFÉRENCE (' + monthLong(ctx.refMonth).toUpperCase() + ')', 'Montant', 'Part des revenus', 'Repère & explication', '', '', ''], 'header');
  const incEur = eur(monthModel.income + monthModel.upcomingIncome);
  const spentEur = eur(monthModel.spent);
  const upcEur = eur(monthModel.upcomingTotal);
  const savedEur = eur(monthModel.saved);
  const remEur = eur(monthModel.remaining);

  const rInc = sh.row([
    { v: 'Revenus du mois (encaissés + attendus)', s: 'bold' },
    { v: incEur, s: 'euroBold' },
    { v: incEur > 0 ? 1 : 0, s: 'percent' },
    `Dont ${eur(monthModel.income).toLocaleString('fr-FR')} € déjà encaissés et ${eur(monthModel.upcomingIncome).toLocaleString('fr-FR')} € attendus`,
  ]);
  const rSpent = sh.row([
    'Dépenses déjà passées (hors épargne et virements internes)',
    { v: spentEur, s: 'euro' },
    { f: `IF(B${rInc}>0,B${rInc - 1 + 1}/B${rInc},0)`.replace(`${rInc - 1 + 1}`, `${rInc + 1}`), v: incEur > 0 ? spentEur / incEur : 0, s: 'percent' },
    `${monthModel.operations.filter((o) => !o.offBudget && o.type === 'sortie').length} opérations de dépenses sur le mois`,
  ]);
  const rUpc = sh.row([
    'Échéances mensualisées restant à passer ce mois-ci',
    { v: upcEur, s: 'euro' },
    { f: `IF(B${rInc}>0,B${rSpent + 1}/B${rInc},0)`, v: incEur > 0 ? upcEur / incEur : 0, s: 'percent' },
    `${monthModel.upcoming.filter((u) => u.type === 'sortie').length} prélèvements ou charges fixes attendus d'ici la fin du mois`,
  ]);
  const rSav = sh.row([
    'Épargne nette mise de côté ce mois-ci',
    { v: savedEur, s: 'euroGain' },
    { f: `IF(B${rInc}>0,B${rUpc + 1}/B${rInc},0)`, v: incEur > 0 ? savedEur / incEur : 0, s: 'percentGain' },
    'Versements sur livrets et PEA moins retraits éventuels',
  ]);
  sh.row([
    { v: 'Reste à vivre disponible jusqu\'à la fin du mois', s: 'boldTotal' },
    { f: `B${rInc}-B${rSpent}-B${rUpc}-B${rSav}`, v: remEur, s: 'euroTotal' },
    { f: `IF(B${rInc}>0,(B${rInc}-B${rSpent}-B${rUpc}-B${rSav})/B${rInc},0)`, v: incEur > 0 ? remEur / incEur : 0, s: 'percentBold' },
    'Revenus − Dépenses passées − Échéances à venir − Épargne nette',
  ]);
  sh.blank();

  // Bloc B : Photographie du Patrimoine (Fonds investis vs Intérêts composés)
  sh.row([
    '2. BILAN DU PATRIMOINE : FONDS INVESTIS VS INTÉRÊTS COMPOSÉS GAGNÉS',
    'Fonds investis (versements)',
    'Intérêts composés & plus-values bruts',
    'Valeur brute actuelle',
    'Fiscalité latente',
    'Intérêts composés nets',
    'Valeur nette disponible',
  ], 'header');

  const rLiv = sh.row([
    { v: `Épargne sécurisée (${ctx.livrets.length} livret${ctx.livrets.length > 1 ? 's' : ''})`, s: 'bold' },
    { v: eur(livretDepCents), s: 'euro' },
    { v: eur(livretInterestCents), s: 'euroGain' },
    { f: `B${sh.rows.length + 1}+C${sh.rows.length + 1}`, v: eur(livretGrossCents), s: 'euroBold' },
    { v: 0, s: 'euro' },
    { f: `C${sh.rows.length + 1}-E${sh.rows.length + 1}`, v: eur(livretInterestCents), s: 'euroGain' },
    { f: `D${sh.rows.length + 1}-E${sh.rows.length + 1}`, v: eur(livretGrossCents), s: 'euroBold' },
  ]);
  const rPea = sh.row([
    { v: `Investissements Actions (${ctx.pea.length} PEA)`, s: 'bold' },
    { v: eur(peaDepCents), s: 'euro' },
    { v: eur(peaGainGrossCents), s: 'euroGain' },
    { f: `B${rLiv + 1}+C${rLiv + 1}`, v: eur(peaGrossCents), s: 'euroBold' },
    { v: eur(peaTaxCents), s: 'euro' },
    { f: `C${rLiv + 1}-E${rLiv + 1}`, v: eur(peaGainNetCents), s: 'euroGain' },
    { f: `D${rLiv + 1}-E${rLiv + 1}`, v: eur(peaNetCents), s: 'euroBold' },
  ]);
  const rPatTot = sh.row([
    { v: 'PATRIMOINE TOTAL CONSOLIDÉ', s: 'boldTotal' },
    { f: `SUM(B${rLiv}:B${rPea})`, v: eur(totalDepCents), s: 'euroTotal' },
    { f: `SUM(C${rLiv}:C${rPea})`, v: eur(livretInterestCents + peaGainGrossCents), s: 'euroTotal' },
    { f: `SUM(D${rLiv}:D${rPea})`, v: eur(totalGrossCents), s: 'euroTotal' },
    { f: `SUM(E${rLiv}:E${rPea})`, v: eur(peaTaxCents), s: 'euroTotal' },
    { f: `SUM(F${rLiv}:F${rPea})`, v: eur(totalGainNetCents), s: 'euroTotal' },
    { f: `SUM(G${rLiv}:G${rPea})`, v: eur(totalNetCents), s: 'euroTotal' },
  ]);
  sh.row([
    { v: 'Répartition du patrimoine net (%)', s: 'bold' },
    { f: `IF(G${rPatTot}>0,B${rPatTot}/G${rPatTot},0)`, v: totalNetCents > 0 ? totalDepCents / totalNetCents : 0, s: 'percentBold' },
    { v: '', s: 'default' },
    { v: '', s: 'default' },
    { v: '', s: 'default' },
    { f: `IF(G${rPatTot}>0,F${rPatTot}/G${rPatTot},0)`, v: totalNetCents > 0 ? totalGainNetCents / totalNetCents : 0, s: 'percentGain' },
    { v: 1, s: 'percentBold' },
  ]);
  sh.row([
    { v: 'Effort d\'épargne mensuel programmé (Livrets + PEA)', s: 'bold' },
    { v: eur(totalMonthlyCents), s: 'euroBold' },
    `Livrets : ${eur(livretMonthlyCents).toLocaleString('fr-FR')} €/mois`,
    `PEA : ${eur(peaMonthlyCents).toLocaleString('fr-FR')} €/mois`,
    `Soit ${(eur(totalMonthlyCents) * 12).toLocaleString('fr-FR')} € versés / an`,
    'Rente 4 % immédiate :',
    { f: `G${rPatTot}*0.04/12`, v: eur(totalNetCents) * 0.04 / 12, s: 'euroBold' },
  ]);
  sh.blank();

  // Bloc C : Guide des feuilles du classeur
  sh.row(['3. GUIDE DES ONGLETS DE CE CLASSEUR EXCEL', 'Contenu détaillé et usage au quotidien', '', '', '', '', ''], 'header');
  const guide = [
    ['1. Vue d\'ensemble', 'Ce tableau de bord exécutif : budget du mois, répartition Fonds investis / Intérêts composés et sommaire.'],
    ['2. Budget & Enveloppes', `Détail complet du mois (${monthLong(ctx.refMonth)}) : équation du reste à vivre, toutes les enveloppes par catégorie (dont Linges, Beauté, Virements, Déjeuners, Sport, Loisirs), échéances mensualisées et principaux commerçants.`],
    ['3. Suivi Mensuel', 'Historique complet mois par mois : revenus, dépenses, épargne, taux d\'épargne et matrice complète des dépenses par catégorie avec moyennes et totaux.'],
    ['4. Journal Opérations', `Toutes vos opérations bancaires (${ctx.allTransactions.length} lignes) avec libellé lisible, libellé bancaire brut, catégorie, profil et formules SUMIF.`],
    ['5. Bilan Patrimoine', 'Photographie détaillée de chaque livret et de chaque PEA : Fonds investis, Intérêts composés bruts et nets, fiscalité latente, plafonds et graphique empilé.'],
    ['6. Projection 25 ans', 'Simulateur patrimonial sur 25 ans entièrement piloté par formules Excel modifiables : suivez année par année vos Fonds investis cumulés et vos Intérêts composés nets gagnés.'],
    ['7. PEA (1 onglet par plan)', 'Portefeuille ETF détaillé (ISIN, frais TER, poids), comparaison des 3 scénarios et échéancier annuel sur 25 ans avec graphique empilé Fonds investis + Intérêts composés.'],
    ['8. Livrets & Sécurité', 'Livrets face à l\'inflation, matelas de sécurité en mois de dépenses, bulletin de santé, comparateur des placements sans risque et projection sur 20 ans.'],
    ['9. Mouvements Épargne', 'Historique des versements et retraits rattachés à vos livrets ainsi que les virements d\'épargne restant à affecter.'],
    ['10. Objectifs & Stratégies', 'Vos projets de vie confrontés aux 4 stratégies d\'allocation (Livrets, Prudente, Équilibrée, Dynamique) et résistance aux krachs boursiers.'],
    ['11. Marchés, Fiscalité & Taux', 'Performances annuelles des indices (MSCI World, S&P 500, CAC 40) depuis 2016, fiscalité PEA vs Compte-titres, historique depuis 2020, barème officiel des livrets et méthodologie.'],
  ];
  for (const [tab, desc] of guide) {
    const r = sh.row([{ v: tab, s: 'bold' }, desc, '', '', '', '', '']);
    sh.merge(`B${r}:G${r}`);
  }
}

/**
 * 2. Feuille « Budget & Enveloppes » : restitue toutes les informations de l'onglet « Mois ».
 */
function addBudgetMonthSheet(wb, ctx) {
  const { monthModel, categories, budgets, names } = ctx;
  const sh = wb.addSheet('Budget & Enveloppes', { widths: [28, 20, 16, 16, 16, 14, 18, 16, 16, 14], freeze: 4 });
  const catById = new Map(categories.map((c) => [c.id, c]));

  sh.row([{ v: `BUDGET & ENVELOPPES DU MOIS — ${monthLong(ctx.refMonth).toUpperCase()}`, s: 'title' }]);
  sh.merge('A1:J1');
  sh.row([{
    v: `Vue : ${ctx.refProfile === ALL_PROFILES ? 'Tous les comptes' : (names[ctx.refProfile] ?? ctx.refProfile)}. Toutes les catégories de dépenses (y compris Linges, Beauté, Virements, Déjeuners, Sport, Loisirs) sont détaillées ci-dessous.`,
    s: 'note',
  }]);
  sh.merge('A2:J2');
  sh.blank();

  // Tableau 1 : Toutes les catégories de dépenses & enveloppes
  const headRow = sh.row([
    'Catégorie de dépense',
    'Groupe',
    'Dépensé ce mois (€)',
    'À venir mensualisé (€)',
    'Total engagé (€)',
    'Enveloppe / Budget (€)',
    'Disponible / Écart (€)',
    'Consommation (%)',
    'Moyenne 3 mois (€)',
    'Statut de l\'enveloppe',
  ], 'header');

  const expenseCategories = categories.filter((c) => c.kind === TRANSACTION_TYPES.EXPENSE && !c.archived);
  const modelRowById = new Map(monthModel.categories.map((r) => [r.category.id, r]));
  const firstCatRow = headRow + 1;

  expenseCategories.forEach((cat, idx) => {
    const r = firstCatRow + idx;
    const mr = modelRowById.get(cat.id);
    const spent = eur(mr?.spent ?? 0);
    const upcoming = eur(mr?.upcoming ?? 0);
    const engaged = spent + upcoming;
    const limitCents = mr?.limit ?? budgets.filter((b) => b.categoryId === cat.id).reduce((s, b) => s + b.monthlyLimit, 0);
    const hasLimit = limitCents > 0;
    const limit = hasLimit ? eur(limitCents) : null;
    const avg = mr?.average != null ? eur(mr.average) : 0;
    const groupLabel = cat.group === 'fixes' ? 'Charges fixes' : 'Dépenses courantes';
    const statusLabel = !hasLimit
      ? 'Sans plafond fixé'
      : engaged > limit
        ? 'Dépassée'
        : engaged >= limit * 0.75
          ? 'Bientôt atteinte'
          : 'Dans l\'enveloppe';

    sh.row([
      { v: cat.name, s: 'bold' },
      groupLabel,
      { v: spent, s: 'euro' },
      { v: upcoming, s: 'euro' },
      { f: `C${r}+D${r}`, v: engaged, s: 'euroBold' },
      hasLimit ? { v: limit, s: 'euro' } : { v: '', s: 'default' },
      hasLimit ? { f: `F${r}-E${r}`, v: limit - engaged, s: limit - engaged >= 0 ? 'euroGain' : 'euroBold' } : { v: '', s: 'default' },
      hasLimit ? { f: `IF(F${r}>0,E${r}/F${r},0)`, v: limit > 0 ? engaged / limit : 0, s: 'percent' } : { v: '', s: 'default' },
      { v: avg, s: 'euro' },
      statusLabel,
    ]);
  });

  const lastCatRow = firstCatRow + expenseCategories.length - 1;
  const totalSpent = eur(monthModel.spent);
  const totalUpcoming = eur(monthModel.upcomingTotal);
  const totalEngaged = totalSpent + totalUpcoming;
  const totalBudget = expenseCategories.reduce((s, cat) => {
    const mr = modelRowById.get(cat.id);
    const l = mr?.limit ?? budgets.filter((b) => b.categoryId === cat.id).reduce((sum, b) => sum + b.monthlyLimit, 0);
    return s + eur(l);
  }, 0);
  const totalAvg = expenseCategories.reduce((s, cat) => s + eur(modelRowById.get(cat.id)?.average ?? 0), 0);

  const totCatRow = sh.row([
    { v: 'Total des dépenses par catégorie', s: 'boldTotal' },
    { v: `${expenseCategories.length} catégories`, s: 'boldTotal' },
    { f: `SUM(C${firstCatRow}:C${lastCatRow})`, v: totalSpent, s: 'euroTotal' },
    { f: `SUM(D${firstCatRow}:D${lastCatRow})`, v: totalUpcoming, s: 'euroTotal' },
    { f: `SUM(E${firstCatRow}:E${lastCatRow})`, v: totalEngaged, s: 'euroTotal' },
    { f: `SUM(F${firstCatRow}:F${lastCatRow})`, v: totalBudget, s: 'euroTotal' },
    { f: `F${lastCatRow + 1}-E${lastCatRow + 1}`, v: totalBudget - totalEngaged, s: 'euroTotal' },
    { f: `IF(F${lastCatRow + 1}>0,E${lastCatRow + 1}/F${lastCatRow + 1},0)`, v: totalBudget > 0 ? totalEngaged / totalBudget : 0, s: 'percentBold' },
    { f: `SUM(I${firstCatRow}:I${lastCatRow})`, v: totalAvg, s: 'euroTotal' },
    { v: '', s: 'boldTotal' },
  ]);

  sh.blank();

  // Tableau 2 : Échéances mensualisées du mois (passées, à venir, non retrouvées)
  sh.row([
    'Échéances mensualisées & récurrentes du mois',
    'Catégorie',
    'Compte / Profil',
    'Sens',
    'Montant attendu (€)',
    'Date attendue',
    'Statut ce mois-ci',
    '',
    '',
    '',
  ], 'header');

  const allRecurring = [
    ...monthModel.upcoming.map((e) => ({ ...e, statusLabel: 'À venir d\'ici fin de mois' })),
    ...monthModel.recurringPassed.map((e) => ({ ...e, statusLabel: `Passée le ${e.matched?.date ?? e.expectedDate}` })),
    ...monthModel.missing.map((e) => ({ ...e, statusLabel: 'Date dépassée (non retrouvée)' })),
    ...monthModel.recurringSkipped.map((e) => ({ ...e, statusLabel: 'Ignorée ce mois-ci' })),
  ];

  if (allRecurring.length) {
    for (const item of allRecurring) {
      const clean = displayLabel(item.label);
      sh.row([
        { v: clean.name, s: 'bold' },
        catById.get(item.categoryId)?.name ?? item.categoryId,
        names[item.profile] ?? item.profile,
        item.type === TRANSACTION_TYPES.INCOME ? 'Rentrée' : 'Dépense',
        { v: eur(item.amount), s: 'euro' },
        { v: excelDate(item.expectedDate), s: 'date' },
        item.statusLabel,
      ]);
    }
  } else {
    sh.row([{ v: 'Aucune échéance mensualisée cochée sur les mois précédents.', s: 'note' }]);
  }

  sh.blank();

  // Tableau 3 : Principaux commerçants du mois
  sh.row(['Principaux commerçants du mois', 'Catégorie', 'Passages', 'Montant cumulé (€)', 'Part des dépenses (%)', '', '', '', '', ''], 'header');
  if (monthModel.merchants.length) {
    monthModel.merchants.forEach((m) => {
      const clean = displayLabel(m.label);
      const r = sh.rows.length + 1;
      sh.row([
        { v: clean.name, s: 'bold' },
        catById.get(m.categoryId)?.name ?? m.categoryId,
        { v: m.count, s: 'integer' },
        { v: eur(m.amount), s: 'euroBold' },
        { f: `IF($C$${totCatRow}>0,D${r}/$C$${totCatRow},0)`, v: totalSpent > 0 ? eur(m.amount) / totalSpent : 0, s: 'percent' },
      ]);
    });
  } else {
    sh.row([{ v: 'Aucune dépense enregistrée sur ce mois.', s: 'note' }]);
  }

  // Graphique comparant le Dépensé engagé et l'Enveloppe par catégorie
  const chartFromRow = sh.rows.length + 3;
  sh.chart({
    type: 'bar',
    title: `Dépenses engagées vs Enveloppes par catégorie — ${monthLong(ctx.refMonth)} (€)`,
    from: `A${chartFromRow}`,
    to: `I${chartFromRow + 22}`,
    categories: `A${firstCatRow}:A${lastCatRow}`,
    series: [
      { name: 'Total engagé ce mois (€)', ref: `E${firstCatRow}:E${lastCatRow}`, color: COBALT },
      { name: 'Enveloppe / Budget (€)', ref: `F${firstCatRow}:F${lastCatRow}`, color: AMBER },
      { name: 'Moyenne 3 mois (€)', ref: `I${firstCatRow}:I${lastCatRow}`, color: SLATE },
    ],
  });
}

/**
 * 3. Feuille « Suivi Mensuel » : historique complet de tous les mois importés
 * avec Revenus, Dépenses, Épargne, Reste à vivre, Taux d'épargne et détail de chaque catégorie de dépense.
 */
function addMonthlyHistorySheet(wb, ctx) {
  const { allTransactions, categories } = ctx;
  const catById = new Map(categories.map((c) => [c.id, c]));
  const expCats = categories.filter((c) => c.kind === TRANSACTION_TYPES.EXPENSE && !c.archived);

  // Liste triée de tous les mois présents dans la base (ou le mois courant si vide)
  const monthSet = new Set(allTransactions.map((t) => t.month));
  if (!monthSet.size) monthSet.add(ctx.refMonth);
  const months = [...monthSet].sort();

  const widths = [18, 16, 18, 16, 18, 15, 12, ...expCats.map(() => 15)];
  const sh = wb.addSheet('Suivi Mensuel', { widths, freeze: 4 });

  const lastCol = colName(6 + expCats.length);
  sh.row([{ v: 'SUIVI MENSUEL COMPLET — REVENUS, DÉPENSES, ÉPARGNE & VENTILATION PAR CATÉGORIE', s: 'title' }]);
  sh.merge(`A1:${lastCol}1`);
  sh.row([{
    v: 'Historique intégral mois par mois calculé sur vos relevés. Les colonnes de droite détaillent chaque catégorie de dépense (Logement, Courses, Déjeuners, Linges, Beauté, Sport, Loisirs, Virements…).',
    s: 'note',
  }]);
  sh.merge(`A2:${lastCol}2`);
  sh.blank();

  const headRow = sh.row([
    'Mois',
    'Revenus (€)',
    'Dépenses hors épargne (€)',
    'Épargne nette (€)',
    'Solde libre du mois (€)',
    'Taux d\'épargne (%)',
    'Nb opérations',
    ...expCats.map((c) => c.name),
  ], 'header');

  const firstMonthRow = headRow + 1;
  months.forEach((m, idx) => {
    const r = firstMonthRow + idx;
    const ops = allTransactions.filter((t) => t.month === m);
    let inc = 0;
    let exp = 0;
    let sav = 0;
    const byCat = new Map();

    for (const t of ops) {
      const kind = catById.get(t.categoryId)?.kind;
      if (kind === 'transfert') continue;
      if (kind === 'epargne') {
        sav += t.type === TRANSACTION_TYPES.EXPENSE ? t.amount : -t.amount;
      } else if (t.type === TRANSACTION_TYPES.INCOME) {
        inc += t.amount;
      } else if (t.type === TRANSACTION_TYPES.EXPENSE) {
        exp += t.amount;
        byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
      }
    }

    const incEur = eur(inc);
    const expEur = eur(exp);
    const savEur = eur(sav);
    const freeEur = incEur - expEur - savEur;
    const savRate = incEur > 0 ? (incEur - expEur) / incEur : 0;

    sh.row([
      { v: monthLong(m), s: 'bold' },
      { v: incEur, s: 'euro' },
      { f: `SUM(H${r}:${lastCol}${r})`, v: expEur, s: 'euroBold' },
      { v: savEur, s: 'euroGain' },
      { f: `B${r}-C${r}-D${r}`, v: freeEur, s: 'euroBold' },
      { f: `IF(B${r}>0,(B${r}-C${r})/B${r},0)`, v: savRate, s: 'percent' },
      { v: ops.length, s: 'integer' },
      ...expCats.map((c) => ({ v: eur(byCat.get(c.id) ?? 0), s: 'euro' })),
    ]);
  });

  const lastMonthRow = firstMonthRow + months.length - 1;
  const totRow = sh.row([
    { v: 'TOTAL PÉRIODE', s: 'boldTotal' },
    { f: `SUM(B${firstMonthRow}:B${lastMonthRow})`, v: 0, s: 'euroTotal' },
    { f: `SUM(C${firstMonthRow}:C${lastMonthRow})`, v: 0, s: 'euroTotal' },
    { f: `SUM(D${firstMonthRow}:D${lastMonthRow})`, v: 0, s: 'euroTotal' },
    { f: `SUM(E${firstMonthRow}:E${lastMonthRow})`, v: 0, s: 'euroTotal' },
    { f: `IF(B${lastMonthRow + 1}>0,(B${lastMonthRow + 1}-C${lastMonthRow + 1})/B${lastMonthRow + 1},0)`, v: 0, s: 'percentBold' },
    { f: `SUM(G${firstMonthRow}:G${lastMonthRow})`, v: allTransactions.length, s: 'integer' },
    ...expCats.map((_, i) => {
      const col = colName(7 + i);
      return { f: `SUM(${col}${firstMonthRow}:${col}${lastMonthRow})`, v: 0, s: 'euroTotal' };
    }),
  ]);

  sh.row([
    { v: 'MOYENNE MENSUELLE', s: 'bold' },
    { f: `AVERAGE(B${firstMonthRow}:B${lastMonthRow})`, v: 0, s: 'euroBold' },
    { f: `AVERAGE(C${firstMonthRow}:C${lastMonthRow})`, v: 0, s: 'euroBold' },
    { f: `AVERAGE(D${firstMonthRow}:D${lastMonthRow})`, v: 0, s: 'euroBold' },
    { f: `AVERAGE(E${firstMonthRow}:E${lastMonthRow})`, v: 0, s: 'euroBold' },
    { f: `AVERAGE(F${firstMonthRow}:F${lastMonthRow})`, v: 0, s: 'percentBold' },
    { f: `AVERAGE(G${firstMonthRow}:G${lastMonthRow})`, v: 0, s: 'number' },
    ...expCats.map((_, i) => {
      const col = colName(7 + i);
      return { f: `AVERAGE(${col}${firstMonthRow}:${col}${lastMonthRow})`, v: 0, s: 'euroBold' };
    }),
  ]);

  sh.row([
    { v: 'PART DES DÉPENSES (%)', s: 'bold' },
    '',
    { v: 1, s: 'percentBold' },
    '',
    '',
    '',
    '',
    ...expCats.map((_, i) => {
      const col = colName(7 + i);
      return { f: `IF($C$${totRow}>0,${col}${totRow}/$C$${totRow},0)`, v: 0, s: 'percent' };
    }),
  ]);

  const chartRow = sh.rows.length + 3;
  sh.chart({
    type: 'col',
    title: 'Évolution mensuelle : Revenus, Dépenses et Épargne (€)',
    from: `A${chartRow}`,
    to: `I${chartRow + 20}`,
    categories: `A${firstMonthRow}:A${lastMonthRow}`,
    series: [
      { name: 'Revenus (€)', ref: `B${firstMonthRow}:B${lastMonthRow}`, color: EMERALD },
      { name: 'Dépenses hors épargne (€)', ref: `C${firstMonthRow}:C${lastMonthRow}`, color: COBALT },
      { name: 'Épargne nette (€)', ref: `D${firstMonthRow}:D${lastMonthRow}`, color: TEAL },
    ],
  });
}

/**
 * 4. Feuille « Journal Opérations » : liste intégrale de toutes les opérations bancaires et manuelles.
 */
function addTransactionsSheet(wb, ctx) {
  const { allTransactions, categories, names } = ctx;
  const catById = new Map(categories.map((c) => [c.id, c]));
  const sh = wb.addSheet('Journal Opérations', {
    widths: [14, 12, 28, 42, 24, 16, 16, 16, 16, 16, 14, 28],
    freeze: 6,
  });

  sh.row([{ v: 'JOURNAL INTÉGRAL DES OPÉRATIONS BANCAIRES ET SAISIES MANUELLES', s: 'title' }]);
  sh.merge('A1:L1');

  const sorted = [...allTransactions].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const firstOpRow = 7;
  const lastOpRow = Math.max(firstOpRow, firstOpRow + sorted.length - 1);

  // Bandeau de contrôle par formules Excel en haut de feuille
  sh.row([
    { v: 'Nb total d\'opérations', s: 'bold' },
    { f: sorted.length ? `COUNTA(A${firstOpRow}:A${lastOpRow})` : '0', v: sorted.length, s: 'integer' },
    { v: 'Total Revenus (Entrées)', s: 'bold' },
    { f: sorted.length ? `SUMIF(F${firstOpRow}:F${lastOpRow},"Entrée (Revenu)",H${firstOpRow}:H${lastOpRow})` : '0', v: 0, s: 'euroGain' },
    { v: 'Total Dépenses (Sorties)', s: 'bold' },
    { f: sorted.length ? `SUMIF(F${firstOpRow}:F${lastOpRow},"Sortie (Dépense)",H${firstOpRow}:H${lastOpRow})` : '0', v: 0, s: 'euroBold' },
    { v: 'Total Virements Épargne', s: 'bold' },
    { f: sorted.length ? `SUMIF(F${firstOpRow}:F${lastOpRow},"Épargne",I${firstOpRow}:I${lastOpRow})` : '0', v: 0, s: 'euroBold' },
  ]);
  sh.blank();
  sh.row([{
    v: 'Astuce Excel : activez « Données > Filtrer » sur la ligne 6 pour filtrer vos opérations par catégorie (Linges, Beauté, Virements, Déjeuners, Sport, Loisirs…), par mois ou par commerçant.',
    s: 'note',
  }]);
  sh.merge('A4:L4');
  sh.blank();

  sh.row([
    'Date',
    'Mois',
    'Commerçant / Libellé lisible',
    'Libellé bancaire complet',
    'Catégorie',
    'Nature comptable',
    'Mode de paiement',
    'Montant absolu (€)',
    'Montant signé (€)',
    'Compte / Profil',
    'Mensualisé',
    'Note personnelle',
  ], 'header');

  if (!sorted.length) {
    sh.row([{ v: 'Aucune opération importée ou saisie pour le moment.', s: 'note' }]);
    return;
  }

  for (const t of sorted) {
    const cat = catById.get(t.categoryId);
    const clean = displayLabel(t.label);
    const kind = cat?.kind ?? t.type;
    const natureLabel = kind === 'epargne'
      ? 'Épargne'
      : kind === 'transfert'
        ? 'Virement interne'
        : t.type === TRANSACTION_TYPES.INCOME
          ? 'Entrée (Revenu)'
          : 'Sortie (Dépense)';
    const signed = t.type === TRANSACTION_TYPES.INCOME ? eur(t.amount) : -eur(t.amount);

    sh.row([
      { v: excelDate(t.date), s: 'date' },
      t.month,
      { v: clean.name, s: 'bold' },
      t.label,
      cat?.name ?? t.categoryId,
      natureLabel,
      clean.kind ?? (t.type === TRANSACTION_TYPES.INCOME ? 'Virement reçu' : 'Opération'),
      { v: eur(t.amount), s: 'euro' },
      { v: signed, s: signed >= 0 ? 'euroGain' : 'euro' },
      names[t.profile] ?? t.profile,
      t.recurring ? 'Oui' : 'Non',
      t.note ?? '',
    ]);
  }
}

/**
 * 5 & 6. Feuilles maîtresses « Bilan Patrimoine » et « Projection 25 ans »
 * avec séparation explicite entre Fonds investis et Intérêts composés gagnés.
 */
export function addPatrimoineSheets(wb, ctx) {
  const livretModels = ctx.models ?? ctx.livretModels ?? [];
  const livrets = ctx.livrets ?? [];
  const livretSummary = ctx.summary ?? ctx.livretSummary ?? { balance: 0, rate: 1.7, monthlyPlan: 0 };
  const peaAccounts = ctx.pea ?? [];
  const inflationRate = ctx.inflation?.rate ?? 2.0;
  const todayIso = ctx.today ?? new Date().toISOString().slice(0, 10);
  const currentMonth = todayIso.slice(0, 7);

  const envelopes = [];
  livretModels.forEach((m, i) => {
    const l = livrets[i] ?? m;
    const holder = ctx.names?.[l.profile] ?? l.profile ?? '';
    const prodName = PRODUCTS[m.product]?.name ?? m.name ?? 'Livret';
    const label = holder ? `${prodName} (${holder})` : prodName;
    const deposits = Math.max(0, m.balance - (m.interestEarned ?? 0));
    envelopes.push({
      name: label,
      category: 'Épargne sécurisée (Livret)',
      holder,
      gross: eur(m.balance),
      deposits: eur(deposits),
      gain: eur(m.balance - deposits),
      tax: 0,
      net: eur(m.balance),
      rate: frac(m.rate),
      monthly: eur(m.plan?.monthly ?? 0),
      cap: eur(m.cap ?? PRODUCTS[m.product]?.cap ?? 2295000),
    });
  });

  let totalPeaGrossCents = 0;
  let totalPeaDepositsCents = 0;
  let totalPeaMonthlyCents = 0;
  let weightedPeaRateSum = 0;

  peaAccounts.forEach((acc, i) => {
    const pf = portfolio(acc, ctx.ref?.annual);
    const holder = ctx.names?.[acc.profile] ?? acc.profile ?? '';
    const label = peaAccounts.length > 1 || holder ? `PEA ${holder || `#${i + 1}`}`.trim() : 'PEA Actions';
    const sim = ctx.peaSim?.(acc.id) ?? { monthly: acc.monthly ?? 0, horizon: 15, scenario: 'prudent' };
    const rate = scenarioRate(pf, sim.scenario ?? 'prudent');
    const ageYears = monthsBetween(acc.opened, currentMonth) / 12;
    const taxRate = peaTax(ageYears);
    const gainCents = Math.max(0, pf.value - pf.deposits);
    const taxCents = Math.round(gainCents * taxRate / 100);
    const netCents = pf.value - taxCents;

    totalPeaGrossCents += pf.value;
    totalPeaDepositsCents += pf.deposits;
    totalPeaMonthlyCents += sim.monthly ?? acc.monthly ?? 0;
    weightedPeaRateSum += rate * Math.max(1, pf.value);

    envelopes.push({
      name: label,
      category: 'Investissement Actions (PEA)',
      holder,
      gross: eur(pf.value),
      deposits: eur(pf.deposits),
      gain: eur(pf.value - pf.deposits),
      tax: eur(taxCents),
      net: eur(netCents),
      rate,
      monthly: eur(sim.monthly ?? acc.monthly ?? 0),
      cap: eur(PEA.cap),
    });
  });

  if (!envelopes.length) {
    envelopes.push({
      name: 'Livret A (à renseigner)',
      category: 'Épargne sécurisée (Livret)',
      holder: '',
      gross: 0,
      deposits: 0,
      gain: 0,
      tax: 0,
      net: 0,
      rate: frac(livretSummary.rate || 1.7),
      monthly: 0,
      cap: eur(PRODUCTS.livretA.cap),
    });
  }

  /* Feuille « Bilan Patrimoine » */
  const bil = wb.addSheet('Bilan Patrimoine', {
    widths: [28, 26, 14, 18, 18, 20, 16, 16, 18, 20, 18, 14, 14, 18, 18, 18],
    freeze: 5,
  });
  bil.row([{ v: 'BILAN PATRIMONIAL CONSOLIDÉ — RÉPARTITION FONDS INVESTIS VS INTÉRÊTS COMPOSÉS', s: 'title' }]);
  bil.merge('A1:P1');
  bil.row([{
    v: `Photographie au ${longDate(todayIso)}. Distingue explicitement vos Fonds investis (capital versé) et vos Intérêts composés & plus-values gagnés (bruts et nets d'impôt).`,
    s: 'note',
  }]);
  bil.merge('A2:P2');
  bil.blank();

  const headRow = bil.row([
    'Enveloppe',
    'Catégorie d\'actif',
    'Titulaire',
    'Fonds investis (versements €)',
    'Intérêts composés & plus-values bruts (€)',
    'Valeur brute actuelle (€)',
    'Part d\'intérêts dans l\'enveloppe (%)',
    'Gain sur fonds investis (%)',
    'Fiscalité latente estimée (€)',
    'Intérêts composés & plus-values nets (€)',
    'Valeur nette disponible (€)',
    'Part du patrimoine net (%)',
    'Rendement net / an (%)',
    'Versement mensuel (€)',
    'Plafond légal (€)',
    'Marge avant plafond (€)',
  ], 'header');

  const firstEnvRow = headRow + 1;
  const lastEnvRow = firstEnvRow + envelopes.length - 1;
  const totalNetPrecalc = envelopes.reduce((s, e) => s + e.net, 0);
  const totalGrossPrecalc = envelopes.reduce((s, e) => s + e.gross, 0);
  const totalDepPrecalc = envelopes.reduce((s, e) => s + e.deposits, 0);
  const totalGainPrecalc = envelopes.reduce((s, e) => s + e.gain, 0);
  const totalTaxPrecalc = envelopes.reduce((s, e) => s + e.tax, 0);
  const totalNetGainPrecalc = totalGainPrecalc - totalTaxPrecalc;
  const totalMonthlyPrecalc = envelopes.reduce((s, e) => s + e.monthly, 0);
  const totalCapPrecalc = envelopes.reduce((s, e) => s + e.cap, 0);
  const totRowIdx = lastEnvRow + 1;

  envelopes.forEach((e, idx) => {
    const r = firstEnvRow + idx;
    const share = totalNetPrecalc > 0 ? e.net / totalNetPrecalc : 0;
    const gainShare = e.gross > 0 ? e.gain / e.gross : 0;
    const roi = e.deposits > 0 ? e.gain / e.deposits : 0;
    const netGain = e.gain - e.tax;
    const capRoom = Math.max(0, e.cap - e.deposits);

    bil.row([
      { v: e.name, s: 'bold' },
      e.category,
      e.holder,
      { v: e.deposits, s: 'euro' },
      { f: `F${r}-D${r}`, v: e.gain, s: 'euroGain' },
      { v: e.gross, s: 'euroBold' },
      { f: `IF(F${r}>0,E${r}/F${r},0)`, v: gainShare, s: 'percentGain' },
      { f: `IF(D${r}>0,E${r}/D${r},0)`, v: roi, s: 'percent' },
      { v: e.tax, s: 'euro' },
      { f: `E${r}-I${r}`, v: netGain, s: 'euroGain' },
      { f: `F${r}-I${r}`, v: e.net, s: 'euroBold' },
      { f: `IF($K$${totRowIdx}>0,K${r}/$K$${totRowIdx},0)`, v: share, s: 'percent' },
      { v: e.rate, s: 'percent' },
      { v: e.monthly, s: 'euro' },
      { v: e.cap, s: 'euro' },
      { f: `MAX(0,O${r}-D${r})`, v: capRoom, s: 'euro' },
    ]);
  });

  const avgNetRatePrecalc = totalNetPrecalc > 0
    ? envelopes.reduce((s, e) => s + e.net * e.rate, 0) / totalNetPrecalc
    : frac(livretSummary.rate || 1.7);

  bil.row([
    { v: 'Patrimoine Total', s: 'boldTotal' },
    { v: 'Toutes enveloppes', s: 'boldTotal' },
    { v: '', s: 'boldTotal' },
    { f: `SUM(D${firstEnvRow}:D${lastEnvRow})`, v: totalDepPrecalc, s: 'euroTotal' },
    { f: `SUM(E${firstEnvRow}:E${lastEnvRow})`, v: totalGainPrecalc, s: 'euroTotal' },
    { f: `SUM(F${firstEnvRow}:F${lastEnvRow})`, v: totalGrossPrecalc, s: 'euroTotal' },
    { f: `IF(F${totRowIdx}>0,E${totRowIdx}/F${totRowIdx},0)`, v: totalGrossPrecalc > 0 ? totalGainPrecalc / totalGrossPrecalc : 0, s: 'percentBold' },
    { f: `IF(D${totRowIdx}>0,E${totRowIdx}/D${totRowIdx},0)`, v: totalDepPrecalc > 0 ? totalGainPrecalc / totalDepPrecalc : 0, s: 'percentBold' },
    { f: `SUM(I${firstEnvRow}:I${lastEnvRow})`, v: totalTaxPrecalc, s: 'euroTotal' },
    { f: `SUM(J${firstEnvRow}:J${lastEnvRow})`, v: totalNetGainPrecalc, s: 'euroTotal' },
    { f: `SUM(K${firstEnvRow}:K${lastEnvRow})`, v: totalNetPrecalc, s: 'euroTotal' },
    { f: `SUM(L${firstEnvRow}:L${lastEnvRow})`, v: 1, s: 'percentBold' },
    { f: `IF(K${totRowIdx}>0,SUMPRODUCT(K${firstEnvRow}:K${lastEnvRow},M${firstEnvRow}:M${lastEnvRow})/K${totRowIdx},0)`, v: avgNetRatePrecalc, s: 'percentBold' },
    { f: `SUM(N${firstEnvRow}:N${lastEnvRow})`, v: totalMonthlyPrecalc, s: 'euroTotal' },
    { f: `SUM(O${firstEnvRow}:O${lastEnvRow})`, v: totalCapPrecalc, s: 'euroTotal' },
    { f: `SUM(P${firstEnvRow}:P${lastEnvRow})`, v: Math.max(0, totalCapPrecalc - totalDepPrecalc), s: 'euroTotal' },
  ]);

  bil.blank();
  bil.row(['Synthèse par classe d\'actifs et indicateurs patrimoniaux', 'Valeur', 'Formule / Repère'], 'header');

  const safeNetPrecalc = eur(livretSummary.balance);
  const peaNetPrecalc = Math.max(0, totalNetPrecalc - safeNetPrecalc);
  const rSafeSum = bil.row([
    { v: 'Épargne sécurisée disponible (Livrets)', s: 'bold' },
    { f: `SUMIF(B${firstEnvRow}:B${lastEnvRow},"*Livret*",K${firstEnvRow}:K${lastEnvRow})`, v: safeNetPrecalc, s: 'euroBold' },
    'Liquidité immédiate, capital garanti, exonéré d\'impôt et de prélèvements sociaux',
  ]);
  const rPeaSum = bil.row([
    { v: 'Capital Actions net (PEA)', s: 'bold' },
    { f: `SUMIF(B${firstEnvRow}:B${lastEnvRow},"*PEA*",K${firstEnvRow}:K${lastEnvRow})`, v: peaNetPrecalc, s: 'euroBold' },
    'Investissement long terme en actions mondiales, net de fiscalité latente',
  ]);
  bil.row([
    { v: 'Total des Fonds investis (capital versé par vous)', s: 'bold' },
    { f: `D${totRowIdx}`, v: totalDepPrecalc, s: 'euroBold' },
    'Cumul de tous vos versements sur livrets et PEA',
  ]);
  bil.row([
    { v: 'Total des Intérêts composés & plus-values nets gagnés', s: 'bold' },
    { f: `J${totRowIdx}`, v: totalNetGainPrecalc, s: 'euroGain' },
    'Gains nets d\'impôt produits par votre épargne et vos investissements',
  ]);
  bil.row([
    'Part investie en actions (%)',
    { f: `IF(K${totRowIdx}>0,B${rPeaSum}/K${totRowIdx},0)`, v: totalNetPrecalc > 0 ? peaNetPrecalc / totalNetPrecalc : 0, s: 'percentBold' },
    'Poids de la poche dynamique dans le patrimoine net total',
  ]);
  bil.row([
    'Part en épargne sécurisée (%)',
    { f: `IF(K${totRowIdx}>0,B${rSafeSum}/K${totRowIdx},0)`, v: totalNetPrecalc > 0 ? safeNetPrecalc / totalNetPrecalc : 0, s: 'percent' },
    'Poids du matelas de sécurité sans risque',
  ]);
  bil.row([
    'Flux d\'épargne annuel programmé',
    { f: `N${totRowIdx}*12`, v: totalMonthlyPrecalc * 12, s: 'euroBold' },
    'Total des versements mensuels programmés × 12 mois',
  ]);
  bil.row([
    'Revenu passif annuel estimé (intérêts et plus-values)',
    { f: `K${totRowIdx}*M${totRowIdx}`, v: totalNetPrecalc * avgNetRatePrecalc, s: 'euroGain' },
    'Patrimoine net actuel × rendement annuel moyen pondéré',
  ]);
  bil.row([
    { v: 'Rente mensuelle potentielle immédiate (règle des 4 %)', s: 'boldTotal' },
    { f: `K${totRowIdx}*0.04/12`, v: totalNetPrecalc * 0.04 / 12, s: 'euroTotal' },
    'Revenu mensuel soutenable selon la règle des 4 % par an (Patrimoine net × 4 % ÷ 12)',
  ]);

  const chartStartRow = bil.rows.length + 3;
  bil.chart({
    type: 'bar',
    stacked: true,
    title: 'Répartition Fonds investis vs Intérêts composés nets par enveloppe (€)',
    from: `A${chartStartRow}`,
    to: `J${chartStartRow + 18}`,
    categories: `A${firstEnvRow}:A${lastEnvRow}`,
    series: [
      { name: 'Fonds investis (versements €)', ref: `D${firstEnvRow}:D${lastEnvRow}`, color: COBALT },
      { name: 'Intérêts composés & plus-values nets (€)', ref: `J${firstEnvRow}:J${lastEnvRow}`, color: EMERALD },
    ],
  });

  /* Feuille « Projection 25 ans » */
  const prj = wb.addSheet('Projection 25 ans', {
    widths: [14, 10, 18, 20, 18, 18, 20, 18, 16, 20, 18, 20, 22, 16, 20, 22, 18],
    freeze: 15,
  });
  prj.row([{ v: 'PROJECTION PATRIMONIALE SUR 25 ANS : FONDS INVESTIS VS INTÉRÊTS COMPOSÉS (LIVRETS + PEA)', s: 'title' }]);
  prj.merge('A1:Q1');
  prj.row([{
    v: 'Modifiez librement les paramètres jaunes dans les cellules B4 à B12 : les 26 années de projection et les 2 graphiques (dont la répartition empilée Fonds investis / Intérêts composés) se recalculent instantanément.',
    s: 'note',
  }]);
  prj.merge('A2:Q2');
  prj.row(['Paramètre de simulation (modifiable dans la colonne B)', 'Valeur', 'Explication et repère'], 'header');

  const safeStartEur = eur(livretSummary.balance);
  const peaStartEur = eur(totalPeaGrossCents);
  const peaDepStartEur = eur(totalPeaDepositsCents);
  const safeMonthlyEur = eur(livretModels.reduce((s, m) => s + (m.plan?.monthly ?? 0), 0));
  const peaMonthlyEur = eur(totalPeaMonthlyCents);
  const safeRateFrac = frac(livretSummary.rate || 1.7);
  const peaRateFrac = totalPeaGrossCents > 0 ? weightedPeaRateSum / totalPeaGrossCents : 0.048;
  const inflFrac = frac(inflationRate);
  const peaTaxFrac = frac(PEA.taxAfter);

  const pSafe0 = prj.row(['Épargne sécurisée actuelle (Livrets)', { v: safeStartEur, s: 'euroBold' }, 'Solde cumulé actuel de vos Livret A et LEP']);
  const pPea0 = prj.row(['Portefeuille Actions PEA actuel (brut)', { v: peaStartEur, s: 'euroBold' }, 'Valorisation actuelle de vos PEA']);
  const pPeaDep0 = prj.row(['Fonds investis sur PEA à ce jour (versements cumulés)', { v: peaDepStartEur, s: 'euro' }, `Plafond légal des versements PEA : ${(PEA.cap / 100).toLocaleString('fr-FR')} € par plan`]);
  const pSafeMo = prj.row(['Versement mensuel programmé sur Livrets', { v: safeMonthlyEur, s: 'euro' }, 'Épargne mensuelle versée sur les livrets réglementés']);
  const pPeaMo = prj.row(['Versement mensuel programmé sur PEA', { v: peaMonthlyEur, s: 'euro' }, 'Investissement mensuel programmé (DCA) sur ETF en PEA']);
  const pSafeRate = prj.row(['Taux annuel net des Livrets', { v: safeRateFrac, s: 'percent' }, 'Taux moyen pondéré net d\'impôt de vos livrets']);
  const pPeaRate = prj.row(['Rendement annuel espéré du PEA (net de frais)', { v: peaRateFrac, s: 'percentBold' }, 'Hypothèse de rendement annuel composé des actions (frais ETF déduits)']);
  const pInfl = prj.row(['Inflation annuelle estimée', { v: inflFrac, s: 'percent' }, 'Pour convertir le patrimoine futur en pouvoir d\'achat d\'aujourd\'hui']);
  const pPeaTax = prj.row(['Prélèvements sociaux PEA au retrait (> 5 ans)', { v: peaTaxFrac, s: 'percent' }, 'Fiscalité appliquée uniquement sur la part des gains en cas de retrait']);

  prj.blank();
  const tableHeadRow = prj.row([
    'Horizon',
    'Année',
    'Livrets : Fonds investis (€)',
    'Livrets : Intérêts composés (€)',
    'Livrets : Solde total (€)',
    'PEA : Fonds investis (€)',
    'PEA : Intérêts composés bruts (€)',
    'PEA : Valeur brute (€)',
    'PEA : Fiscalité (€)',
    'PEA : Intérêts composés nets (€)',
    'PEA : Valeur nette (€)',
    'TOTAL FONDS INVESTIS CUMULÉS (€)',
    'TOTAL INTÉRÊTS COMPOSÉS NETS (€)',
    'Part des intérêts composés (%)',
    'PATRIMOINE TOTAL NET (€)',
    'Pouvoir d\'achat (€ d\'aujourd\'hui)',
    'Rente 4 % / mois (€)',
  ], 'header');

  const baseYear = Number(todayIso.slice(0, 4));
  const peaCapEur = Math.max(eur(PEA.cap), Math.ceil(peaDepStartEur / eur(PEA.cap)) * eur(PEA.cap));
  const firstProjRow = tableHeadRow + 1;
  const horizonYears = 25;

  let curSafe = safeStartEur;
  let curPeaDep = peaDepStartEur;
  let curPeaGross = peaStartEur;

  for (let y = 0; y <= horizonYears; y++) {
    const r = firstProjRow + y;
    const yearNum = baseYear + y;
    const label = y === 0 ? 'Aujourd\'hui' : `+${y} an${y > 1 ? 's' : ''}`;

    if (y === 0) {
      const safeDep0 = curSafe;
      const safeGain0 = 0;
      const peaGainGross0 = curPeaGross - curPeaDep;
      const tax0 = Math.max(0, peaGainGross0) * peaTaxFrac;
      const peaGainNet0 = peaGainGross0 - tax0;
      const netPea0 = curPeaGross - tax0;
      const totDep0 = safeDep0 + curPeaDep;
      const totGainNet0 = safeGain0 + peaGainNet0;
      const totNet0 = curSafe + netPea0;
      const gainShare0 = totNet0 > 0 ? totGainNet0 / totNet0 : 0;

      prj.row([
        { v: label, s: 'bold' },
        { v: yearNum, s: 'integer' },
        { f: `B${pSafe0}`, v: safeDep0, s: 'euro' },
        { f: `E${r}-C${r}`, v: safeGain0, s: 'euroGain' },
        { f: `B${pSafe0}`, v: curSafe, s: 'euro' },
        { f: `B${pPeaDep0}`, v: curPeaDep, s: 'euro' },
        { f: `H${r}-F${r}`, v: peaGainGross0, s: 'euroGain' },
        { f: `B${pPea0}`, v: curPeaGross, s: 'euro' },
        { f: `MAX(0,G${r})*$B$${pPeaTax}`, v: tax0, s: 'euro' },
        { f: `G${r}-I${r}`, v: peaGainNet0, s: 'euroGain' },
        { f: `H${r}-I${r}`, v: netPea0, s: 'euro' },
        { f: `C${r}+F${r}`, v: totDep0, s: 'euroBold' },
        { f: `D${r}+J${r}`, v: totGainNet0, s: 'euroGain' },
        { f: `IF(O${r}>0,M${r}/O${r},0)`, v: gainShare0, s: 'percentGain' },
        { f: `E${r}+K${r}`, v: totNet0, s: 'euroBold' },
        { f: `O${r}`, v: totNet0, s: 'euroBold' },
        { f: `O${r}*0.04/12`, v: totNet0 * 0.04 / 12, s: 'euro' },
      ]);
    } else {
      const prev = r - 1;
      const safeDepY = safeStartEur + safeMonthlyEur * 12 * y;
      curSafe = (curSafe + safeMonthlyEur * 12) * (1 + safeRateFrac);
      const safeGainY = curSafe - safeDepY;

      const nextPeaDep = Math.min(peaCapEur, curPeaDep + peaMonthlyEur * 12);
      const addedPea = nextPeaDep - curPeaDep;
      curPeaDep = nextPeaDep;
      curPeaGross = (curPeaGross + addedPea) * (1 + peaRateFrac);
      const peaGainGrossY = curPeaGross - curPeaDep;
      const taxY = Math.max(0, peaGainGrossY) * peaTaxFrac;
      const peaGainNetY = peaGainGrossY - taxY;
      const netPeaY = curPeaGross - taxY;

      const totDepY = safeDepY + curPeaDep;
      const totGainNetY = safeGainY + peaGainNetY;
      const totNetY = curSafe + netPeaY;
      const gainShareY = totNetY > 0 ? totGainNetY / totNetY : 0;
      const realY = totNetY / ((1 + inflFrac) ** y);

      prj.row([
        { v: label, s: y % 5 === 0 ? 'bold' : 'default' },
        { v: yearNum, s: 'integer' },
        { f: `$B$${pSafe0}+$B$${pSafeMo}*12*${y}`, v: safeDepY, s: 'euro' },
        { f: `E${r}-C${r}`, v: safeGainY, s: 'euroGain' },
        { f: `(E${prev}+$B$${pSafeMo}*12)*(1+$B$${pSafeRate})`, v: curSafe, s: 'euro' },
        { f: `MIN(${peaCapEur},F${prev}+$B$${pPeaMo}*12)`, v: curPeaDep, s: 'euro' },
        { f: `H${r}-F${r}`, v: peaGainGrossY, s: 'euroGain' },
        { f: `(H${prev}+(F${r}-F${prev}))*(1+$B$${pPeaRate})`, v: curPeaGross, s: 'euro' },
        { f: `MAX(0,G${r})*$B$${pPeaTax}`, v: taxY, s: 'euro' },
        { f: `G${r}-I${r}`, v: peaGainNetY, s: 'euroGain' },
        { f: `H${r}-I${r}`, v: netPeaY, s: 'euro' },
        { f: `C${r}+F${r}`, v: totDepY, s: 'euroBold' },
        { f: `D${r}+J${r}`, v: totGainNetY, s: 'euroGain' },
        { f: `IF(O${r}>0,M${r}/O${r},0)`, v: gainShareY, s: 'percentGain' },
        { f: `E${r}+K${r}`, v: totNetY, s: 'euroBold' },
        { f: `O${r}/((1+$B$${pInfl})^${y})`, v: realY, s: 'euroBold' },
        { f: `O${r}*0.04/12`, v: totNetY * 0.04 / 12, s: 'euro' },
      ]);
    }
  }

  const lastProjRow = firstProjRow + horizonYears;
  prj.blank();
  prj.row([{
    v: 'Lecture directe : la colonne L indique le cumul exact des Fonds investis (votre effort d\'épargne), la colonne M indique le cumul des Intérêts composés nets produits par votre argent, et la colonne N donne la part que représentent ces intérêts composés dans votre patrimoine net total.',
    s: 'note',
  }]);
  prj.merge(`A${lastProjRow + 2}:Q${lastProjRow + 2}`);

  // Graphique 1 : Colonnes empilées Fonds investis vs Intérêts composés nets sur 25 ans
  prj.chart({
    type: 'col',
    stacked: true,
    title: 'Patrimoine sur 25 ans : Fonds investis cumulés vs Intérêts composés nets gagnés (€)',
    from: `A${lastProjRow + 4}`,
    to: `I${lastProjRow + 26}`,
    categories: `B${firstProjRow}:B${lastProjRow}`,
    series: [
      { name: 'Total Fonds investis cumulés (€)', ref: `L${firstProjRow}:L${lastProjRow}`, color: COBALT },
      { name: 'Total Intérêts composés nets gagnés (€)', ref: `M${firstProjRow}:M${lastProjRow}`, color: EMERALD },
    ],
  });

  // Graphique 2 : Courbes Patrimoine Total Net vs Pouvoir d'achat vs Fonds investis
  prj.chart({
    type: 'line',
    title: 'Trajectoire du Patrimoine Net, des Fonds investis et du Pouvoir d\'achat (€)',
    from: `J${lastProjRow + 4}`,
    to: `Q${lastProjRow + 26}`,
    categories: `B${firstProjRow}:B${lastProjRow}`,
    series: [
      { name: 'Patrimoine Total Net (€)', ref: `O${firstProjRow}:O${lastProjRow}`, color: COBALT },
      { name: 'Total Fonds investis (€)', ref: `L${firstProjRow}:L${lastProjRow}`, color: SLATE },
      { name: 'Pouvoir d\'achat (€ d\'aujourd\'hui)', ref: `P${firstProjRow}:P${lastProjRow}`, color: INK, dash: true },
    ],
  });
}

/**
 * 7. Feuilles détaillées par PEA :
 * - Caractéristiques du plan et répartition immédiate Fonds investis / Intérêts composés
 * - Portefeuille ETF détaillé (ISIN, indice, frais TER, montant, poids, versement mensuel alloué, rendement 10 ans)
 * - Comparaison des 3 scénarios de rendement (Prudent 5 %, Équilibré 7 %, Historique 10 ans)
 * - Échéancier annuel complet sur 25 ans avec séparation explicite Fonds investis vs Intérêts composés (bruts & nets)
 * - Graphique Excel natif en colonnes empilées (Fonds investis + Intérêts composés)
 */
function addPeaDetailSheets(wb, ctx) {
  const { inflation } = ctx;
  const accounts = ctx.pea ?? [];

  if (!accounts.length) {
    const sh = wb.addSheet('PEA & Projections', { widths: [34, 18, 18, 18, 18, 18] });
    sh.row([{ v: 'PORTEFEUILLES PEA (AUCUN PEA CONFIGURÉ POUR LE MOMENT)', s: 'title' }]);
    sh.merge('A1:F1');
    sh.row([{
      v: 'Rendez-vous dans l\'onglet « Investir » de l\'application pour ajouter votre PEA et vos lignes d\'ETF : cette feuille restituera alors vos lignes ETF, vos 3 scénarios et l\'échéancier annuel sur 25 ans.',
      s: 'note',
    }]);
    sh.merge('A2:F2');
    return;
  }

  for (const account of accounts) {
    const pf = portfolio(account, ctx.ref.annual);
    const owner = accounts.length > 1 ? ` ${ctx.names[account.profile] ?? account.profile}` : '';
    const sh = wb.addSheet(`PEA${owner}`.slice(0, 31), {
      widths: [30, 16, 18, 16, 18, 18, 18, 18, 16, 18, 18, 18, 18],
      freeze: 4,
    });

    const currentMonth = ctx.today.slice(0, 7);
    const ageMonths = monthsBetween(account.opened, currentMonth);
    const ageYears = ageMonths / 12;
    const taxNow = peaTax(ageYears);
    const gainNowCents = pf.value - pf.deposits;
    const taxNowCents = Math.round(Math.max(0, gainNowCents) * taxNow / 100);
    const netNowCents = pf.value - taxNowCents;
    const sim = ctx.peaSim?.(account.id) ?? { monthly: account.monthly ?? 0, horizon: 15, scenario: 'prudent' };
    const chosen = SCENARIOS.find((x) => x.id === sim.scenario) ?? SCENARIOS[0];
    const rate = scenarioRate(pf, chosen.id);
    const horizon = Math.max(sim.horizon ?? 15, 25);

    sh.row([{ v: `PORTEFEUILLE PEA${owner.toUpperCase()} — FONDS INVESTIS, ETF & PROJECTION SUR ${horizon} ANS`, s: 'title' }]);
    sh.merge('A1:M1');
    sh.row([{
      v: `Ouvert en ${monthLong(account.opened)} (ancienneté : ${Math.floor(ageYears)} an${ageYears >= 2 ? 's' : ''} et ${ageMonths % 12} mois · fiscalité actuelle sur les gains : ${taxNow.toLocaleString('fr-FR')} %). Valeur saisie le ${longDate(account.date)}.`,
      s: 'note',
    }]);
    sh.merge('A2:M2');
    sh.blank();

    // Bloc 1 : Répartition immédiate Fonds investis vs Intérêts composés
    sh.row([
      '1. BILAN ACTUEL DU PEA',
      'Fonds investis (versements €)',
      'Intérêts composés & plus-values bruts (€)',
      'Part des intérêts dans le PEA (%)',
      'Gain sur fonds investis (%)',
      'Valeur brute actuelle (€)',
      'Impôt latent au retrait (€)',
      'Intérêts composés nets (€)',
      'Valeur nette après impôt (€)',
      'Versement mensuel (€)',
      'Plafond PEA restant (€)',
    ], 'header');

    const rSummary = sh.row([
      { v: `PEA${owner}`, s: 'bold' },
      { v: eur(pf.deposits), s: 'euroBold' },
      { f: `F${sh.rows.length + 1}-B${sh.rows.length + 1}`, v: eur(gainNowCents), s: 'euroGain' },
      { f: `IF(F${sh.rows.length + 1}>0,C${sh.rows.length + 1}/F${sh.rows.length + 1},0)`, v: pf.value > 0 ? gainNowCents / pf.value : 0, s: 'percentGain' },
      { f: `IF(B${sh.rows.length + 1}>0,C${sh.rows.length + 1}/B${sh.rows.length + 1},0)`, v: pf.deposits > 0 ? gainNowCents / pf.deposits : 0, s: 'percent' },
      { v: eur(pf.value), s: 'euroBold' },
      { v: eur(taxNowCents), s: 'euro' },
      { f: `C${sh.rows.length + 1}-G${sh.rows.length + 1}`, v: eur(gainNowCents - taxNowCents), s: 'euroGain' },
      { f: `F${sh.rows.length + 1}-G${sh.rows.length + 1}`, v: eur(netNowCents), s: 'euroBold' },
      { v: eur(sim.monthly ?? account.monthly ?? 0), s: 'euro' },
      { f: `MAX(0,${eur(PEA.cap)}-B${sh.rows.length + 1})`, v: eur(Math.max(0, PEA.cap - pf.deposits)), s: 'euro' },
    ]);
    sh.blank();

    // Bloc 2 : Lignes ETF du portefeuille
    const head = sh.row([
      '2. LIGNES ETF DU PORTEFEUILLE',
      'Code ISIN',
      'Indice boursier suivi',
      'Frais annuels (TER %)',
      'Valorisation actuelle (€)',
      'Poids dans le PEA (%)',
      'Versement mensuel alloué (€)',
      'Rendement indice 10 ans / an (%)',
      'Rendement net de frais / an (%)',
      'Frais annuels estimés (€/an)',
    ], 'header');
    const first = head + 1;
    pf.lines.forEach((l, k) => {
      const n = first + k;
      const netPast = l.past - frac(l.ter);
      sh.row([
        { v: l.ticker ? `${l.ticker} · ${l.name}` : l.name, s: 'bold' },
        l.isin,
        indexById.get(l.index)?.name ?? '',
        { v: frac(l.ter), s: 'percent' },
        { v: eur(l.amount), s: 'euro' },
        { f: `IF(SUM($E$${first}:$E$${first + pf.lines.length - 1})>0,E${n}/SUM($E$${first}:$E$${first + pf.lines.length - 1}),0)`, v: l.weight, s: 'percent' },
        { f: `$J$${rSummary}*F${n}`, v: eur((sim.monthly ?? 0) * l.weight), s: 'euro' },
        { v: l.past, s: 'percent' },
        { f: `H${n}-D${n}`, v: netPast, s: 'percentGain' },
        { f: `E${n}*D${n}`, v: eur(l.amount) * frac(l.ter), s: 'euro' },
      ]);
    });
    const last = first + pf.lines.length - 1;
    sh.row([
      { v: 'Total Portefeuille PEA', s: 'boldTotal' },
      { v: `${pf.lines.length} ETF`, s: 'boldTotal' },
      { v: '', s: 'boldTotal' },
      { f: `SUMPRODUCT(D${first}:D${last},F${first}:F${last})`, v: frac(pf.ter), s: 'percentBold' },
      { f: `SUM(E${first}:E${last})`, v: eur(pf.value), s: 'euroTotal' },
      { f: `SUM(F${first}:F${last})`, v: 1, s: 'percentBold' },
      { f: `SUM(G${first}:G${last})`, v: eur(sim.monthly ?? 0), s: 'euroTotal' },
      { f: `SUMPRODUCT(H${first}:H${last},F${first}:F${last})`, v: pf.past, s: 'percentBold' },
      { f: `SUMPRODUCT(I${first}:I${last},F${first}:F${last})`, v: pf.past - frac(pf.ter), s: 'percentBold' },
      { f: `SUM(J${first}:J${last})`, v: eur(pf.value) * frac(pf.ter), s: 'euroTotal' },
    ]);
    sh.blank();

    // Bloc 3 : Comparaison des 3 scénarios à l'horizon choisi
    const compHorizon = sim.horizon ?? 10;
    sh.row([
      `3. COMPARAISON DES 3 SCÉNARIOS À ${compHorizon} ANS`,
      'Rendement net / an',
      'Fonds investis cumulés (€)',
      'Intérêts composés bruts (€)',
      'Part des intérêts (%)',
      'Valeur brute prévue (€)',
      'Fiscalité au retrait (€)',
      'Intérêts composés nets (€)',
      'Valeur nette disponible (€)',
      'En € d\'aujourd\'hui',
      'Multiplicateur des fonds investis',
    ], 'header');

    for (const sc of SCENARIOS) {
      const scRate = scenarioRate(pf, sc.id);
      const scProj = projectPea({
        value: pf.value,
        deposits: pf.deposits,
        monthly: sim.monthly ?? 0,
        rate: scRate,
        years: compHorizon,
        opened: account.opened,
        start: currentMonth,
        inflation: inflation.rate,
      });
      const end = scProj.points.at(-1);
      const n = sh.rows.length + 1;
      const gainNet = end.net - end.deposits;
      sh.row([
        { v: `${sc.label}${sc.id === chosen.id ? ' (scénario retenu)' : ''}`, s: sc.id === chosen.id ? 'bold' : 'default' },
        { v: scRate, s: 'percentBold' },
        { v: eur(end.deposits), s: 'euro' },
        { f: `F${n}-C${n}`, v: eur(end.gains), s: 'euroGain' },
        { f: `IF(F${n}>0,D${n}/F${n},0)`, v: end.value > 0 ? end.gains / end.value : 0, s: 'percentGain' },
        { v: eur(end.value), s: 'euroBold' },
        { v: eur(end.tax), s: 'euro' },
        { f: `D${n}-G${n}`, v: eur(gainNet), s: 'euroGain' },
        { f: `F${n}-G${n}`, v: eur(end.net), s: 'euroBold' },
        { v: eur(end.netReal), s: 'euro' },
        { f: `IF(C${n}>0,I${n}/C${n},0)`, v: end.deposits > 0 ? end.net / end.deposits : 0, s: 'number' },
      ]);
    }
    sh.blank();

    // Bloc 4 : Échéancier annuel complet sur 25 ans (Fonds investis vs Intérêts composés)
    const ph = sh.row([
      'Dans (ans)',
      'Année',
      'Versements de l\'année (€)',
      'Fonds investis cumulés (€)',
      'Intérêts composés de l\'année (€)',
      'Intérêts composés bruts cumulés (€)',
      'Part des intérêts composés (%)',
      'Valeur brute du PEA (€)',
      'Taux prélèvements (%)',
      'Prélèvements au retrait (€)',
      'Intérêts composés nets cumulés (€)',
      'Valeur nette après retrait (€)',
      'Valeur nette en € d\'aujourd\'hui',
    ], 'header');

    const { points } = projectPea({
      value: pf.value,
      deposits: pf.deposits,
      monthly: sim.monthly ?? 0,
      rate,
      years: horizon,
      opened: account.opened,
      start: currentMonth,
      inflation: inflation.rate,
    });
    const baseYear = Number(ctx.today.slice(0, 4));

    points.forEach((pt, k) => {
      const n = ph + 1 + k;
      const prev = k > 0 ? points[k - 1] : null;
      const yearDep = prev ? pt.deposits - prev.deposits : 0;
      const yearGain = prev ? pt.gains - prev.gains : 0;
      const gainShare = pt.value > 0 && pt.gains > 0 ? pt.gains / pt.value : 0;
      const netGain = pt.net - pt.deposits;

      sh.row([
        { v: pt.year, s: 'integer' },
        { v: baseYear + pt.year, s: 'integer' },
        k === 0 ? { v: 0, s: 'euro' } : { f: `D${n}-D${n - 1}`, v: eur(yearDep), s: 'euro' },
        { v: eur(pt.deposits), s: 'euroBold' },
        k === 0 ? { v: 0, s: 'euro' } : { f: `F${n}-F${n - 1}`, v: eur(yearGain), s: 'euroGain' },
        { f: `H${n}-D${n}`, v: eur(pt.gains), s: 'euroGain' },
        { f: `IF(H${n}>0,F${n}/H${n},0)`, v: gainShare, s: 'percentGain' },
        { v: eur(pt.value), s: 'euroBold' },
        { v: frac(pt.taxRate), s: 'percent' },
        { f: `MAX(0,F${n})*I${n}`, v: eur(pt.tax), s: 'euro' },
        { f: `F${n}-J${n}`, v: eur(netGain), s: 'euroGain' },
        { f: `H${n}-J${n}`, v: eur(pt.net), s: 'euroBold' },
        { v: eur(pt.netReal), s: 'euro' },
      ]);
    });

    const pl = ph + points.length;
    sh.blank();
    sh.row([{
      v: `Hypothèse active : « ${chosen.label} » (${(rate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % net de frais par an) et ${eur(sim.monthly ?? 0).toLocaleString('fr-FR')} € versés par mois jusqu'au plafond légal de 150 000 €. Le graphique empilé ci-dessous visualise directement vos Fonds investis (bleu) et vos Intérêts composés gagnés (vert).`,
      s: 'note',
    }]);
    sh.merge(`A${pl + 2}:M${pl + 2}`);

    sh.chart({
      type: 'col',
      stacked: true,
      title: `PEA${owner} : Fonds investis cumulés vs Intérêts composés bruts sur ${horizon} ans (€)`,
      from: `A${pl + 4}`,
      to: `M${pl + 26}`,
      categories: `B${ph + 1}:B${pl}`,
      series: [
        { name: 'Fonds investis cumulés (versements €)', ref: `D${ph + 1}:D${pl}`, color: COBALT },
        { name: 'Intérêts composés & plus-values bruts (€)', ref: `F${ph + 1}:F${pl}`, color: EMERALD },
      ],
    });
  }
}

/**
 * 8. Feuille « Livrets & Sécurité » : restitue l'intégralité de l'onglet « Épargne ».
 */
function addLivretsAndSafetySheet(wb, ctx) {
  const { models, summary, inflation } = ctx;
  const names = models.map((_, i) => ctx.titleOf(i));
  const sh = wb.addSheet('Livrets & Sécurité', {
    widths: [30, 16, 18, 18, 16, 16, 18, 18, 18, 18, 18, 18, 18],
    freeze: 4,
  });

  sh.row([{ v: 'ÉPARGNE RÉGLEMENTÉE (LIVRETS), MATELAS DE SÉCURITÉ, COMPARATEUR & PROJECTION 20 ANS', s: 'title' }]);
  sh.merge('A1:M1');
  sh.row([{
    v: `Export du ${longDate(ctx.today)}. Soldes reconstitués à la quinzaine près, rendement réel face à l'inflation (${inflation.rate.toLocaleString('fr-FR')} %), matelas de précaution et échéancier sur 20 ans.`,
    s: 'note',
  }]);
  sh.merge('A2:M2');
  sh.blank();

  // Bloc 1 : Synthèse Livrets & Matelas de sécurité
  sh.row(['1. SYNTHÈSE DES LIVRETS & MATELAS DE PRÉCAUTION', 'Valeur', 'Formule / Repère méthodologique', '', '', '', '', '', '', '', '', '', ''], 'header');
  const r = {};
  r.total = sh.row([{ v: 'Total disponible sur les livrets réglementés', s: 'bold' }, { v: eur(summary.balance), s: 'euroBold' }, 'Somme des soldes estimés aujourd\'hui, exonérés d\'impôt']);
  r.rate = sh.row(['Taux annuel moyen pondéré (net)', { v: frac(summary.rate), s: 'percentBold' }, 'Σ (solde × taux) ÷ Σ soldes']);
  r.infl = sh.row(['Inflation annuelle retenue (IPC INSEE)', { v: frac(inflation.rate), s: 'percent' }, `IPC sur un an (${monthLong(inflation.month)})`]);
  const real = (1 + frac(summary.rate)) / (1 + frac(inflation.rate)) - 1;
  r.real = sh.row([{ v: 'Rendement réel net d\'inflation (par an)', s: 'bold' }, { f: `(1+B${r.rate})/(1+B${r.infl})-1`, v: real, s: 'percentBold' }, 'Relation de Fisher : (1 + taux) ÷ (1 + inflation) − 1']);
  r.interest = sh.row(['Intérêts acquis sur 12 mois au solde actuel', { f: `B${r.total}*B${r.rate}`, v: eur(summary.balance) * frac(summary.rate), s: 'euroGain' }, 'Solde actuel × taux moyen pondéré']);
  r.erosion = sh.row(['Hausse des prix sur 12 mois (érosion monétaire)', { f: `B${r.total}*B${r.infl}`, v: eur(summary.balance) * frac(inflation.rate), s: 'euro' }, 'Montant nécessaire en plus dans un an pour conserver le même pouvoir d\'achat']);
  r.gain = sh.row([{ v: 'Gain (ou perte) de pouvoir d\'achat sur 12 mois', s: 'boldTotal' }, { f: `B${r.interest}-B${r.erosion}`, v: eur(summary.balance) * (frac(summary.rate) - frac(inflation.rate)), s: 'euroTotal' }, 'Intérêts 12 mois − Érosion liée à l\'inflation']);

  if (ctx.expenses) {
    const expRow = sh.row(['Dépenses mensuelles moyennes de référence', { v: eur(ctx.expenses.average), s: 'euro' }, `Moyenne hors épargne et virements (${ctx.expenses.months.map(monthLong).join(', ')})`]);
    sh.row([{ v: 'Matelas de sécurité actuel (en mois de dépenses)', s: 'bold' }, { f: `B${r.total}/B${expRow}`, v: summary.balance / ctx.expenses.average, s: 'months' }, `Fourchette recommandée : ${SAFETY_MONTHS.min} à ${SAFETY_MONTHS.max} mois de dépenses courantes`]);
    sh.row([`Seuil plancher conseillé (${SAFETY_MONTHS.min} mois)`, { f: `${SAFETY_MONTHS.min}*B${expRow}`, v: SAFETY_MONTHS.min * eur(ctx.expenses.average), s: 'euro' }, `Écart actuel : ${(eur(summary.balance) - SAFETY_MONTHS.min * eur(ctx.expenses.average)).toLocaleString('fr-FR')} €`]);
    sh.row([`Seuil de confort (${SAFETY_MONTHS.max} mois)`, { f: `${SAFETY_MONTHS.max}*B${expRow}`, v: SAFETY_MONTHS.max * eur(ctx.expenses.average), s: 'euro' }, `Écart actuel : ${(eur(summary.balance) - SAFETY_MONTHS.max * eur(ctx.expenses.average)).toLocaleString('fr-FR')} €`]);
  }
  sh.blank();

  // Bloc 2 : Détail de chaque livret
  sh.row([
    '2. DÉTAIL DE VOS LIVRETS',
    'Titulaire',
    'Solde estimé (€)',
    'Solde saisi (€)',
    'Date du solde',
    'Taux net (%)',
    'Taux réel (%)',
    'Plafond légal (€)',
    'Marge avant plafond (€)',
    `Intérêts ${ctx.today.slice(0, 4)} (€)`,
    'Intérêts sur 12 mois (€)',
    'Versement mensuel (€)',
    `Brut équivalent PFU ${TAX.pfu.toLocaleString('fr-FR')} %`,
  ], 'header');

  if (models.length) {
    models.forEach((m, i) => {
      const l = ctx.livrets[i];
      const n = sh.rows.length + 1;
      sh.row([
        { v: PRODUCTS[l.product].name, s: 'bold' },
        ctx.names[l.profile] ?? l.profile,
        { v: eur(m.balance), s: 'euroBold' },
        { v: eur(l.anchor.balance), s: 'euro' },
        { v: excelDate(l.anchor.date), s: 'date' },
        { v: frac(m.rate), s: 'percent' },
        { f: `(1+F${n})/(1+$B$${r.infl})-1`, v: m.real, s: 'percent' },
        { v: eur(m.cap), s: 'euro' },
        { f: `MAX(0,H${n}-C${n})`, v: eur(m.capRoom), s: 'euro' },
        { v: eur(m.interestYear), s: 'euroGain' },
        { f: `C${n}*F${n}`, v: eur(m.next12.interest), s: 'euroGain' },
        { v: eur(m.plan.monthly), s: 'euro' },
        { f: `F${n}/(1-${TAX.pfu / 100})`, v: frac(grossEquivalent(m.rate)), s: 'percent' },
      ]);
    });
  } else {
    sh.row([{ v: 'Aucun livret réglementé configuré pour le moment.', s: 'note' }]);
  }
  sh.blank();

  // Bloc 3 : Bulletin de santé de l'épargne
  if (models.length) {
    sh.row(['3. BULLETIN DE SANTÉ DE VOTRE ÉPARGNE', 'Verdict', 'Indicateur clé', 'Diagnostic complet', '', '', '', '', '', '', '', '', ''], 'header');
    const verdicts = { ok: 'Favorable', attention: 'À surveiller', defavorable: 'Défavorable' };
    for (const item of bulletinItems(ctx)) {
      const rBul = sh.row([{ v: item.name, s: 'bold' }, verdicts[item.verdict], item.value.textContent.trim(), item.text]);
      sh.merge(`D${rBul}:M${rBul}`);
    }
    sh.blank();
  }

  // Bloc 4 : Comparateur des placements sans risque & Temps de doublement
  sh.row(['4. COMPARATEUR DES PLACEMENTS SANS RISQUE', 'Taux brut', 'Fiscalité', 'Taux net', 'Rendement réel', 'Années pour doubler (nominal)', 'Explication', '', '', '', '', '', ''], 'header');
  const lines = [
    ...models.map((m, i) => ({ name: names[i], gross: m.rate, tax: 0, note: 'Livret réglementé : exonéré d\'impôt et de prélèvements sociaux' })),
    ...benchmarks(ctx.ref.benchmarks).map((b) => ({
      name: b.name,
      gross: b.gross,
      tax: b.id === 'estr' ? TAX.pfu : TAX.socialAssuranceVie,
      note: b.id === 'estr'
        ? `€STR au ${longDate(ctx.ref.benchmarks.estr.date)} (BCE), référence des comptes à terme et fonds monétaires`
        : `Moyenne ${ctx.ref.benchmarks.fondsEuros.year} (ACPR), nette de frais de gestion`,
    })),
  ];
  lines.forEach((l) => {
    const n = sh.rows.length + 1;
    const net = l.gross * (1 - l.tax / 100);
    const dbl = doublingYears(net);
    sh.row([
      { v: l.name, s: 'bold' },
      { v: frac(l.gross), s: 'percent' },
      { v: frac(l.tax), s: 'percent' },
      { f: `B${n}*(1-C${n})`, v: frac(net), s: 'percentBold' },
      { f: `(1+D${n})/(1+$B$${r.infl})-1`, v: (1 + frac(net)) / (1 + frac(inflation.rate)) - 1, s: 'percent' },
      dbl && Number.isFinite(dbl) ? { v: dbl, s: 'number' } : '—',
      l.note,
    ]);
  });
  sh.blank();

  // Bloc 5 : Projection annuelle des livrets sur 20 ans avec séparation Fonds investis vs Intérêts composés
  if (models.length && models[0].years?.length) {
    const yearsCount = models[0].years.length;
    const ph = sh.row([
      'Au 31 décembre',
      'Fonds investis cumulés (€)',
      'Versements de l\'année (€)',
      'Intérêts de l\'année (€)',
      'Intérêts composés cumulés (€)',
      'Dont intérêts sur intérêts (€)',
      'Part des intérêts (%)',
      'Solde total prévu (€)',
      'Pouvoir d\'achat (€ d\'aujourd\'hui)',
    ], 'header');

    let cumInterest = 0;
    for (let k = 0; k < yearsCount; k++) {
      const n = ph + 1 + k;
      const year = models[0].years[k].year;
      const totalEnd = models.reduce((s, m) => s + m.years[k].end, 0);
      const yrInterest = models.reduce((s, m) => s + m.years[k].interest, 0);
      const yrCompound = models.reduce((s, m) => s + m.years[k].compound, 0);
      const yrDeposits = models.reduce((s, m) => s + m.years[k].deposits, 0);
      cumInterest += yrInterest;
      const cumInvested = Math.max(0, totalEnd - cumInterest);
      const days = (Date.UTC(year, 11, 31) - Date.parse(`${ctx.today}T00:00:00Z`)) / 86400000;
      const realVal = eur(totalEnd) / (1 + frac(inflation.rate)) ** (days / 365.25);

      sh.row([
        { v: year, s: 'integer' },
        { f: `H${n}-E${n}`, v: eur(cumInvested), s: 'euroBold' },
        { v: eur(yrDeposits), s: 'euro' },
        { v: eur(yrInterest), s: 'euroGain' },
        k === 0 ? { f: `D${n}`, v: eur(cumInterest), s: 'euroGain' } : { f: `E${n - 1}+D${n}`, v: eur(cumInterest), s: 'euroGain' },
        { v: eur(yrCompound), s: 'euroGain' },
        { f: `IF(H${n}>0,E${n}/H${n},0)`, v: totalEnd > 0 ? cumInterest / totalEnd : 0, s: 'percentGain' },
        { v: eur(totalEnd), s: 'euroBold' },
        { f: `H${n}/(1+$B$${r.infl})^(${days.toFixed(0)}/365.25)`, v: realVal, s: 'euro' },
      ]);
    }
    const pl = ph + yearsCount;
    sh.chart({
      type: 'col',
      stacked: true,
      title: 'Projection des Livrets : Fonds investis cumulés vs Intérêts composés cumulés (€)',
      from: `A${pl + 3}`,
      to: `I${pl + 23}`,
      categories: `A${ph + 1}:A${pl}`,
      series: [
        { name: 'Fonds investis cumulés (€)', ref: `B${ph + 1}:B${pl}`, color: COBALT },
        { name: 'Intérêts composés cumulés (€)', ref: `E${ph + 1}:E${pl}`, color: EMERALD },
      ],
    });
  }
}

/**
 * 9. Feuille « Mouvements Épargne » : virements rattachés aux livrets et mouvements en attente.
 */
function addSavingsMovementsSheet(wb, ctx) {
  const sh = wb.addSheet('Mouvements Épargne', { widths: [14, 24, 46, 16, 14, 26], freeze: 4 });
  const names = ctx.models.map((_, i) => ctx.titleOf(i));

  sh.row([{ v: 'MOUVEMENTS D\'ÉPARGNE RATTACHÉS AUX LIVRETS & VIREMENTS À AFFECTER', s: 'title' }]);
  sh.merge('A1:F1');
  sh.row([{ v: 'Historique de tous les versements et retraits identifiés dans vos relevés bancaires.', s: 'note' }]);
  sh.merge('A2:F2');
  sh.blank();

  sh.row(['Date', 'Livret', 'Libellé du relevé', 'Montant (€)', 'Sens', 'Mode de rattachement'], 'header');
  const moves = ctx.livrets.flatMap((l, i) => (ctx.flows.get(l.id) ?? []).map((f) => ({ ...f, livret: names[i] })))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (moves.length) {
    for (const f of moves) {
      sh.row([
        { v: excelDate(f.date), s: 'date' },
        { v: f.livret, s: 'bold' },
        f.label,
        { v: eur(f.amount), s: f.amount >= 0 ? 'euroGain' : 'euro' },
        f.amount > 0 ? 'Versement' : 'Retrait',
        f.manual ? 'Rattaché manuellement' : 'Détecté automatiquement',
      ]);
    }
  } else {
    sh.row([{ v: 'Aucun mouvement rattaché à un livret pour le moment.', s: 'note' }]);
  }

  if (ctx.unmatched?.length) {
    sh.blank();
    sh.row(['Mouvements d\'épargne non rattachés à un livret', 'Compte / Profil', 'Libellé du relevé', 'Montant (€)', 'Sens', 'Statut'], 'header');
    for (const tx of ctx.unmatched) {
      sh.row([
        { v: excelDate(tx.date), s: 'date' },
        ctx.names[tx.profile] ?? tx.profile,
        tx.label,
        { v: eur(tx.amount), s: 'euro' },
        tx.type === 'sortie' ? 'Versement épargne' : 'Retrait épargne',
        'À rattacher dans l\'onglet Épargne',
      ]);
    }
  }
}

/**
 * 10. Feuille « Objectifs & Stratégies » : grille des 4 stratégies et confrontation des objectifs.
 */
function addGoalsAndStrategiesSheet(wb, ctx) {
  const { inflation, market: m } = ctx;
  const sh = wb.addSheet('Objectifs & Stratégies', { widths: [34, 16, 18, 18, 18, 18, 18, 36], freeze: 4 });

  sh.row([{ v: 'OBJECTIFS DE VIE & CONFRONTATION AUX 4 STRATÉGIES D\'INVESTISSEMENT', s: 'title' }]);
  sh.merge('A1:H1');
  sh.row([{
    v: `Hypothèse de marché : ${EQUITY_CHOICES.find((c) => c.id === m.equity)?.text ?? ''}, frais ETF déduits (${(m.equityRate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %/an sur actions, ${(m.safeRate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %/an sur livrets).`,
    s: 'note',
  }]);
  sh.merge('A2:H2');
  sh.blank();

  // Grille de référence des 4 stratégies
  sh.row([
    '1. GRILLE DES 4 STRATÉGIES DE RÉFÉRENCE',
    'Part en Actions (PEA)',
    'Part en Livrets',
    'Rendement annuel combiné (brut)',
    'Impact d\'un krach type 2008 (−40 % actions)',
    'Horizon recommandé',
    'Profil de risque',
    'Description',
  ], 'header');

  const horizons = ['Moins de 3 ans', '3 à 5 ans', '5 à 8 ans', '8 ans et plus'];
  STRATEGIES.forEach((st, i) => {
    const combinedRate = st.equity * m.equityRate + (1 - st.equity) * m.safeRate;
    const crashImpact = st.equity * CRASH;
    sh.row([
      { v: st.name, s: 'bold' },
      { v: st.equity, s: 'percent' },
      { v: 1 - st.equity, s: 'percent' },
      { v: combinedRate, s: 'percentBold' },
      { v: -crashImpact, s: 'percent' },
      horizons[i] ?? '',
      st.equity === 0 ? 'Capital garanti' : st.equity <= 0.35 ? 'Modéré' : st.equity <= 0.65 ? 'Équilibré' : 'Dynamique long terme',
      st.text,
    ]);
  });
  sh.blank();

  const rInfl = sh.row(['Inflation annuelle retenue (IPC)', { v: frac(inflation.rate), s: 'percent' }, 'Utilisée pour exprimer chaque objectif en pouvoir d\'achat d\'aujourd\'hui']);

  if (!ctx.goals?.length) {
    sh.blank();
    sh.row([{ v: 'Aucun objectif particulier n\'a encore été saisi dans l\'onglet « Investir ». Utilisez la grille des 4 stratégies ci-dessus comme repère d\'allocation.', s: 'note' }]);
    return;
  }

  const month = ctx.today.slice(0, 7);
  for (const goal of ctx.goals) {
    const result = confront(goal, m, month);
    sh.blank();
    sh.row(['Objectif', 'Montant visé (€)', 'Échéance', 'Déjà mis de côté (€)', 'Versement mensuel (€)', 'Mois restants', 'Montant visé en € d\'aujourd\'hui', ''], 'header');
    const g = sh.rows.length + 1;
    sh.row([
      { v: goal.name, s: 'bold' },
      { v: eur(goal.target), s: 'euroBold' },
      monthLong(goal.deadline),
      { v: eur(goal.saved), s: 'euro' },
      { v: eur(goal.monthly), s: 'euro' },
      { v: result.months, s: 'integer' },
      { f: `B${g}/(1+$B$${rInfl})^(F${g}/12)`, v: eur(goal.target / (1 + inflation.rate / 100) ** result.years), s: 'euro' },
      '',
    ]);
    sh.row(['Stratégie comparée', 'Part d\'actions', 'Net à l\'échéance (€)', 'Écart vs objectif (€)', 'Versement nécessaire (€/mois)', 'Perte si krach 2008 (€)', 'Conseillée', 'Détail de l\'allocation'], 'header');
    for (const row of result.rows) {
      const n = sh.rows.length + 1;
      sh.row([
        { v: row.strategy.name, s: row.suggested ? 'bold' : 'default' },
        { v: row.strategy.equity, s: 'percent' },
        { v: eur(row.net), s: row.suggested ? 'euroBold' : 'euro' },
        { f: `C${n}-$B$${g}`, v: eur(row.gap), s: row.gap >= 0 ? 'euroGain' : 'euro' },
        row.needed == null ? 'Hors plafond PEA' : { v: eur(row.needed), s: 'euro' },
        { v: eur(row.crash), s: 'euro' },
        row.suggested ? 'Oui (recommandée)' : '',
        row.strategy.text,
      ]);
    }
  }
}

/**
 * 11. Feuille « Marchés, Fiscalité & Taux » : indices boursiers, fiscalité PEA vs CTO,
 * historique de 100 € depuis 2020, barème des taux réglementés, méthodologie et sources.
 */
function addMarketsTaxAndRatesSheet(wb, ctx) {
  const sh = wb.addSheet('Marchés, Fiscalité & Taux', {
    widths: [28, 16, 16, 16, 16, 18, 20, 44],
    freeze: 4,
  });

  sh.row([{ v: 'INDICES BOURSIERS, FISCALITÉ PEA VS COMPTE-TITRES, BARÈME DES TAUX & MÉTHODOLOGIE', s: 'title' }]);
  sh.merge('A1:H1');
  sh.row([{
    v: 'Toutes les séries historiques, barèmes fiscaux et sources officielles (INSEE, BCE, MSCI, Banque de France) utilisés par le site.',
    s: 'note',
  }]);
  sh.merge('A2:H2');
  sh.blank();

  // Bloc 1 : Indices boursiers depuis 2016
  const peaYears = yearsOf(INDEX_RETURNS[0]);
  const ixHead = sh.row(['1. RENDEMENTS ANNUELS DES INDICES (EN €)', ...INDEX_RETURNS.map((i) => i.name), 'Inflation (IPC INSEE)', '', ''], 'header');
  const ixFirst = ixHead + 1;
  peaYears.forEach((y) => {
    sh.row([
      String(y),
      ...INDEX_RETURNS.map((i) => ({ v: frac(i.returns[y]), s: 'percent' })),
      ctx.ref.annual[y] == null ? '' : { v: frac(ctx.ref.annual[y]), s: 'percent' },
    ]);
  });
  const ixLast = ixFirst + peaYears.length - 1;
  const ixInfl = colName(1 + INDEX_RETURNS.length);
  const cagr = (col, from) => `EXP(SUMPRODUCT(LN(1+${col}${from}:${col}${ixLast}))/${ixLast - from + 1})-1`;
  const cagrValue = (index, count) => peaYears.slice(-count).reduce((g, y) => g * (1 + frac(index.returns[y])), 1) ** (1 / count) - 1;

  for (const count of [10, 5]) {
    const from = ixLast - count + 1;
    sh.row([
      { v: `Moyenne composée ${count} ans (par an)`, s: 'bold' },
      ...INDEX_RETURNS.map((i, k) => ({ f: cagr(colName(1 + k), from), v: cagrValue(i, count), s: 'percentBold' })),
      { f: cagr(ixInfl, from), v: peaYears.slice(-count).reduce((g, y) => g * (1 + frac(ctx.ref.annual[y] ?? 0)), 1) ** (1 / count) - 1, s: 'percent' },
    ]);
  }
  const avg10Row = ixLast + 1;
  sh.row([
    { v: 'Rendement net PEA sur 10 ans (par an)', s: 'bold' },
    ...INDEX_RETURNS.map((i, k) => {
      const c = colName(1 + k);
      const rate = cagrValue(i, 10);
      return {
        f: `(1+((1+${c}${avg10Row})^10-1)*(1-${(PEA.taxAfter / 100).toFixed(3)}))^(1/10)-1`,
        v: (1 + ((1 + rate) ** 10 - 1) * (1 - PEA.taxAfter / 100)) ** 0.1 - 1,
        s: 'percentGain',
      };
    }),
    '',
  ]);
  sh.blank();

  // Bloc 2 : Fiscalité PEA vs Compte-titres selon la durée
  const worldRate = cagrValue(INDEX_RETURNS[0], 10);
  sh.row(['2. FISCALITÉ DU PEA VS COMPTE-TITRES (CTO)', 'Taux sur les gains', 'Valeur de 100 € investis', 'Part des gains (%)', 'Fiscalité prélevée (%)', 'Rendement net PEA / an', 'Rendement net CTO / an', 'Avantage du PEA sur 100 €'], 'header');
  for (const y of [3, 5, 8, 10, 15, 20, 25]) {
    const n = sh.rows.length + 1;
    const tax = y < PEA.years ? PEA.taxBefore : PEA.taxAfter;
    const growth = (1 + worldRate) ** y;
    const netPeaVal = 100 + (100 * growth - 100) * (1 - frac(tax));
    const netCtoVal = 100 + (100 * growth - 100) * (1 - TAX.pfu / 100);
    sh.row([
      { v: `Retrait après ${y} ans`, s: y === 5 || y === 10 || y === 20 ? 'bold' : 'default' },
      { v: frac(tax), s: 'percent' },
      { f: `100*(1+$B$${avg10Row})^${y}`, v: 100 * growth, s: 'euro' },
      { f: `(C${n}-100)/C${n}`, v: (growth - 1) / growth, s: 'percent' },
      { f: `D${n}*B${n}`, v: (growth - 1) / growth * frac(tax), s: 'percentBold' },
      { f: `((100+(C${n}-100)*(1-B${n}))/100)^(1/${y})-1`, v: (1 + (growth - 1) * (1 - frac(tax))) ** (1 / y) - 1, s: 'percentGain' },
      { f: `((100+(C${n}-100)*(1-${TAX.pfu / 100}))/100)^(1/${y})-1`, v: (1 + (growth - 1) * (1 - TAX.pfu / 100)) ** (1 / y) - 1, s: 'percent' },
      { f: `(100+(C${n}-100)*(1-B${n}))-(100+(C${n}-100)*(1-${TAX.pfu / 100}))`, v: netPeaVal - netCtoVal, s: 'euroGain' },
    ]);
  }
  sh.blank();

  // Bloc 3 : Indices d'inflation (IPC, IPCH, Sous-jacente)
  sh.row(['3. INDICES OFFICIELS D\'INFLATION', 'Taux sur 1 an', 'Définition officielle', '', '', '', '', ''], 'header');
  const indices = [
    ['IPC (INSEE)', ctx.inflation.rate, 'Indice des prix à la consommation : mesure officielle de référence en France.'],
    ['IPCH (Eurostat)', ctx.ref.indices.ipch, 'Indice des prix harmonisé pour la zone euro (cible de 2 % de la BCE).'],
    ['Inflation sous-jacente', ctx.ref.indices.core, 'Tendance de fond des prix hors énergie et produits frais volatils.'],
  ];
  for (const [label, rate, def] of indices) {
    const rIdx = sh.row([{ v: label, s: 'bold' }, { v: frac(rate), s: 'percent' }, def]);
    sh.merge(`C${rIdx}:H${rIdx}`);
  }
  sh.blank();

  // Bloc 4 : Historique de 100 € depuis 2020 (Prix vs Livret A vs LEP)
  const products = ['livretA', 'lep'];
  const hist = history(ctx.rates, products, ctx.ref.annual);
  sh.row(['4. ÉVOLUTION DE 100 € DEPUIS 2020', 'Inflation moyenne', 'Taux Livret A', 'Taux LEP', 'Prix (base 100)', 'Livret A (base 100)', 'LEP (base 100)', ''], 'header');
  sh.row([`Début ${hist.from}`, '', '', '', { v: 100, s: 'number' }, { v: 100, s: 'number' }, { v: 100, s: 'number' }, '']);
  hist.rows.forEach((row, k) => {
    const pt = hist.points[k + 1];
    sh.row([
      `Fin ${row.year}`,
      { v: frac(row.inflation), s: 'percent' },
      { v: frac(row.livretA), s: 'percent' },
      { v: frac(row.lep), s: 'percent' },
      { v: pt.prices, s: 'number' },
      { v: pt.livretA, s: 'number' },
      { v: pt.lep, s: 'number' },
      '',
    ]);
  });
  sh.blank();

  // Bloc 5 : Barème historique des taux des livrets
  sh.row(['5. BARÈME HISTORIQUE DES LIVRETS', 'Livret A', 'LEP', 'Origine de la donnée', '', '', '', ''], 'header');
  for (const row of ctx.rates) {
    sh.row([
      { v: excelDate(row.from), s: 'date' },
      row.livretA == null ? '' : { v: frac(row.livretA), s: 'percent' },
      row.lep == null ? '' : { v: frac(row.lep), s: 'percent' },
      row.from > ctx.today ? 'Hypothèse future' : row.source === 'saisi' ? 'Saisi manuellement' : 'Barème officiel',
    ]);
  }
  sh.blank();

  // Bloc 6 : Méthodologie & Sources officielles
  sh.row(['6. MÉTHODOLOGIE & SOURCES OFFICIELLES', 'Explication / Lien direct', '', '', '', '', '', ''], 'header');
  for (const [k, v] of [
    ['Intérêts des livrets', 'Calcul par quinzaine (1er au 15 et 16 à fin de mois). Intérêts = solde en valeur × taux ÷ 24, capitalisés chaque 31 décembre.'],
    ['Rendement réel', '(1 + taux) ÷ (1 + inflation) − 1 (relation de Fisher).'],
    ['Matelas de sécurité', 'Solde des livrets ÷ dépenses mensuelles moyennes des titulaires (hors épargne et virements).'],
    ...INVEST_METHOD,
  ]) {
    const rMet = sh.row([{ v: k, s: 'bold' }, { v, s: 'note' }]);
    sh.merge(`B${rMet}:H${rMet}`);
  }
  for (const [k, v] of [
    [`Inflation IPC, IPCH, sous-jacente (INSEE, séries ${Object.values(INSEE_SERIES).join(', ')})`, SOURCES.insee.url],
    ['€STR (BCE)', SOURCES.bce.url],
    ['Taux du Livret A et du LEP', SOURCES.servicePublic.url],
    ...INVEST_SOURCES,
  ]) {
    const rSrc = sh.row([{ v: k, s: 'bold' }, { v, s: 'link' }]);
    sh.merge(`B${rSrc}:H${rSrc}`);
  }
}

/**
 * Fonctions de compatibilité synchrone pour les appels directs existants.
 */
export function addInvestmentSheets(wb, ctx) {
  addPeaDetailSheets(wb, ctx);
  addGoalsAndStrategiesSheet(wb, ctx);
  addMarketsTaxAndRatesSheet(wb, ctx);
}

export function buildEpargneWorkbook(ctx, data = {}) {
  const wb = new Workbook({ title: 'Mon Budget : Patrimoine et Épargne', author: 'Mon Budget' });
  const mergedCtx = {
    ...ctx,
    flows: data.flows ?? ctx.flows ?? new Map(),
  };
  addPatrimoineSheets(wb, mergedCtx);
  addPeaDetailSheets(wb, mergedCtx);
  addLivretsAndSafetySheet(wb, mergedCtx);
  addSavingsMovementsSheet(wb, mergedCtx);
  if (mergedCtx.market) addGoalsAndStrategiesSheet(wb, mergedCtx);
  addMarketsTaxAndRatesSheet(wb, mergedCtx);
  return wb;
}

export function buildInvestWorkbook(ctx) {
  const wb = new Workbook({ title: 'Mon Budget : Patrimoine et Investissement', author: 'Mon Budget' });
  addPatrimoineSheets(wb, ctx);
  addPeaDetailSheets(wb, ctx);
  if (ctx.livretModels?.length) {
    addLivretsAndSafetySheet(wb, {
      ...ctx,
      models: ctx.livretModels,
      summary: ctx.livretSummary ?? { balance: 0, rate: 1.7 },
      livrets: ctx.livrets ?? ctx.livretModels,
      titleOf: (i) => PRODUCTS[ctx.livretModels[i]?.product]?.name ?? `Livret #${i + 1}`,
    });
  }
  addGoalsAndStrategiesSheet(wb, ctx);
  addMarketsTaxAndRatesSheet(wb, ctx);
  return wb;
}
