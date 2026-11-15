import fs from 'node:fs';
import path from 'node:path';

// Serves a live list of the clips in /celebration-audio so the game discovers
// new files without any code change:
//   GET /celebration-audio/manifest.json  →  [{ file, name, url, size, modified }]
// In dev the folder is read on every request; on build it is copied to dist/
// together with a manifest snapshot.

export const AUDIO_DIR = 'celebration-audio';
export const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i;

export function prettyName(file) {
  return file
    .replace(AUDIO_EXT, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const MIME = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', webm: 'audio/webm', opus: 'audio/ogg',
};

// Streams a file with HTTP Range support (needed for seeking long songs).
export function sendFile(req, res, file, type) {
  const size = fs.statSync(file).size;
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const m = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

// Serves /celebration-audio/manifest.json and the clip files themselves.
export function handleAudioRequest(root, req, res) {
  const url = decodeURIComponent((req.originalUrl || req.url).split('?')[0]);
  const prefix = `/${AUDIO_DIR}/`;
  if (!url.startsWith(prefix)) return false;
  const name = url.slice(prefix.length);
  if (name === 'manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(listClips(root)));
    return true;
  }
  const dir = path.join(root, AUDIO_DIR);
  const file = path.join(dir, name);
  if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return true;
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  sendFile(req, res, file, MIME[ext] || 'application/octet-stream');
  return true;
}

export function listClips(root) {
  const dir = path.join(root, AUDIO_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => AUDIO_EXT.test(f) && !f.startsWith('.'))
    .map((f) => ({ f, st: fs.statSync(path.join(dir, f)) }))
    // Hide files that are still being copied in (changed in the last 2 s, or empty).
    .filter(({ st }) => st.size > 0 && Date.now() - st.mtimeMs > 2000)
    .map(({ f, st }) => {
      return {
        file: f,
        name: prettyName(f),
        url: `${AUDIO_DIR}/${encodeURIComponent(f)}`,
        size: st.size,
        modified: st.mtimeMs,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function celebrationAudio() {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'celebration-audio',
    configResolved(cfg) {
      root = cfg.root;
      outDir = path.resolve(cfg.root, cfg.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!handleAudioRequest(root, req, res)) next();
      });
    },
    closeBundle() {
      const src = path.join(root, AUDIO_DIR);
      if (!fs.existsSync(src)) return;
      const dest = path.join(outDir, AUDIO_DIR);
      fs.mkdirSync(dest, { recursive: true });
      for (const c of listClips(root)) fs.copyFileSync(path.join(src, c.file), path.join(dest, c.file));
      fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(listClips(root)));
    },
  };
}
