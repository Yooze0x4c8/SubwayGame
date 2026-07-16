/**
 * App: routes by the store's derived UI phase.
 *   landing → waiting → in-game → ended
 *
 * The Settlement overlay appears over the in-game screen between rounds
 * (round:ended event while room.phase === 'playing').
 * RoomList is navigated to from Landing via local UI state.
 */

import { useState } from 'react';

import { StoreProvider, useGameStore } from './state/StoreProvider.js';
import { Landing } from './screens/Landing.js';
import { RoomList } from './screens/RoomList.js';
import { WaitingRoom } from './screens/WaitingRoom.js';
import { InGame } from './screens/InGame.js';
import { Settlement } from './screens/Settlement.js';
import { Result } from './screens/Result.js';
import { colors, fonts } from './ui/theme.js';

function Router(): JSX.Element {
  const phase = useGameStore((s) => s.phase);
  const roundResult = useGameStore((s) => s.roundResult);
  const [showRoomList, setShowRoomList] = useState(false);

  switch (phase) {
    case 'landing':
      if (showRoomList) {
        return <RoomList onBack={() => setShowRoomList(false)} />;
      }
      return <Landing onBrowseRooms={() => setShowRoomList(true)} />;

    case 'waiting':
      return <WaitingRoom />;

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
  return (
    <StoreProvider>
      <div
        style={{
          minHeight: '100vh',
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
