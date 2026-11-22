/**
 * Substituto de `node:zlib`, `node:fs/promises` e `node:path` na partida contra a IA no navegador (22/11). O código
 * do servidor importa esses módulos no topo dos arquivos (salvamento em disco, compressão), mas o servidor local nunca
 * chama essas funções: o salvamento vai para o IndexedDB e nada é comprimido. Chamar uma delas é um erro de programação.
 */
const nope = (name: string) => () => {
  throw new Error(`${name} não está disponível na partida local`);
};

export const deflateRawSync = nope('deflateRawSync');
export const gzipSync = nope('gzipSync');
export const gunzipSync = nope('gunzipSync');
export const mkdir = nope('mkdir');
export const readdir = nope('readdir');
export const readFile = nope('readFile');
export const rename = nope('rename');
export const rm = nope('rm');
export const writeFile = nope('writeFile');
export const join = (...parts: string[]) => parts.join('/');

export default { deflateRawSync, gzipSync, gunzipSync, mkdir, readdir, readFile, rename, rm, writeFile, join };
