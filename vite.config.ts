import { defineConfig } from 'vite';
export default defineConfig({ optimizeDeps:{entries:['index.html']}, build: {outDir:'dist'}, server:{middlewareMode:true}, appType:'spa' });
