/**
 * Persistencia de simulaciones en localStorage (PWA / múltiples registros JSON).
 */

const STORAGE_KEY = 'loan-calculator-simulations-v1';
export const SIMULATION_NAME_MAX = 30;

/**
 * @returns {string}
 */
function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `sim-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @param {string} raw
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
export function validateSimulationName(raw) {
  if (raw === undefined || raw === null) {
    return { ok: false, error: 'El nombre es obligatorio.' };
  }
  const name = String(raw).trim();
  if (!name.length) {
    return { ok: false, error: 'El nombre es obligatorio.' };
  }
  if (name.length > SIMULATION_NAME_MAX) {
    return { ok: false, error: `El nombre no puede superar ${SIMULATION_NAME_MAX} caracteres.` };
  }
  return { ok: true, name };
}

/**
 * @typedef {{ id: string, name: string, createdAt: string, loan: object, extras: Array<{ month: number, amount: number, strategy: string }> }} SavedSimulation
 */

/**
 * @returns {SavedSimulation[]}
 */
export function loadSimulations() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSimulationRecord);
  } catch {
    return [];
  }
}

/**
 * @param {*} x
 * @returns {x is SavedSimulation}
 */
function isValidSimulationRecord(x) {
  if (!x || typeof x !== 'object') return false;
  if (typeof x.id !== 'string' || !x.id.trim()) return false;
  if (typeof x.name !== 'string') return false;
  if (typeof x.createdAt !== 'string') return false;
  if (!x.loan || typeof x.loan !== 'object') return false;
  if (!Array.isArray(x.extras)) return false;
  return true;
}

/**
 * @param {SavedSimulation[]} list
 */
function persist(list) {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * @param {SavedSimulation} sim
 */
export function addSimulation(sim) {
  const list = loadSimulations();
  const ids = new Set(list.map((s) => s.id));
  if (ids.has(sim.id)) {
    sim = { ...sim, id: newId() };
  }
  list.push(sim);
  persist(list);
  return sim;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function removeSimulation(id) {
  const list = loadSimulations();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  persist(next);
  return true;
}

/**
 * @param {string} id
 * @returns {SavedSimulation | null}
 */
export function getSimulationById(id) {
  return loadSimulations().find((s) => s.id === id) ?? null;
}

/**
 * Restaura una simulación eliminada (p. ej. deshacer), respetando el mismo id.
 * @param {SavedSimulation} sim
 * @returns {boolean}
 */
export function restoreSimulation(sim) {
  if (!sim || typeof sim.id !== 'string' || !sim.id.trim()) return false;
  const list = loadSimulations();
  if (list.some((s) => s.id === sim.id)) return false;
  list.unshift({
    ...sim,
    loan: { ...sim.loan },
    extras: sim.extras.map((e) => ({ ...e }))
  });
  persist(list);
  return true;
}

export { newId };
