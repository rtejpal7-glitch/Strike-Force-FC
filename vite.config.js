import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import celebrationAudio from './vite-plugin-celebration-audio.js';

export default defineConfig({
  plugins: [react(), celebrationAudio()],
  server: { open: true },
});
