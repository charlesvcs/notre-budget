/**
 * Écriture d'un classeur Excel (.xlsx) dans le navigateur, sans dépendance.
 *
 * Un .xlsx est une archive ZIP de fichiers XML (format Office Open XML).
 * Ce module sait écrire :
 *  - des feuilles (texte, nombres, dates, formules avec leur valeur calculée),
 *  - quelques styles (en-tête, euros, pourcentages, dates, titre, note),
 *  - des graphiques Excel natifs (colonnes, barres, courbes) posés sur la feuille.
 *
 * Usage :
 *   const wb = new Workbook();
 *   const sheet = wb.addSheet('Livrets', { widths: [24, 14] });
 *   sheet.row(['Livret', 'Solde'], 'header');
 *   sheet.row(['Livret A', { v: 8421.5, s: 'euro' }]);
 *   sheet.chart({ type: 'col', title: '…', from: 'D2', to: 'L18', categories: 'A2:A3',
 *                 series: [{ name: 'Solde', ref: 'B2:B3', color: '6C47FF' }] });
 *   const blob = wb.toBlob();
 */

// ——— Styles ——————————————————————————————————————————————————————

// Ordre = index cellXfs dans styles.xml
const STYLE_IDS = {
  default: 0, header: 1, euro: 2, euroBold: 3, percent: 4, date: 5, title: 6, note: 7, bold: 8,
  number: 9, percentBold: 10, link: 11, months: 12, euroTotal: 13, boldTotal: 14,
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5">
<numFmt numFmtId="164" formatCode="#,##0.00&quot; €&quot;;&quot;−&quot;#,##0.00&quot; €&quot;"/>
<numFmt numFmtId="165" formatCode="0.00&quot; &quot;%;&quot;−&quot;0.00&quot; &quot;%"/>
<numFmt numFmtId="166" formatCode="dd/mm/yyyy"/>
<numFmt numFmtId="167" formatCode="0.0"/>
<numFmt numFmtId="168" formatCode="0.0&quot; mois&quot;"/>
</numFmts>
<fonts count="6">
<font><sz val="11"/><color rgb="FF1B1530"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF1B1530"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF6C47FF"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF645C7D"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><u/><sz val="11"/><color rgb="FF6C47FF"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF6C47FF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE6E0FA"/></bottom><diagonal/></border>
<border><left/><right/><top style="double"><color rgb="FF6C47FF"/></top><bottom style="thin"><color rgb="FFE6E0FA"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="168" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// ——— Utilitaires ———————————————————————————————————————————————————

const esc = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caractères de contrôle interdits en XML 1.0
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** 0 → A, 25 → Z, 26 → AA */
export function colName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  const col = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return { col, row: Number(m[2]) - 1 };
}

/** Date ISO « YYYY-MM-DD » → numéro de série Excel (système 1900). */
export function excelDate(iso) {
  const t = Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return t / 86400000 + 25569;
}

const quoteSheet = (name) => `'${name.replace(/'/g, "''")}'`;
const absRange = (range) => range.split(':').map((r) => {
  const { col, row } = parseRef(r);
  return `$${colName(col)}$${row + 1}`;
}).join(':');

// ——— Feuille ———————————————————————————————————————————————————————

class Sheet {
  constructor(name, { widths = [], freeze = 0 } = {}) {
    this.name = name.slice(0, 31);
    this.widths = widths;
    this.freeze = freeze;
    this.rows = [];
    this.charts = [];
    this.merges = [];
  }

  /** Ajoute une ligne ; chaque cellule : valeur brute ou { v, s, f } (s = style, f = formule). */
  row(cells = [], style = null) {
    this.rows.push(cells.map((c) => (c != null && typeof c === 'object' && !(c instanceof Date) ? c : { v: c, s: style })));
    return this.rows.length; // numéro de ligne Excel
  }

  blank() { return this.row([]); }

  /** Fusionne une plage (ex. « A1:F1 ») pour les titres et notes. */
  merge(range) { this.merges.push(range); }

  /**
   * Graphique natif.
   * @param {object} o { type: 'col'|'bar'|'line', title, from, to, categories, series: [{ name, ref, color, values }], percent }
   *   categories et ref sont des plages de cette feuille ; values (cache) = nombres déjà calculés.
   */
  chart(o) { this.charts.push(o); }

