import { defineConfig } from 'vite';
export default defineConfig({base:'./',optimizeDeps:{entries:['index.html']},build:{outDir:'dist'},server:{middlewareMode:true},appType:'spa'});
