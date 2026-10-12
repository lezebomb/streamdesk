import { defineConfig } from 'vite';
export default defineConfig({ build: {outDir:'dist'}, server:{middlewareMode:true}, appType:'spa' });
