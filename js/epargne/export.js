/**
 * Export de l'écran « Épargne » en classeur Excel : une feuille par table,
 * des formules visibles pour chaque calcul (rendement réel, gain réel…) et
 * des graphiques Excel natifs. Tout est fabriqué sur cet appareil.
 */
import { Workbook, colName, excelDate } from '../export/xlsx-writer.js';
import { benchmarks, grossEquivalent, history } from './indicators.js';
import { INDEX_RETURNS, PEA, yearsOf } from './pea.js';
import { PRODUCTS, SAFETY_MONTHS, TAX } from './livret-rates.js';
import { INSEE_SERIES, SOURCES } from './live-data.js';
import { bulletinItems } from './widgets.js';
import { longDate, monthLong } from './format.js';

// Couleurs des séries (hex sans #), reprises du thème clair
const VIOLET = '6C47FF';
const LIN = 'C9C2DD';
const ENCRE = '1B1530';
const ROSE = 'F0509A';

const eur = (cents) => Math.round(cents) / 100;
const frac = (pct) => pct / 100;

/**
 * @param {object} ctx  contexte des widgets (models, livrets, summary, inflation, rates, titleOf, expenses, holders, today)
 * @param {object} data { flows: Map, projection: models sur 10 ans, spending: { months, categories, byMonth } }
 */
