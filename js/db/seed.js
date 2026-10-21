import { PROFILES } from './schema.js';

// Catégories insérées au premier lancement. Les `id` sont des slugs stables :
// ne pas les renommer, les transactions y font référence.
export const DEFAULT_CATEGORIES = [
  // — Base —
  { id: 'courses',      name: 'Courses',                 kind: 'sortie',  icon: '🧺', color: '#E9A23B', group: 'base' },
  { id: 'sorties',      name: 'Sorties',                 kind: 'sortie',  icon: '🍷', color: '#D9667B', group: 'base' },
  { id: 'abonnements',  name: 'Abonnements',             kind: 'sortie',  icon: '📺', color: '#8E7CC3', group: 'base' },
  { id: 'frais',        name: 'Frais & assurances',      kind: 'sortie',  icon: '🛡️', color: '#6C8EAD', group: 'base' },
  // — Étendues —
  { id: 'logement',     name: 'Logement',                kind: 'sortie',  icon: '🏡', color: '#C97B5A', group: 'etendue' },
  { id: 'transports',   name: 'Transports',              kind: 'sortie',  icon: '🚲', color: '#5AA9A0', group: 'etendue' },
  { id: 'sante',        name: 'Santé',                   kind: 'sortie',  icon: '🌿', color: '#7FB77E', group: 'etendue' },
  { id: 'revenus',      name: 'Revenus',                 kind: 'entree',  icon: '☀️', color: '#F2C14E', group: 'etendue' },
  { id: 'epargne',      name: 'Épargne & investissement', kind: 'epargne', icon: '🌱', color: '#4F9D69', group: 'etendue' },
  // Filet de sécurité pour les imports non catégorisés
  { id: 'autre',        name: 'Autre',                   kind: 'sortie',  icon: '✨', color: '#A0A0A0', group: 'base' },
  // — Ajoutées en octobre 2026 (insérées aussi dans les bases existantes) —
  { id: 'cadeaux',      name: 'Cadeaux',                 kind: 'sortie',  icon: '🎁', color: '#E07A9B', group: 'perso' },
  { id: 'vetements',    name: 'Vêtements',               kind: 'sortie',  icon: '👕', color: '#7A8FD9', group: 'perso' },
  { id: 'coiffeur',     name: 'Coiffeur',                kind: 'sortie',  icon: '💇', color: '#B07CC6', group: 'perso' },
  { id: 'cafe',         name: 'Café',                    kind: 'sortie',  icon: '☕', color: '#9C6B4E', group: 'perso' },
  { id: 'travail',      name: 'Travail',                 kind: 'sortie',  icon: '💼', color: '#4E8AC9', group: 'perso' },
  { id: 'parking',      name: 'Parking',                 kind: 'sortie',  icon: '🅿️', color: '#3F9C8F', group: 'perso' },
  // Virements vers le compte commun : les courses communes (soirs, week-ends)
  { id: 'commun',       name: 'Courses communes',        kind: 'sortie',  icon: '🛒', color: '#D98E4E', group: 'perso' },
].map((c, i) => ({ ...c, order: i, archived: false }));

export const DEFAULT_SETTINGS = [
  {
    key: 'profileNames',
    value: { [PROFILES.ME]: 'Moi', [PROFILES.PARTNER]: 'Ma compagne', [PROFILES.SHARED]: 'Commun' },
  },
  { key: 'currency', value: 'EUR' },
  { key: 'locale', value: 'fr-FR' },
  { key: 'seededAt', value: null }, // renseigné à l'initialisation
];
