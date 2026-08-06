/**
 * Game audio: a fare-gate beep on an accepted answer, one note per syllable of
 * the station name, a transfer chime, and an error hit on a rejection.
 *
 * Synthesized with Web Audio — no assets, no dependency, no licensing. The
 * syllable run replaces an earlier text-to-speech announcement: browser TTS is
 * only as good as the OS voice (Windows ships one 2012-era Korean voice), and
 * pre-rendering 990 station clips meant a build pipeline and ~5MB of committed
 * audio. Notes carry the one thing that matters at a glance — how long the name
 * was, which is exactly what the score rewards.
 *
 * The voice of the whole thing is a keystroke into a bell: a bandpassed noise
 * click for the attack (typing) over pitched partials that ring on (the arrival
 * chime). 61% of stations are two syllables, so the ring is what gives a short
 * name the same body a long one gets — length varies, weight does not.
 *
 * Audio is passive output. It never gates input, never touches a clock, and the
 * server stays authoritative, so nothing here can slow the game down.
 *
 * Every entry point is a no-op when Web Audio is missing (jsdom, old browsers)
 * or when the player has muted, so callers never have to guard.
 */

const STORAGE_KEY = 'subway.sound';

// ---------------------------------------------------------------------------
// Mute state (persisted)
// ---------------------------------------------------------------------------

function readEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

let enabled = readEnabled();

/** Whether sound is currently on. */
export function soundEnabled(): boolean {
  return enabled;
}

/** Turn sound on/off and persist the choice. */
export function setSoundEnabled(next: boolean): void {
  enabled = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* ignore — private mode / non-browser */
  }
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/**
 * Shared output stage. A long name rings three partials per syllable at once —
 * two dozen oscillators overlapping — which clips hard straight into
 * `destination`. The compressor is what keeps a 9-syllable answer loud instead
 * of distorted.
 */
function out(ac: AudioContext): AudioNode {
  if (master) return master;
  const gain = ac.createGain();
  gain.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 8;
  gain.connect(comp);
  comp.connect(ac.destination);
  master = gain;
  return master;
}

/**
 * Resume audio from inside a user gesture. iOS/Safari starts the AudioContext
 * suspended, so without this the very first sound of a session is lost.
 */