export function buildEpargneWorkbook(ctx, data) {
  const wb = new Workbook({ title: 'Mon Budget — Épargne', author: 'Mon Budget' });
  const { models, summary, inflation } = ctx;
  const names = models.map((_, i) => ctx.titleOf(i));
  const today = longDate(ctx.today);
  const inflationLabel = `INSEE, IPC sur un an, ${monthLong(inflation.month)}`;

  // ——— Synthèse ——————————————————————————————————————————————————
  const syn = wb.addSheet('Synthèse', { widths: [36, 18, 22, 20, 20, 16] });
  syn.row([{ v: 'Mon Budget — vos livrets face à l\'inflation', s: 'title' }]);
  syn.merge('A1:F1');
  syn.row([{ v: `Export du ${today}. Soldes estimés à partir du solde saisi et des relevés importés ; taux et inflation à jour au ${longDate(ctx.today)} dans l'app.`, s: 'note' }]);
  syn.merge('A2:F2');
  syn.blank();
  syn.row(['Indicateur', 'Valeur', 'Méthode'], 'header');
  const r = {};
  r.total = syn.row([{ v: 'Total sur les livrets', s: 'bold' }, { v: eur(summary.balance), s: 'euroBold' }, 'Solde estimé aujourd\'hui, somme des livrets']);
  r.rate = syn.row(['Taux moyen pondéré (par an)', { v: frac(summary.rate), s: 'percent' }, 'Σ (solde × taux) ÷ Σ soldes ; taux nets d\'impôt']);
  r.infl = syn.row(['Inflation (IPC) sur un an', { v: frac(inflation.rate), s: 'percent' }, inflationLabel]);
  const real = (1 + frac(summary.rate)) / (1 + frac(inflation.rate)) - 1;
  r.real = syn.row([{ v: 'Rendement réel (par an)', s: 'bold' }, { f: `(1+B${r.rate})/(1+B${r.infl})-1`, v: real, s: 'percentBold' }, 'Relation de Fisher : (1 + taux) ÷ (1 + inflation) − 1']);
  r.interest = syn.row(['Intérêts sur 12 mois', { f: `B${r.total}*B${r.rate}`, v: eur(summary.balance) * frac(summary.rate), s: 'euro' }, 'Solde × taux moyen, au solde actuel']);
  r.erosion = syn.row(['Hausse des prix sur la même somme', { f: `B${r.total}*B${r.infl}`, v: eur(summary.balance) * frac(inflation.rate), s: 'euro' }, 'Solde × inflation : ce qu\'il faudra en plus pour acheter la même chose']);
  r.gain = syn.row([{ v: 'Gain réel sur 12 mois', s: 'boldTotal' }, { f: `B${r.interest}-B${r.erosion}`, v: eur(summary.balance) * (frac(summary.rate) - frac(inflation.rate)), s: 'euroTotal' }, 'Intérêts − hausse des prix']);
  if (ctx.expenses) {
    const holderNote = ctx.holders ? ` de ${ctx.holders}` : '';
    syn.row(['Dépenses mensuelles moyennes', { v: eur(ctx.expenses.average), s: 'euro' }, `Dépenses${holderNote}, hors épargne et virements (${ctx.expenses.months.map(monthLong).join(', ')})`]);
    const row = syn.rows.length;
    syn.row(['Matelas de sécurité (mois de dépenses)', { f: `B${r.total}/B${row}`, v: summary.balance / ctx.expenses.average, s: 'months' }, `Solde des livrets ÷ dépenses mensuelles moyennes ; fourchette souvent conseillée : ${SAFETY_MONTHS.min} à ${SAFETY_MONTHS.max} mois`]);
    for (const n of [SAFETY_MONTHS.min, SAFETY_MONTHS.max]) {
      syn.row([`Objectif ${n} mois`, { f: `${n}*B${row}`, v: n * eur(ctx.expenses.average), s: 'euro' }, `${n} × dépenses mensuelles moyennes`]);
    }
  }
  syn.blank();
  const head = syn.row(['Livret', 'Solde', 'Taux', 'Intérêts sur 12 mois', 'Hausse des prix', 'Gain réel'], 'header');
  const first = head + 1;
  models.forEach((m, i) => {
    const n = first + i;
    syn.row([
      names[i],
      { v: eur(m.balance), s: 'euro' },
      { v: frac(m.rate), s: 'percent' },
      { f: `B${n}*C${n}`, v: eur(m.next12.interest), s: 'euro' },
      { f: `B${n}*$B$${r.infl}`, v: eur(m.next12.erosion), s: 'euro' },
      { f: `D${n}-E${n}`, v: eur(m.next12.gain), s: 'euroBold' },
    ]);
  });
  const last = first + models.length - 1;
  // Total entre liteaux (double filet indigo)
  syn.row([{ v: 'Total', s: 'boldTotal' },
    { f: `SUM(B${first}:B${last})`, v: eur(summary.balance), s: 'euroTotal' }, { v: '', s: 'boldTotal' },
    { f: `SUM(D${first}:D${last})`, v: eur(summary.yearlyInterest), s: 'euroTotal' },
    { f: `SUM(E${first}:E${last})`, v: eur(summary.yearlyErosion), s: 'euroTotal' },
    { f: `SUM(F${first}:F${last})`, v: eur(summary.realGain), s: 'euroTotal' }]);
  syn.chart({
    type: 'col', title: 'Sur 12 mois : intérêts face à la hausse des prix (€)',
    from: `A${last + 4}`, to: `F${last + 23}`, categories: `A${first}:A${last}`,
    series: [
      { name: 'Intérêts', ref: `D${first}:D${last}`, color: VIOLET },
      { name: 'Hausse des prix', ref: `E${first}:E${last}`, color: LIN },
      { name: 'Gain réel', ref: `F${first}:F${last}`, color: ROSE },
    ],
  });

  // ——— Livrets ———————————————————————————————————————————————————
  const liv = wb.addSheet('Livrets', { widths: [18, 14, 16, 16, 14, 10, 12, 14, 18, 16, 16, 18, 16], freeze: 1 });
  liv.row(['Livret', 'Titulaire', 'Solde estimé', 'Solde saisi', 'Saisi le', 'Taux net', 'Taux réel', 'Plafond',
    'Versements encore possibles', `Intérêts ${ctx.today.slice(0, 4)}`, 'Dont déjà acquis', 'Versement mensuel prévu',
    `Brut équivalent (${TAX.pfu.toLocaleString('fr-FR')} %)`], 'header');
  models.forEach((m, i) => {
    const l = ctx.livrets[i];
    const n = i + 2;
    liv.row([
      PRODUCTS[l.product].name, ctx.names[l.profile] ?? l.profile,
      { v: eur(m.balance), s: 'euro' }, { v: eur(l.anchor.balance), s: 'euro' }, { v: excelDate(l.anchor.date), s: 'date' },
      { v: frac(m.rate), s: 'percent' },
      { f: `(1+F${n})/(1+'Synthèse'!$B$${r.infl})-1`, v: m.real, s: 'percent' },
      { v: eur(m.cap), s: 'euro' },
      { f: `MAX(0,H${n}-C${n})`, v: eur(m.capRoom), s: 'euro' },
      { v: eur(m.interestYear), s: 'euro' }, { v: eur(m.interestEarned), s: 'euro' },
      { v: eur(m.plan.monthly), s: 'euro' },
      { f: `F${n}/(1-${TAX.pfu / 100})`, v: frac(grossEquivalent(m.rate)), s: 'percent' },
    ]);
  });
  const livLast = models.length + 1;
  liv.chart({
    type: 'bar', title: 'Solde et plafond de chaque livret (€)', from: `A${livLast + 3}`, to: `H${livLast + 20}`,
    categories: `A2:A${livLast}`,
    series: [
      { name: 'Solde estimé', ref: `C2:C${livLast}`, color: VIOLET },
      { name: 'Plafond', ref: `H2:H${livLast}`, color: LIN },
    ],
  });

  // ——— Mouvements ————————————————————————————————————————————————
  const mov = wb.addSheet('Mouvements', { widths: [12, 18, 46, 14, 12, 22], freeze: 1 });
  mov.row(['Date', 'Livret', 'Libellé du relevé', 'Montant', 'Sens', 'Rattachement'], 'header');
  const moves = ctx.livrets.flatMap((l, i) => (data.flows.get(l.id) ?? []).map((f) => ({ ...f, livret: names[i] })))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const f of moves) {
    mov.row([
      { v: excelDate(f.date), s: 'date' }, f.livret, f.label, { v: eur(f.amount), s: 'euro' },
      f.amount > 0 ? 'versement' : 'retrait', f.manual ? 'rattaché à la main' : 'd\'après le libellé',
    ]);
  }
  if (!moves.length) mov.row([{ v: 'Aucun mouvement repéré dans les relevés importés.', s: 'note' }]);

  // ——— Projection ————————————————————————————————————————————————
  const pm = data.projection;
  const proj = wb.addSheet('Projection', { widths: [14, ...pm.map(() => 16), 16, 22, 18, 22, 18], freeze: 1 });
  const totalCol = colName(1 + pm.length);
  const realCol = colName(2 + pm.length);
  proj.row(['Au 31 décembre', ...names, 'Total', 'En euros d\'aujourd\'hui', 'Intérêts de l\'année', 'Dont intérêts sur intérêts', 'Versements de l\'année'], 'header');
  const yearsCount = pm[0].years.length;
  for (let k = 0; k < yearsCount; k++) {
    const n = k + 2;
    const year = pm[0].years[k].year;
    const total = pm.reduce((s, m) => s + m.years[k].end, 0);
    const days = (Date.UTC(year, 11, 31) - Date.parse(`${ctx.today}T00:00:00Z`)) / 86400000;
    proj.row([
      year,
      ...pm.map((m) => ({ v: eur(m.years[k].end), s: 'euro' })),
      { f: `SUM(B${n}:${colName(pm.length)}${n})`, v: eur(total), s: 'euroBold' },
      { f: `${totalCol}${n}/(1+'Synthèse'!$B$${r.infl})^(${days.toFixed(0)}/365.25)`, v: eur(total) / (1 + frac(inflation.rate)) ** (days / 365.25), s: 'euro' },
      { v: eur(pm.reduce((s, m) => s + m.years[k].interest, 0)), s: 'euro' },
      { v: eur(pm.reduce((s, m) => s + m.years[k].compound, 0)), s: 'euro' },
      { v: eur(pm.reduce((s, m) => s + m.years[k].deposits, 0)), s: 'euro' },
    ]);
  }
  const projLast = yearsCount + 1;
  proj.row([]);
  proj.row([{ v: `Hypothèses : taux actuels maintenus (sauf taux futurs saisis), virements réguliers repérés dans les relevés poursuivis jusqu'aux plafonds, inflation de ${inflation.rate.toLocaleString('fr-FR')} % par an. Intérêts calculés par quinzaine, versés et capitalisés chaque 31 décembre (intérêts composés) ; « dont intérêts sur intérêts » = part produite par les intérêts versés depuis cette année.`, s: 'note' }]);
  proj.merge(`A${projLast + 2}:${colName(5 + pm.length)}${projLast + 2}`);
  proj.chart({
    type: 'line', title: 'Solde prévu et pouvoir d\'achat (€)', from: `A${projLast + 4}`, to: `${colName(4 + pm.length)}${projLast + 24}`,
    categories: `A2:A${projLast}`,
    series: [
      { name: 'Total prévu', ref: `${totalCol}2:${totalCol}${projLast}`, color: VIOLET },
      { name: 'En euros d\'aujourd\'hui', ref: `${realCol}2:${realCol}${projLast}`, color: ENCRE, dash: true },
    ],
  });

  // ——— Depuis 2020 ———————————————————————————————————————————————
  const products = Object.keys(PRODUCTS).filter((p) => models.some((m) => m.product === p));
  const hist = history(ctx.rates, products, ctx.ref.annual);
  const his = wb.addSheet('Depuis 2020', { widths: [10, 12, ...products.flatMap(() => [16, 14]), 16, ...products.map(() => 18)], freeze: 1 });
  const pCols = products.map((_, i) => ({ rate: colName(2 + i * 2), real: colName(3 + i * 2) }));
  const priceCol = colName(2 + products.length * 2);
  const idxCols = products.map((_, i) => colName(3 + products.length * 2 + i));
  his.row(['Année', 'Inflation moyenne', ...products.flatMap((p) => [`Taux ${PRODUCTS[p].name} (moyen)`, `Réel ${PRODUCTS[p].name}`]),
    'Prix (base 100)', ...products.map((p) => `${PRODUCTS[p].name} (base 100)`)], 'header');
  his.row([`Début ${hist.from}`, '', ...products.flatMap(() => ['', '']), { v: 100, s: 'number' }, ...products.map(() => ({ v: 100, s: 'number' }))]);
  hist.rows.forEach((row, k) => {
    const n = k + 3;
    const pt = hist.points[k + 1];
    his.row([
      `Fin ${row.year}`,
      { v: frac(row.inflation), s: 'percent' },
      ...products.flatMap((p, i) => [
        { v: frac(row[p]), s: 'percent' },
        { f: `(1+${pCols[i].rate}${n})/(1+B${n})-1`, v: row[`${p}Real`], s: 'percent' },
      ]),
      { f: `${priceCol}${n - 1}*(1+B${n})`, v: pt.prices, s: 'number' },
      ...products.map((p, i) => ({ f: `${idxCols[i]}${n - 1}*(1+${pCols[i].rate}${n})`, v: pt[p], s: 'number' })),
    ]);
  });
  const hisLast = hist.rows.length + 2;
  his.row([]);
  his.row([{ v: 'Taux moyen de l\'année = moyenne des 24 quinzaines (taux officiels). Inflation : moyenne annuelle de l\'IPC (INSEE). Indices : 100 € placés le 1er janvier ' + hist.from + ', intérêts réinvestis chaque 31 décembre.', s: 'note' }]);
  his.merge(`A${hisLast + 2}:${idxCols.at(-1)}${hisLast + 2}`);
  his.chart({
    type: 'line', title: `100 € depuis le 1er janvier ${hist.from} face aux prix`, from: `A${hisLast + 4}`, to: `${idxCols.at(-1)}${hisLast + 24}`,
    categories: `A2:A${hisLast}`, min: 95,
    series: [
      { name: 'Prix', ref: `${priceCol}2:${priceCol}${hisLast}`, color: ENCRE, dash: true },
      ...products.map((p) => ({ name: PRODUCTS[p].name, ref: `${idxCols[products.indexOf(p)]}2:${idxCols[products.indexOf(p)]}${hisLast}`, color: p === 'lep' ? ROSE : VIOLET })),
    ],
  });

  // ——— Comparateur ———————————————————————————————————————————————
  const cmp = wb.addSheet('Comparateur', { widths: [30, 12, 14, 12, 16, 48], freeze: 1 });
  cmp.row(['Placement', 'Taux brut', 'Imposition', 'Taux net', 'Rendement réel', 'Remarque'], 'header');
  const lines = [
    ...models.map((m, i) => ({ name: names[i], gross: m.rate, tax: 0, note: 'Livret réglementé : ni impôt ni prélèvements sociaux' })),
    ...benchmarks(ctx.ref.benchmarks).map((b) => ({
      name: b.name, gross: b.gross, tax: b.id === 'estr' ? TAX.pfu : TAX.socialAssuranceVie,
      note: b.id === 'estr'
        ? `€STR au ${longDate(ctx.ref.benchmarks.estr.date)} (BCE), comme un compte à terme ou un fonds monétaire`
        : `Moyenne ${ctx.ref.benchmarks.fondsEuros.year} (ACPR), nette de frais de gestion`,
    })),
  ];
  lines.forEach((l, k) => {
    const n = k + 2;
    const net = l.gross * (1 - l.tax / 100);
    cmp.row([
      l.name, { v: frac(l.gross), s: 'percent' }, { v: frac(l.tax), s: 'percent' },
      { f: `B${n}*(1-C${n})`, v: frac(net), s: 'percentBold' },
      { f: `(1+D${n})/(1+'Synthèse'!$B$${r.infl})-1`, v: (1 + frac(net)) / (1 + frac(inflation.rate)) - 1, s: 'percent' },
      l.note,
    ]);
  });
  const cmpLast = lines.length + 1;
  cmp.row(['Inflation (IPC)', { v: frac(inflation.rate), s: 'percent' }, '', { v: frac(inflation.rate), s: 'percent' }, '', inflationLabel]);
  cmp.chart({
    type: 'bar', title: 'Taux nets comparés à l\'inflation', from: `A${cmpLast + 4}`, to: `F${cmpLast + 22}`, percent: true,
    categories: `A2:A${cmpLast + 1}`, series: [{ name: 'Taux net', ref: `D2:D${cmpLast + 1}`, color: VIOLET }],
  });

  // ——— Indices d'inflation ——————————————————————————————————————————
  const ind = wb.addSheet('Indices d\'inflation', { widths: [16, 12, ...models.map(() => 16), 60], freeze: 1 });
  ind.row(['Indice', 'Inflation', ...names.map((n) => `Réel ${n}`), 'Définition'], 'header');
  const indices = [
    ['IPC', inflation.rate, 'Indice des prix à la consommation : la mesure officielle française.'],
    ['IPCH', ctx.ref.indices.ipch, 'Indice harmonisé européen, celui de la cible de 2 % de la BCE.'],
    ['Sous-jacente', ctx.ref.indices.core, 'Hors prix les plus volatils (énergie, produits frais, tarifs publics).'],
  ];
  indices.forEach(([label, rate, def], k) => {
    const n = k + 2;
    ind.row([label, { v: frac(rate), s: 'percent' },
      ...models.map((m) => ({ f: `(1+${frac(m.rate)})/(1+B${n})-1`, v: (1 + frac(m.rate)) / (1 + frac(rate)) - 1, s: 'percent' })), def]);
  });
  ind.row([]);
  ind.row([{ v: `Mesures sur un an, ${monthLong(ctx.ref.indices.month)} (INSEE).`, s: 'note' }]);

  // ——— Bulletin ——————————————————————————————————————————————————
  const bul = wb.addSheet('Bulletin', { widths: [30, 16, 16, 90], freeze: 1 });
  bul.row(['Indicateur', 'Verdict', 'Valeur', 'Explication'], 'header');
  const verdicts = { ok: 'Favorable', attention: 'À surveiller', defavorable: 'Défavorable' };
  for (const item of bulletinItems(ctx)) {
    bul.row([{ v: item.name, s: 'bold' }, verdicts[item.verdict], item.value.textContent.trim(), item.text]);
  }

  // ——— Dépenses par mois ———————————————————————————————————————————
  if (data.spending?.months.length) {
    const { months, categories, byMonth } = data.spending;
    const dep = wb.addSheet('Dépenses par mois', { widths: [16, ...categories.map(() => 14), 14], freeze: 1 });
    dep.row(['Mois', ...categories.map((c) => c.name), 'Total'], 'header');
    months.forEach((month, k) => {
      const n = k + 2;
      dep.row([monthLong(month), ...categories.map((c) => ({ v: eur(byMonth.get(month)?.get(c.id) ?? 0), s: 'euro' })),
        { f: `SUM(B${n}:${colName(categories.length)}${n})`, v: eur([...(byMonth.get(month)?.values() ?? [])].reduce((s, v) => s + v, 0)), s: 'euroBold' }]);
    });
    const depLast = months.length + 1;
    const totCol = colName(categories.length + 1);
    const holderNote = ctx.holders ? ` de ${ctx.holders}` : '';
    dep.row([]);
    dep.row([{ v: `Dépenses${holderNote}, hors épargne et virements entre comptes.`, s: 'note' }]);
    dep.chart({
      type: 'col', title: 'Dépenses mensuelles (€)', from: `A${depLast + 4}`, to: `${colName(Math.min(categories.length + 1, 9))}${depLast + 22}`,
      categories: `A2:A${depLast}`,
      // Une seule série : aucune teinte par catégorie, le détail est dans le tableau
      series: [{ name: 'Total des dépenses', ref: `${totCol}2:${totCol}${depLast}`, color: VIOLET }],
    });
  }

  // ——— PEA : indices ——————————————————————————————————————————————
  const peaYears = yearsOf(INDEX_RETURNS[0]);
  const ix = wb.addSheet('PEA indices', { widths: [10, ...INDEX_RETURNS.map(() => 16), 16], freeze: 1 });
  ix.row(['Année', ...INDEX_RETURNS.map((i) => i.name), 'Inflation (IPC)'], 'header');
  peaYears.forEach((y) => {
    ix.row([String(y), ...INDEX_RETURNS.map((i) => ({ v: frac(i.returns[y]), s: 'percent' })),
      ctx.ref.annual[y] == null ? '' : { v: frac(ctx.ref.annual[y]), s: 'percent' }]);
  });
  const ixLast = peaYears.length + 1;
  const ixInfl = colName(1 + INDEX_RETURNS.length);
  // SOMMEPROD accepte les plages sans formule matricielle
  const cagr = (col, from) => `EXP(SUMPRODUCT(LN(1+${col}${from}:${col}${ixLast}))/${ixLast - from + 1})-1`;
  const cagrValue = (index, count) => peaYears.slice(-count).reduce((g, y) => g * (1 + frac(index.returns[y])), 1) ** (1 / count) - 1;
  ix.row([]);
  for (const count of [10, 5]) {
    const from = ixLast - count + 1;
    ix.row([{ v: `Moyenne ${count} ans (par an)`, s: 'bold' },
      ...INDEX_RETURNS.map((i, k) => ({ f: cagr(colName(1 + k), from), v: cagrValue(i, count), s: 'percentBold' })),
      { f: cagr(ixInfl, from), v: peaYears.slice(-count).reduce((g, y) => g * (1 + frac(ctx.ref.annual[y] ?? 0)), 1) ** (1 / count) - 1, s: 'percent' }]);
  }
  const avgRow = ixLast + 2;
  ix.row([{ v: 'Net PEA 10 ans (par an)', s: 'bold' }, ...INDEX_RETURNS.map((i, k) => {
    const c = colName(1 + k);
    const rate = cagrValue(i, 10);
    return { f: `(1+((1+${c}${avgRow})^10-1)*(1-${(PEA.taxAfter / 100).toFixed(3)}))^(1/10)-1`, v: (1 + ((1 + rate) ** 10 - 1) * (1 - PEA.taxAfter / 100)) ** 0.1 - 1, s: 'percent' };
  })]);
  ix.row([]);
  ix.row([{ v: 'Performances annuelles en euros, dividendes réinvestis, hors frais d\'ETF. Moyenne = taux annuel composé : (Π (1 + performance))^(1/n) − 1. Net PEA : prélèvements sociaux payés sur les gains au retrait, après 10 ans. Les performances passées ne préjugent pas des performances futures.', s: 'note' }]);
  ix.merge(`A${ixLast + 6}:${ixInfl}${ixLast + 6}`);
  ix.chart({
    type: 'col', title: 'Performances annuelles en euros, dividendes réinvestis', from: `A${ixLast + 8}`, to: `${ixInfl}${ixLast + 28}`, percent: true,
    categories: `A2:A${ixLast}`,
    series: INDEX_RETURNS.slice(0, 2).map((i, k) => ({ name: i.name, ref: `${colName(1 + k)}2:${colName(1 + k)}${ixLast}`, color: k ? ROSE : VIOLET })),
  });

  // ——— PEA : fiscalité ————————————————————————————————————————————
  const fis = wb.addSheet('PEA fiscalité', { widths: [16, 14, 14, 18, 22, 16, 20], freeze: 4 });
  const worldRate = cagrValue(INDEX_RETURNS[0], 10);
  fis.row([{ v: 'Imposition moyenne d\'un PEA selon la durée', s: 'title' }]);
  fis.row(['Rendement retenu (par an)', { f: `'PEA indices'!B${avgRow}`, v: worldRate, s: 'percent' }, 'MSCI World, moyenne 10 ans (modifiable)']);
  fis.blank();
  fis.row(['Retrait après (ans)', 'Taux sur les gains', 'Valeur de 100', 'Part des gains', 'Part du retrait prélevée', 'Net PEA / an', 'Net compte-titres / an'], 'header');
  for (const y of [3, 5, 8, 10, 15, 20]) {
    const n = fis.rows.length + 1;
    const tax = y < PEA.years ? PEA.taxBefore : PEA.taxAfter;
    const growth = (1 + worldRate) ** y;
    fis.row([{ v: y, s: 'number' }, { v: frac(tax), s: 'percent' },
      { f: `100*(1+$B$2)^A${n}`, v: 100 * growth, s: 'number' },
      { f: `(C${n}-100)/C${n}`, v: (growth - 1) / growth, s: 'percent' },
      { f: `D${n}*B${n}`, v: (growth - 1) / growth * frac(tax), s: 'percentBold' },
      { f: `((100+(C${n}-100)*(1-B${n}))/100)^(1/A${n})-1`, v: (1 + (growth - 1) * (1 - frac(tax))) ** (1 / y) - 1, s: 'percentBold' },
      { f: `((100+(C${n}-100)*(1-${TAX.pfu / 100}))/100)^(1/A${n})-1`, v: (1 + (growth - 1) * (1 - TAX.pfu / 100)) ** (1 / y) - 1, s: 'percent' }]);
  }
  fis.row([]);
  fis.row([{ v: `Seuls les gains sont imposés, au retrait. Avant ${PEA.years} ans : ${TAX.pfu.toLocaleString('fr-FR')} % (${TAX.incomeTax.toLocaleString('fr-FR')} % d'impôt + ${TAX.social.toLocaleString('fr-FR')} % de prélèvements sociaux) et clôture du plan. Après ${PEA.years} ans : ${TAX.social.toLocaleString('fr-FR')} % de prélèvements sociaux. Plafond des versements : ${(PEA.cap / 100).toLocaleString('fr-FR')} €. Compte-titres simplifié : imposé au retrait.`, s: 'note' }]);
  fis.merge(`A${fis.rows.length}:G${fis.rows.length}`);

  // ——— Taux ——————————————————————————————————————————————————————
  const tx = wb.addSheet('Taux', { widths: [16, 12, 12, 22], freeze: 1 });
  tx.row(['Date d\'effet', 'Livret A', 'LEP', 'Origine'], 'header');
  for (const row of ctx.rates) {
    tx.row([{ v: excelDate(row.from), s: 'date' },
      row.livretA == null ? '' : { v: frac(row.livretA), s: 'percent' },
      row.lep == null ? '' : { v: frac(row.lep), s: 'percent' },
      row.from > ctx.today ? 'hypothèse' : row.source === 'saisi' ? 'saisi dans l\'app' : row.source === 'auto' ? 'officiel, récupéré automatiquement' : 'officiel']);
  }
  tx.row([]);
  tx.row([{ v: `Plafonds : Livret A ${(PRODUCTS.livretA.cap / 100).toLocaleString('fr-FR')} €, LEP ${(PRODUCTS.lep.cap / 100).toLocaleString('fr-FR')} € (hors intérêts capitalisés).`, s: 'note' }]);
  tx.row([{ v: `Inflation moyenne annuelle (IPC) : ${Object.entries(ctx.ref.annual).map(([y, v]) => `${y} ${v.toLocaleString('fr-FR')} %`).join(' · ')}.`, s: 'note' }]);

  // ——— Sources et méthode ———————————————————————————————————————————
  const src = wb.addSheet('Sources et méthode', { widths: [36, 100] });
  src.row([{ v: 'Méthode', s: 'title' }]);
  for (const [k, v] of [
    ['Intérêts des livrets', 'Calcul par quinzaine (1er–15 et 16–fin de mois) : un versement rapporte à partir de la quinzaine suivante, un retrait cesse de rapporter dès sa quinzaine. Intérêts = solde en valeur × taux ÷ 24, versés au 31 décembre.'],
    ['Rendement réel', '(1 + taux) ÷ (1 + inflation) − 1 (relation de Fisher).'],
    ['Gain réel sur 12 mois', 'Solde × taux − solde × inflation, au solde actuel.'],
    ['Brut équivalent', `Taux net ÷ (1 − ${TAX.pfu.toLocaleString('fr-FR')} %) : ce qu'un placement imposé au prélèvement forfaitaire devrait rapporter pour faire aussi bien.`],
    ['Temps de doublement', 'ln 2 ÷ ln(1 + taux) ; règle de 72 : 72 ÷ taux en %.'],
    ['Matelas de sécurité', 'Solde des livrets ÷ dépenses mensuelles moyennes des titulaires (3 derniers mois complets importés, hors épargne et virements).'],
    ['Rendement moyen des indices', 'Taux annuel composé : (Π (1 + performance annuelle))^(1/n) − 1, en euros, dividendes réinvestis.'],
    ['Imposition moyenne d\'un PEA', 'Taux sur les gains × part des gains dans la somme retirée ; rendement net = ((1 + gains × (1 − taux)))^(1/n) − 1.'],
    ['Solde de départ', 'Reconstitué à partir du solde saisi et des virements des relevés importés (calcul linéaire en le solde de départ).'],
  ]) src.row([{ v: k, s: 'bold' }, { v, s: 'note' }]);
  src.blank();
  src.row([{ v: 'Sources', s: 'title' }]);
  const fetched = ctx.official?.fetchedAt ? `récupérées automatiquement le ${longDate(ctx.official.fetchedAt.slice(0, 10))}` : 'valeurs livrées avec l\'app';
  src.row([{ v: 'Données publiques', s: 'bold' }, { v: `${fetched} ; aucune donnée personnelle n'est envoyée pour les obtenir.`, s: 'note' }]);
  for (const [k, v] of [
    [`Inflation IPC, IPCH, sous-jacente, moyenne annuelle (INSEE, séries ${Object.values(INSEE_SERIES).join(', ')})`, SOURCES.insee.url],
    ['€STR (BCE)', SOURCES.bce.url],
    ['Taux du Livret A et du LEP', ctx.official?.livrets?.source === 'cdc' ? SOURCES.cdc.url : SOURCES.servicePublic.url],
    ['Fonds euros 2025 (ACPR)', 'https://www.boursorama.com/epargne/assurance-vie/actualites/assurance-vie-en-2025-les-fonds-en-euros-ont-rapporte-2-65-en-moyenne-2520758cb9fc4554af651b0d697fa8a6'],
    ['Prélèvement forfaitaire 2026', 'https://www.hagnere-patrimoine.fr/guides-patrimoine/comment-payer-moins-impots/prelevement-liberatoire-interets-2026'],
    ['MSCI World (EUR), performances nettes', 'https://www.msci.com/documents/10199/890dd84d-3750-4656-87f2-1229ed5a5d6e'],
    ['MSCI ACWI (EUR), performances nettes', 'https://www.msci.com/documents/10199/1ee87397-6313-4f46-87ae-6761f666558e'],
    ['CAC 40 dividendes réinvestis', 'https://www.zonebourse.com/cours/indice/CAC-40-DIVIDENDES-REINVES-3869660/cotations/'],
    ['S&P 500 en euros, dividendes réinvestis', 'https://www.eupersonalfinance.eu/articles/average-annual-return-sp500'],
    ['Fiscalité du PEA en 2026 (CSG à 10,6 %)', 'https://placement.meilleurtaux.com/bourse/actualites/2025-decembre/csg-10-6-impact-pea-avant-apres-5-ans.html'],
  ]) src.row([{ v: k, s: 'bold' }, { v, s: 'link' }]);

  return wb;
}
