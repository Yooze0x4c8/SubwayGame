/**
 * App: routes by the store's derived UI phase.
 *   landing → waiting → in-game → ended
 *
 * The Settlement overlay appears over the in-game screen between rounds
 * (round:ended event while room.phase === 'playing').
 * RoomList is navigated to from Landing via local UI state.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { StoreProvider, useGameStore } from './state/StoreProvider.js';
import { Landing } from './screens/Landing.js';
import { RoomList } from './screens/RoomList.js';
import { WaitingRoom } from './screens/WaitingRoom.js';
import { InGame } from './screens/InGame.js';
import { Settlement } from './screens/Settlement.js';
import { Result } from './screens/Result.js';
import { colors, fonts } from './ui/theme.js';
import { useAppViewport } from './ui/responsive.js';

export function AnswerFlashGate({
  flashId,
  onDone,
  children,
}: {
  flashId: number;
  onDone: () => void;
  children: ReactNode;
}): JSX.Element {
  useEffect(() => {
    const timeout = setTimeout(onDone, 1000);
    return () => clearTimeout(timeout);
  }, [flashId, onDone]);

  return <>{children}</>;
}

function Router(): JSX.Element {
  const phase = useGameStore((s) => s.phase);
  const roundResult = useGameStore((s) => s.roundResult);
  const answerFlash = useGameStore((s) => s.answerFlash);
  const clearAnswerFlash = useGameStore((s) => s.clearAnswerFlash);
  const [showRoomList, setShowRoomList] = useState(false);

  // Keep the in-game station plate visible for exactly one second before a
  // next-round settlement or final result screen can cover it.
  if (answerFlash) {
    return (
      <AnswerFlashGate flashId={answerFlash.id} onDone={clearAnswerFlash}>
        <InGame />
      </AnswerFlashGate>
    );
  }

  switch (phase) {
    case 'landing':
      if (showRoomList) {
        return <RoomList onBack={() => setShowRoomList(false)} />;
      }
      return <Landing onBrowseRooms={() => setShowRoomList(true)} />;

    case 'waiting':
      return <WaitingRoom onLeave={() => setShowRoomList(true)} />;

    case 'in-game':
      return (
        <>
          <InGame />
          {roundResult && <Settlement result={roundResult} />}
        </>
      );

    case 'ended':
      return <Result />;
  }
}

export function App(): JSX.Element {
  useAppViewport();

  return (
    <StoreProvider>
      <div
        style={{
          minHeight: 'var(--app-height)',
          background: colors.bg,
          color: colors.text,
          fontFamily: fonts.body,
        }}
      >
        <Router />
      </div>
    </StoreProvider>
  );
}
