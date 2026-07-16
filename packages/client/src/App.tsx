/**
 * App: routes by the store's derived UI phase.
 *   landing → waiting → in-game → ended
 *
 * A transient round-ended banner overlays the in-game screen between rounds
 * (minimal; full settlement is M6).
 */

import { StoreProvider, useGameStore } from './state/StoreProvider.js';
import { Landing } from './screens/Landing.js';
import { WaitingRoom } from './screens/WaitingRoom.js';
import { InGame } from './screens/InGame.js';
import { Ended } from './screens/Ended.js';
import { colors } from './ui/theme.js';

function RoundEndedBanner(): JSX.Element | null {
  const roundResult = useGameStore((s) => s.roundResult);
  const room = useGameStore((s) => s.room);
  if (!roundResult || room?.phase !== 'playing') return null;

  const label =
    roundResult.type === 'suddendeath' ? '라운드 종료 · 실패' : '라운드 종료 · 완주';
  return (
    <div
      data-testid="round-ended-banner"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: colors.panelAlt,
        color: colors.text,
        padding: '8px 16px',
        borderRadius: 10,
        border: `2px solid ${colors.warn}`,
        fontWeight: 700,
        zIndex: 10,
      }}
    >
      {label}
    </div>
  );
}

function Router(): JSX.Element {
  const phase = useGameStore((s) => s.phase);
  switch (phase) {
    case 'landing':
      return <Landing />;
    case 'waiting':
      return <WaitingRoom />;
    case 'in-game':
      return (
        <>
          <RoundEndedBanner />
          <InGame />
        </>
      );
    case 'ended':
      return <Ended />;
  }
}

export function App(): JSX.Element {
  return (
    <StoreProvider>
      <div
        style={{
          minHeight: '100vh',
          background: colors.bg,
          color: colors.text,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <Router />
      </div>
    </StoreProvider>
  );
}
