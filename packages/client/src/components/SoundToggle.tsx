/**
 * Mute toggle. A voice announcing every station is far more intrusive than a
 * beep, so the control sits in reach on both the lobby and the in-game screen
 * rather than behind a settings panel.
 */

import { useState } from 'react';

import { setSoundEnabled, soundEnabled, unlockAudio } from '../ui/sound.js';
import { colors, fonts, radii, tracking } from '../ui/theme.js';

export function SoundToggle(): JSX.Element {
  const [on, setOn] = useState(soundEnabled);

  return (
    <button
      type="button"
      className="sg-btn"
      data-testid="sound-toggle"
      aria-pressed={on}
      aria-label={on ? '소리 끄기' : '소리 켜기'}
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
        // This click is a user gesture — the one chance iOS gives us to start.
        if (next) unlockAudio();
      }}
      style={{
        flexShrink: 0,
        fontFamily: fonts.body,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: tracking.ko,
        padding: '5px 9px',
        borderRadius: radii.sm,
        border: `1px solid ${on ? colors.border : colors.borderLight}`,
        background: colors.panel,
        color: on ? colors.textDim : colors.textMuted,
        lineHeight: 1,
      }}
    >
      {on ? '소리 켬' : '소리 끔'}
    </button>
  );
}
