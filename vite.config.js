import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import celebrationAudio from './vite-plugin-celebration-audio.js';

export default defineConfig({
  // Relative asset paths, so the build works from any host or sub-folder (Vercel, Netlify, GitHub Pages…)
  base: './',
  plugins: [react(), celebrationAudio()],
  server: { open: true },
});
