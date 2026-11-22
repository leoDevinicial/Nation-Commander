/** O worker tem IndexedDB (aba privada de alguns navegadores não tem): sem ele, a partida local só não é gravada. */
export function idbAvailable(): boolean {
  return typeof (globalThis as unknown as { indexedDB?: unknown }).indexedDB !== 'undefined';
}
