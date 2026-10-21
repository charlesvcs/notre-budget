/**
 * Lecture d'un PDF dans le navigateur avec pdf.js (copie locale dans /lib).
 * Le fichier n'est jamais envoyé : il est lu en mémoire puis libéré.
 */
import * as pdfjsLib from '../../lib/pdfjs/pdf.min.js';
import { extractLines } from './pdf-layout.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL('../../lib/pdfjs/pdf.worker.min.js', import.meta.url).href;

/**
 * @param {File} file
 * @param {{ onPassword?: (incorrect: boolean) => string|null }} options
 *   onPassword : appelé si le PDF est protégé ; renvoyer null pour abandonner.
 * @returns {Promise<Array>} lignes (voir pdf-layout.js)
 */
export async function readPdfLines(file, { onPassword } = {}) {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjsLib.getDocument({
    data,
    isEvalSupported: false, // compatible avec notre Content-Security-Policy
    disableFontFace: true,  // on ne fait qu'extraire le texte, pas de rendu
  });

  if (onPassword) {
    task.onPassword = (update, reason) => {
      const password = onPassword(reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD);
      if (password == null) task.destroy();
      else update(password);
    };
  }

  const doc = await task.promise;
  try {
    return await extractLines(doc);
  } finally {
    await doc.destroy();
  }
}