export function unlockAudio(): void {
  void context()?.resume();
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Schedule one tone. The gain envelope is not decoration: starting or stopping
 * an oscillator at full amplitude produces an audible click.
 */
function tone(
  freq: number,
  startMs: number,
  durMs: number,
  peak: number,
  type: OscillatorType = 'sine',
  endFreq?: number,
): void {
  const ac = context();
  if (!ac) return;
  const t0 = ac.currentTime + startMs / 1000;
  const end = t0 + durMs / 1000;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // A falling pitch is what makes a failure read as a failure.
  if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(endFreq, end);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(out(ac));
  osc.start(t0);
  osc.stop(end + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(ac.sampleRate * 0.2);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** A filtered noise burst — the raw material for every percussive hit here. */
function burst(
  startMs: number,
  peak: number,
  decayMs: number,
  type: BiquadFilterType,
  hz: number,
  q = 0.8,
): void {
  const ac = context();
  if (!ac) return;
  const t0 = ac.currentTime + startMs / 1000;
  const end = t0 + decayMs / 1000;

  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = hz;
  filter.Q.value = q;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(peak, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(out(ac));
  src.start(t0);
  src.stop(end + 0.02);
}

/**
 * The percussive layer of a syllable: a keystroke that is also a wheel over a
 * rail joint.
 *
 * A narrow band of high noise only ever sounds like a thin tick. What reads as
 * a struck key — or a bogie hitting a joint — is the LOW body: a lowpassed
 * thump with real weight, with only a sliver of high noise on top for the
 * fingernail-on-keycap moment.
 */
function keyHit(startMs: number, level: number): void {
  burst(startMs, 0.55 * level, 75, 'lowpass', 430, 0.9); // 타건 몸통 / 바퀴 덜컹
  burst(startMs, 0.2 * level, 12, 'highpass', 5200); // 접점이 닿는 순간
  tone(96, startMs, 80, 0.18 * level); // 레일로 전해지는 저역
}

/**
 * A struck bell. The 2.76 partial is inharmonic on purpose — integer harmonics
 * sound like an organ, and it is the off-ratio ring that reads as metal.
 */
function bell(hz: number, startMs: number, durMs: number, peak: number): void {
  tone(hz, startMs, durMs, peak);
  tone(hz * 2, startMs, durMs * 0.7, peak * 0.34);
  tone(hz * 2.76, startMs, durMs * 0.42, peak * 0.16);
}

// ---------------------------------------------------------------------------
// Syllable run
// ---------------------------------------------------------------------------

/**
 * Major-pentatonic degrees in semitones. A pentatonic scale has no semitone
 * clashes, so a run stays consonant at ANY length — a 10-syllable name climbs
 * two octaves and still resolves, and because the notes overlap they stack into
 * a chord rather than a scale.
 */
const PENTATONIC = [0, 2, 4, 7, 9];
/** Root of the run (C5). */
const BASE_HZ = 523.25;
/** Gap between syllable notes — about the cadence of fast typing. */
const STEP_MS = 95;
/**
 * How long each syllable rings. Deliberately much longer than the gap: 56% of
 * stations are two syllables, and a two-note run that stopped dead would be a
 * blip. Ringing on gives the common short name the same body a long one has.
 */
const RING_MS = 340;
/**
 * Notes at which the run ends on an impact instead of a plain one.
 *
 * 7+ is the top 9.1% of stations once the parenthetical counts (경복궁 정부서울청사,
 * 동대문역사문화공원 …). It was 6 while parentheses were excluded and covered a
 * similar 5.4%; keeping 6 now would fire on 12.4% of answers and stop feeling
 * like anything.
 */
export const IMPACT_NOTES = 7;
/** Longest display name in the data is 14 notes; clamp defensively. */
const MAX_NOTES = 14;

/**
 * Notes to play for a station name.
 *
 * This is deliberately NOT the `syllables` column the score is computed from:
 * that one ignores the parenthetical qualifier, so 이수(총신대입구) scores as 2.
 * For audio the whole plate is what the player reads, so it counts as 7. Latin
 * and digits count one apiece, which is roughly how they are read aloud.
 */
export function noteCount(displayName: string): number {
  let notes = 0;
  for (const ch of displayName) {
    if ((ch >= '가' && ch <= '힣') || /[0-9A-Za-z]/.test(ch)) notes += 1;
  }
  return notes;
}

/** Ascending pentatonic pitch for the `i`-th syllable. */
function noteHz(i: number): number {
  const octave = Math.floor(i / PENTATONIC.length);
  const degree = PENTATONIC[i % PENTATONIC.length]!;
  return BASE_HZ * Math.pow(2, (degree + octave * 12) / 12);
}

/** Gap between hammer blows — tighter than the run, so the finish drives. */
const HAMMER_STEP_MS = 78;

/**
 * How many times the final note is struck.
 *
 * A single impact made every long name land identically, whether it was 7 notes
 * or 14. Instead the finish scales: one blow, plus one more for every note past
 * the threshold, so 경복궁 정부서울청사 hammers harder than 고속터미널 and the
 * one 14-note name in the data is unmistakable.
 */
export function hammerCount(notes: number): number {
  return notes < IMPACT_NOTES ? 0 : 1 + notes - IMPACT_NOTES;
}

/** The payoff for a long name: a bigger bell over a low thump. */
function impact(hz: number, at: number, ringOut: boolean): void {
  keyHit(at, 1.6);
  // Only the last blow rings out; the ones before it are cut short so a long
  // hammer sequence stays percussive instead of smearing into one chord.
  bell(hz, at, ringOut ? 660 : 260, 0.24);
  tone(hz * 1.5, at, ringOut ? 540 : 220, 0.11);
  tone(hz / 4, at, ringOut ? 660 : 280, 0.3);
}

/** Schedule the ascending run `offsetMs` from now. */
function run(count: number, offsetMs: number): void {
  const notes = Math.max(1, Math.min(Math.round(count), MAX_NOTES));
  const hammers = hammerCount(notes);
  for (let i = 0; i < notes; i++) {
    const at = offsetMs + i * STEP_MS;
    if (i === notes - 1 && hammers > 0) {
      for (let h = 0; h < hammers; h++) {
        impact(noteHz(i), at + h * HAMMER_STEP_MS, h === hammers - 1);
      }
    } else {
      // The hit leads and the bell colors it. Reversed, the ring swallows the
      // transient and the whole thing goes back to sounding like a chime.
      keyHit(at, 1);
      bell(noteHz(i), at, RING_MS, 0.11);
    }
  }
}

/** One ascending note per syllable; long names land on {@link impact}. */
export function playSyllables(count: number): void {
  if (!enabled) return;
  run(count, 0);
}

// ---------------------------------------------------------------------------
// Event sounds
// ---------------------------------------------------------------------------

/** 교통카드 태그음 — one short beep, the way a fare gate answers. */
function tag(): void {
  burst(0, 0.24, 25, 'bandpass', 3000, 1.1);
  tone(2000, 0, 110, 0.32);
  tone(2990, 0, 70, 0.1);
}

/**
 * 환승 — the platform chime: 딩-동-댕 rising over a low swell, with the last
 * note held. The held C6 is the octave of the run's root, so the syllables that
 * follow land inside a note still ringing rather than after a gap.
 */
const TRANSFER_LEAD_MS = 520;

function transferChime(): void {
  burst(0, 0.34, 300, 'lowpass', 320, 0.8); // 열차가 들어오는 저역
  tone(130.81, 0, 760, 0.2); // C3 swell
  bell(659.25, 0, 520, 0.26); // 딩 — E5
  bell(783.99, 150, 560, 0.28); // 동 — G5
  bell(1046.5, 310, 900, 0.32); // 댕 — C6, held
}

/**
 * Accepted answer. A transfer swaps the gate beep for the platform chime and
 * pushes the run back behind it, so the two never talk over each other.
 */
export function playAccepted(notes: number, transfer = false): void {
  if (!enabled) return;
  if (transfer) {
    transferChime();
    run(notes, TRANSFER_LEAD_MS);
  } else {
    tag();
    run(notes, 70);
  }
}

/** Rejected answer — a hard downward hit. */
export function playError(): void {
  if (!enabled) return;
  burst(0, 0.42, 90, 'lowpass', 900, 0.9);
  tone(300, 0, 260, 0.3, 'sawtooth', 110);
  tone(150, 0, 300, 0.22, 'square', 60);
}
