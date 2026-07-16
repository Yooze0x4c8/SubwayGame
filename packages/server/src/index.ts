/**
 * Server entry point (M0 placeholder).
 *
 * Wave 2 wires up: data loader → in-memory station index build, then Socket.IO
 * boot (plan §3, §5.1). For now this only proves the shared package resolves
 * and the balance config loads without I/O.
 */
import { loadBalance } from '@subway/shared';

const balance = loadBalance();

// Booting stub — real engine/socket wiring lands in Wave 2 (M3/M4).
console.log(
  `[subway] balance loaded: R0=${balance.R0}s T0=${balance.T0}s r=${balance.r} rounds=${balance.roomDefaults.rounds}`,
);
