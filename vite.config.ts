/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/**
 * Partida contra a IA no navegador (22/11, `server/local/`): o código do servidor roda num Web Worker. Os módulos do
 * Node que ele importa viram substitutos de navegador (`server/local/shims/`). Fora dos testes: no vitest, o código do
 * servidor continua usando o Node de verdade.
 */
const shim = (f: string) => fileURLToPath(new URL(`./server/local/shims/${f}`, import.meta.url));
const NODE_SHIMS: Record<string, string> = {
  'node:crypto': shim('crypto.ts'),
  'node:zlib': shim('unavailable.ts'),
  'node:fs/promises': shim('unavailable.ts'),
  'node:path': shim('unavailable.ts'),
};
const nodeShims = {
  name: 'nc-node-shims',
  enforce: 'pre' as const,
  resolveId(id: string) {
    if (process.env.VITEST) return null;
    return NODE_SHIMS[id] ?? null;
  },
};

export default defineConfig({
  plugins: [nodeShims, react(), tailwindcss()],
  worker: { format: 'es', plugins: () => [nodeShims] },
  build: {
    // o chunk da partida carrega o Three.js inteiro (~750 kB); é carregado sob demanda
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'src/**/*.test.ts'],
    // testes de regra antigos rodam sem a rede elétrica; os de energia a ligam explicitamente
    setupFiles: ['shared/test/setup.ts'],
    environment: 'node',
  },
});
