/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
