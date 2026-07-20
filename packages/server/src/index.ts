/**
 * Server entry point (M4).
 *
 * Boots the in-memory station index (loader, §5.1) and starts the HTTP +
 * Socket.IO game server (§4). Balance config comes from `@subway/shared`; the
 * loader reads the repo `data/` CSVs once. Real timers / real clock in prod;
 * the transport's injectable time seam is exercised only by tests.
 */
import { loadBalance } from '@subway/shared';

import { loadStationIndex } from './data/loader.js';
import { createGameServer } from './net/socket.js';
import { metrics } from './obs/metrics.js';

const balance = loadBalance();
const index = loadStationIndex();

const PORT = Number(process.env['PORT'] ?? 3000);

const server = createGameServer({ index, cfg: balance });

// HTTP GET /metrics — returns the 4대 지표 JSON for playtest analysis.
server.http.on('request', (req, res) => {
  if (res.headersSent) return; // already handled by Socket.IO (e.g. polling)
  if (req.method === 'GET' && req.url?.startsWith('/metrics')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(metrics.summary(), null, 2));
    return;
  }
  res.writeHead(404);
  res.end();
});

void server.listen(PORT).then((port) => {
  // Boot log (kept from the M0 stub) — proves config + data + transport are up.
  console.log(
    `[subway] balance loaded: R0=${balance.R0}s T0=${balance.T0}s r=${balance.r} rounds=${balance.roomDefaults.rounds}`,
  );
  console.log(`[subway] station index: ${index.records.length} stations loaded`);
  console.log(`[subway] socket.io listening on :${port}`);
});

// Graceful shutdown so the process closes sockets/timers cleanly.
const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
