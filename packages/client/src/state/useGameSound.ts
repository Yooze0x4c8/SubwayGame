/**
 * Wires game audio to server events.
 *
 * Subscribes to the socket directly rather than to the store: sound is a
 * reaction to an event, not a projection of state, and `turn:accepted` already
 * carries the canonical syllable count the run is built from.
 */

import { useEffect } from 'react';

import { ServerEvents } from '@subway/shared';

import { noteCount, playAccepted, playError, unlockAudio } from '../ui/sound.js';
import { useGameClient } from './StoreProvider.js';

/** Play the fare-gate beep + syllable run for the whole session. */
export function useGameSound(): void {
  const client = useGameClient();

  // iOS/Safari only allows audio that originates in a user gesture, and the
  // first game sound never does — so borrow the first tap on the page.
  useEffect(() => {
    const unlock = (): void => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    const offs = [
      client.on(ServerEvents.turnAccepted, (p) =>
        playAccepted(noteCount(p.stationName), p.transfer),
      ),
      client.on(ServerEvents.turnRejected, () => playError()),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [client]);
}
