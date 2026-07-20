/**
 * Server entry point (M4).
 *
 * Boots the in-memory station index (loader, §5.1) and starts the HTTP +
 * Socket.IO game server (§4). Balance config comes from `@subway/shared`; the
 * loader reads the repo `data/` CSVs once. Real timers / real clock in prod;
 * the transport's injectable time seam is exercised only by tests.
 */
import { readFile, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBalance } from '@subway/shared';

import { loadStationIndex } from './data/loader.js';
import { createGameServer } from './net/socket.js';
import { metrics } from './obs/metrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In Docker: /app/packages/server/dist/index.js → ../../client/dist
const STATIC_DIR = process.env['STATIC_DIR'] ?? join(__dirname, '../../client/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

async function serveFile(filePath: string, res: ServerResponse): Promise<boolean> {
  try {
    const s = await stat(filePath);
    const target = s.isDirectory() ? join(filePath, 'index.html') : filePath;
    const buf = await readFile(target);
    const mime = MIME[extname(target)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(buf);
    return true;
  } catch {
    return false;
  }
}

const balance = loadBalance();
const index = loadStationIndex();

const PORT = Number(process.env['PORT'] ?? 3000);

const server = createGameServer({ index, cfg: balance });

server.http.on('request', (req, res) => {
  if (res.headersSent) return; // already handled by Socket.IO (e.g. polling)

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // HTTP GET /metrics — 4대 지표 JSON for playtest analysis.
  if (req.method === 'GET' && req.url?.startsWith('/metrics')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(metrics.summary(), null, 2));
    return;
  }

  // Static file serving + SPA fallback for the React client.
  const urlPath = (req.url ?? '/').split('?')[0]!.replace(/\.\./g, '');
  const filePath = join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  void serveFile(filePath, res).then((served) => {
    if (!served) {
      void serveFile(join(STATIC_DIR, 'index.html'), res).then((fb) => {
        if (!fb) { res.writeHead(404); res.end(); }
      });
    }
  });
});

void server.listen(PORT).then((port) => {
  // Boot log (kept from the M0 stub) — proves config + data + transport are up.
  console.log(
    `[subway] balance loaded: R0=${balance.R0}s T0=${balance.T0}s r=${balance.r} rounds=${balance.roomDefaults.rounds}`,
  );
  console.log(`[subway] station index: ${index.records.length} stations loaded`);
  console.log(`[subway] socket.io listening on :${port}`);

  // Render free tier sleeps after 15 min inactivity. Self-ping every 5 min keeps it awake.
  // RENDER_EXTERNAL_URL is injected automatically by Render; no-op in other envs.
  const selfUrl = process.env['RENDER_EXTERNAL_URL'];
  if (selfUrl) {
    const PING_MS = 5 * 60 * 1000;
    setInterval(() => {
      fetch(`${selfUrl}/health`).catch(() => { /* ignore — server still runs */ });
    }, PING_MS);
    console.log(`[subway] keep-alive ping enabled → ${selfUrl}/health every ${PING_MS / 1000}s`);
  }
});

// Graceful shutdown so the process closes sockets/timers cleanly.
const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
