/**
 * Reconstruit les lignes visuelles d'un PDF à partir des fragments de texte
 * de pdf.js. Chaque ligne garde la position horizontale de chaque caractère :
 * c'est ce qui permet ensuite de savoir si un montant est dans la colonne
 * « Débit » ou « Crédit ».
 *
 * Line { page, y, size, text, xs: number[], xe: number[] }
 *   xs[i] / xe[i] = abscisses de début / fin du caractère text[i]
 */

/** Extrait toutes les lignes d'un document pdf.js déjà ouvert. */
export async function extractLines(doc) {
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    lines.push(...groupIntoLines(items, p));
    page.cleanup();
  }
  return lines;
}

export function groupIntoLines(items, pageNumber) {
  const glyphs = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    const [a, b, c, d, x, y] = it.transform;
    // Texte vertical ou incliné (mentions légales en marge) : ignoré
    if (Math.abs(b) > Math.abs(a) * 0.2) continue;
    const size = Math.hypot(c, d) || it.height || 10;
    glyphs.push({ str: it.str.replace(/[  ]/g, ' '), x, y, w: it.width, size });
  }

  // De haut en bas (y décroissant en PDF), puis de gauche à droite
  glyphs.sort((g1, g2) => g2.y - g1.y || g1.x - g2.x);

  const rows = [];
  for (const g of glyphs) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - g.y) <= Math.max(2, Math.min(row.size, g.size) * 0.45)) {
      row.items.push(g);
    } else {
      rows.push({ y: g.y, size: g.size, items: [g] });
    }
  }

  return rows.map((row) => buildLine(row, pageNumber));
}

function buildLine(row, page) {
  row.items.sort((a, b) => a.x - b.x);
  let text = '';
  const xs = [];
  const xe = [];
  let prev = null;

  for (const it of row.items) {
    // Faux gras : certains PDF dessinent deux fois le même texte, légèrement décalé
    if (prev && prev.str === it.str && Math.abs(prev.x - it.x) < it.size * 0.3) continue;

    if (prev) {
      const prevEnd = prev.x + prev.w;
      const gap = it.x - prevEnd;
      if (gap > it.size * 0.2 && !text.endsWith(' ') && !it.str.startsWith(' ')) {
        text += ' ';
        xs.push(prevEnd);
        xe.push(it.x);
      }
    }

    const cw = it.str.length ? it.w / it.str.length : 0;
    for (let i = 0; i < it.str.length; i++) {
      text += it.str[i];
      xs.push(it.x + i * cw);
      xe.push(it.x + (i + 1) * cw);
    }
    prev = it;
  }

  return { page, y: row.y, size: row.size, text, xs, xe };
}