  cellValue(ref) {
    const { col, row } = parseRef(ref);
    const cell = this.rows[row]?.[col];
    return cell?.v ?? null;
  }

  rangeValues(range) {
    const [a, b] = range.split(':').map(parseRef);
    const out = [];
    for (let r = a.row; r <= b.row; r++) {
      for (let c = a.col; c <= b.col; c++) out.push(this.rows[r]?.[c]?.v ?? null);
    }
    return out;
  }

  toXml(drawingRid) {
    const lastCol = Math.max(1, ...this.rows.map((r) => r.length));
    const dim = `A1:${colName(lastCol - 1)}${Math.max(1, this.rows.length)}`;
    const pane = this.freeze
      ? `<pane ySplit="${this.freeze}" topLeftCell="A${this.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${this.freeze + 1}" sqref="A${this.freeze + 1}"/>`
      : '';
    const cols = this.widths.length
      ? `<cols>${this.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const rows = this.rows.map((cells, r) => {
      const xml = cells.map((cell, c) => cellXml(cell, `${colName(c)}${r + 1}`)).join('');
      return `<row r="${r + 1}">${xml}</row>`;
    }).join('');
    const merges = this.merges.length
      ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="${dim}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols}<sheetData>${rows}</sheetData>${merges}
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
${drawingRid ? `<drawing r:id="${drawingRid}"/>` : ''}
</worksheet>`;
  }
}

function cellXml(cell, ref) {
  if (cell == null || (cell.v == null && cell.f == null)) return '';
  const s = STYLE_IDS[cell.s ?? 'default'] ?? 0;
  const style = s ? ` s="${s}"` : '';
  if (cell.f != null) {
    const cached = typeof cell.v === 'number' && Number.isFinite(cell.v) ? `<v>${cell.v}</v>` : '';
    return `<c r="${ref}"${style}><f>${esc(cell.f)}</f>${cached}</c>`;
  }
  if (typeof cell.v === 'number') {
    return Number.isFinite(cell.v) ? `<c r="${ref}"${style}><v>${cell.v}</v></c>` : '';
  }
  if (typeof cell.v === 'boolean') return `<c r="${ref}" t="b"${style}><v>${cell.v ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
}

// ——— Graphiques (DrawingML) ———————————————————————————————————————

const C_NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const txPr = (size = 900, color = '645C7D') => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;

function strCache(values) {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v ?? '')}</c:v></c:pt>`).join('')}</c:strCache>`;
}

function numCache(values, format) {
  return `<c:numCache><c:formatCode>${esc(format)}</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((v, i) => (typeof v === 'number' && Number.isFinite(v) ? `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>` : '')).join('')}</c:numCache>`;
}

function chartXml(sheet, o) {
  const sheetRef = quoteSheet(sheet.name);
  const categories = sheet.rangeValues(o.categories).map((v) => (v == null ? '' : String(v)));
  const format = o.percent ? '0.0 %' : '#,##0';
  const series = o.series.map((s, i) => {
    const values = s.values ?? sheet.rangeValues(s.ref);
    const fill = o.type === 'line'
      ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill>${s.dash ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>`
      : `<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>${fill}`
      + `<c:cat><c:strRef><c:f>${sheetRef}!${absRange(o.categories)}</c:f>${strCache(categories)}</c:strRef></c:cat>`
      + `<c:val><c:numRef><c:f>${sheetRef}!${absRange(s.ref)}</c:f>${numCache(values, format)}</c:numRef></c:val>`
      + (o.type === 'line' ? '<c:smooth val="0"/>' : '')
      + '</c:ser>';
  }).join('');

  const plot = o.type === 'line'
    ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>`
    : `<c:barChart><c:barDir val="${o.type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="60"/><c:overlap val="-10"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>`;

  const grid = '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="ECE6FF"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
  const axisLine = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="C6B8FF"/></a:solidFill></a:ln></c:spPr>';
  const catPos = o.type === 'bar' ? 'l' : 'b';
  const valPos = o.type === 'bar' ? 'b' : 'l';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace ${C_NS}>
