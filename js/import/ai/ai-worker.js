/**
 * Worker de catégorisation par IA locale (Transformers.js + ONNX Runtime).
 * Tourne hors du fil principal pour ne jamais figer l'interface.
 * Le modèle est lu depuis /models : aucune requête ne sort de l'appareil.
 */
import { AutoTokenizer, Qwen3_5ForCausalLM, env } from '../../../lib/transformers/transformers.min.js';
import {
  AI_MODELS, CHOICE_LETTERS, NEUTRAL_LABEL, buildChoiceMessages, calibrate, choiceProbabilities, guideFor,
} from './ai-shared.js';

env.allowRemoteModels = false; // jamais de téléchargement depuis Internet
env.allowLocalModels = true;
env.localModelPath = new URL('../../../models/', import.meta.url).href;
env.useBrowserCache = false; // le service worker met déjà les fichiers en cache
env.backends.onnx.wasm.wasmPaths = new URL('../../../lib/transformers/', import.meta.url).href;

let loading = null;
const priors = new Map(); // biais du modèle par jeu de catégories et par sens
const cancelled = new Set();
let queue = Promise.resolve(); // une seule analyse à la fois sur le modèle

async function hasWebGPU() {
  try {
    return Boolean(await navigator.gpu?.requestAdapter());
  } catch {
    return false;
  }
}

async function load() {
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files.set(p.file, p);
    const all = [...files.values()];
    const loaded = all.reduce((s, f) => s + f.loaded, 0);
    const total = all.reduce((s, f) => s + f.total, 0);
    self.postMessage({ type: 'progress', loaded, total });
  };

  // Carte graphique du Mac (WebGPU) si disponible, sinon WebAssembly sur le processeur
  const gpu = await hasWebGPU();
  let lastError;
  for (const { id, device, dtype } of AI_MODELS.filter((m) => gpu || m.device !== 'webgpu')) {
    try {
      files.clear();
      // Classe « CausalLM » : texte seul, l'encodeur d'images n'est pas chargé
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(id),
        Qwen3_5ForCausalLM.from_pretrained(id, {
          device, dtype: { embed_tokens: dtype, decoder_model_merged: dtype }, progress_callback,
        }),
      ]);
      return { tokenizer, model, device, id };
    } catch (err) {
      console.warn(`[ia] ${id} (${device}) indisponible :`, err);
      lastError = err;
    }
  }
  throw lastError;
}

/** Jetons de chaque lettre de réponse (« A » et « ␣A » selon le contexte). */
function letterTokens(tokenizer, count) {
  return [...CHOICE_LETTERS.slice(0, count)].map((L) => [...new Set(
    [L, ` ${L}`].map((s) => tokenizer.encode(s, { add_special_tokens: false })[0]),
  )]);
}

/** Probabilité de chaque catégorie : un seul passage du modèle, sans génération. */
async function score({ tokenizer, model }, item, guide, letters) {
  const inputs = tokenizer.apply_chat_template(buildChoiceMessages(item, guide), {
    add_generation_prompt: true, return_dict: true, enable_thinking: false,
  });
  let probs;
  await model.generate({
    ...inputs,
    max_new_tokens: 1,
    do_sample: false,
    logits_processor: [(_, logits) => {
      probs = choiceProbabilities(logits.data, letters);
      return logits;
    }],
  });
  return probs;
}

async function classify({ job, items, categories }) {
  loading ??= load().catch((err) => { loading = null; throw err; });
  const ai = await loading;
  if (cancelled.has(job)) return;
  self.postMessage({ type: 'ready', job, device: ai.device, model: ai.id });

  const guide = guideFor(categories);
  const ids = guide.map((g) => g.id);
  const letters = letterTokens(ai.tokenizer, guide.length);
  const priorOf = async (type) => {
    const key = `${ai.id}|${ids.join(',')}|${type}`;
    if (!priors.has(key)) priors.set(key, await score(ai, { label: NEUTRAL_LABEL, type }, guide, letters));
    return priors.get(key);
  };

  for (const [i, item] of items.entries()) {
    if (cancelled.has(job)) return;
    const probs = calibrate(await score(ai, item, guide, letters), await priorOf(item.type));
    const best = probs.indexOf(Math.max(...probs));
    self.postMessage({
      type: 'result', job, uid: item.uid, categoryId: ids[best], confidence: probs[best], done: i + 1, total: items.length,
    });
  }
}

self.addEventListener('message', ({ data }) => {
  if (data.type === 'cancel') {
    data.jobs.forEach((j) => cancelled.add(j));
    return;
  }
  if (data.type !== 'classify') return;
  queue = queue.then(async () => {
    try {
      await classify(data);
      self.postMessage({ type: 'done', job: data.job });
    } catch (err) {
      self.postMessage({ type: 'error', job: data.job, message: String(err?.message ?? err) });
    } finally {
      cancelled.delete(data.job);
    }
  });
});
