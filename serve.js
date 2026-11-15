// Zero-dependency local server for the ready-made build (play.html).
//   npm run play   →  http://localhost:8080
// It serves the project folder and a live list of /celebration-audio, so any
// clip you drop into that folder shows up in the game straight away.

import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_DIR, handleAudioRequest, sendFile } from './vite-plugin-celebration-audio.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    if (handleAudioRequest(root, req, res)) return;
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, url === '/' ? 'play.html' : url);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    sendFile(req, res, file, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  })
  .listen(port, () => {
    console.log(`\n  Strike Force FC running at  http://localhost:${port}`);
    for (const list of Object.values(os.networkInterfaces()))
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  On your phone (same Wi-Fi):  http://${a.address}:${port}`);
    console.log(`  Celebration clips folder:   ${path.join(root, AUDIO_DIR)}\n`);
  });