<c:roundedCorners val="0"/>
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"><a:solidFill><a:srgbClr val="1B1530"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="fr-FR" sz="1200" b="1"><a:solidFill><a:srgbClr val="1B1530"/></a:solidFill></a:rPr><a:t>${esc(o.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>${plot}
<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="${o.type === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${axisLine}${txPr()}<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/>${o.min != null ? `<c:min val="${o.min}"/>` : ''}</c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/>${grid}${o.axisTitle ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:r><a:rPr lang="fr-FR" sz="900"/><a:t>${esc(o.axisTitle)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : ''}<c:numFmt formatCode="${o.percent ? '0.0 %' : '#,##0'}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr()}<c:crossAx val="5001"/><c:crosses val="${o.type === 'bar' ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>
<c:spPr><a:noFill/></c:spPr>
</c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(900, '1B1530')}</c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E6E0FA"/></a:solidFill></a:ln></c:spPr>
<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>
</c:chartSpace>`;
}

function drawingXml(charts, firstChartRid) {
  const anchors = charts.map((o, i) => {
    const from = parseRef(o.from);
    const to = parseRef(o.to);
    return `<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${esc(o.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${firstChartRid + i}"/></a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;
}

// ——— Classeur ——————————————————————————————————————————————————————

export class Workbook {
  constructor({ title = '', author = '' } = {}) {
    this.sheets = [];
    this.title = title;
    this.author = author;
  }

  addSheet(name, options) {
    const sheet = new Sheet(name, options);
    this.sheets.push(sheet);
    return sheet;
  }

  /** Tous les fichiers de l'archive : [[chemin, contenu texte]] */
  files() {
    const files = [];
    const overrides = [];
    let chartNo = 0;
    let drawingNo = 0;

    this.sheets.forEach((sheet, i) => {
      const n = i + 1;
      let drawingRid = null;
      if (sheet.charts.length) {
        drawingNo += 1;
        drawingRid = 'rId1';
        files.push([`xl/worksheets/_rels/sheet${n}.xml.rels`, rels([[drawingRid, 'drawing', `../drawings/drawing${drawingNo}.xml`]])]);
        const chartRels = sheet.charts.map((o, k) => {
          chartNo += 1;
          files.push([`xl/charts/chart${chartNo}.xml`, chartXml(sheet, o)]);
          overrides.push([`/xl/charts/chart${chartNo}.xml`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml']);
          return [`rId${k + 1}`, 'chart', `../charts/chart${chartNo}.xml`];
        });
        files.push([`xl/drawings/drawing${drawingNo}.xml`, drawingXml(sheet.charts, 1)]);
        files.push([`xl/drawings/_rels/drawing${drawingNo}.xml.rels`, rels(chartRels)]);
        overrides.push([`/xl/drawings/drawing${drawingNo}.xml`, 'application/vnd.openxmlformats-officedocument.drawing+xml']);
      }
      files.push([`xl/worksheets/sheet${n}.xml`, sheet.toXml(drawingRid)]);
      overrides.push([`/xl/worksheets/sheet${n}.xml`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml']);
    });

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${this.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`]);
    files.push(['xl/_rels/workbook.xml.rels', rels([
      ...this.sheets.map((s, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]),
      [`rId${this.sheets.length + 1}`, 'styles', 'styles.xml'],
    ])]);
    files.push(['xl/styles.xml', STYLES_XML]);
    files.push(['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(this.title)}</dc:title><dc:creator>${esc(this.author)}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`]);
    files.push(['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`]);
    files.unshift(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${overrides.map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`).join('\n')}
</Types>`]);
    return files;
  }

  /** Archive .xlsx (Uint8Array) */
  toBytes() {
    return zip(this.files());
  }

  toBlob() {
    return new Blob([this.toBytes()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
}

const REL_TYPES = {
  worksheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  drawing: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
  chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
};

const rels = (list) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
  .map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL_TYPES[type]}" Target="${target}"/>`).join('')}</Relationships>`;

// ——— ZIP (méthode « stockée », sans compression) ————————————————————

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** @param {Array<[string, string]>} entries */
export function zip(entries) {
  const encoder = new TextEncoder();
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [path, content] of entries) {
    const name = encoder.encode(path);
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034B50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true); // stockée
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014B50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = centrals.reduce((s, part) => s + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
