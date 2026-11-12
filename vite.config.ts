import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: './', test: { globals: true, exclude: ['e2e/**', 'node_modules/**', 'dist/**'] } } as any);
