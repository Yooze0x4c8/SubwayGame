/**
 * Revised Romanization of Korean, for the 역명판 (station nameplate) subtitle.
 *
 * Real Seoul Metro signage sets the Korean station name large and the romanized
 * name small beneath it. To reproduce that we need to romanize arbitrary station
 * names at runtime — there is no romanization column in the CSV data.
 *
 * This implements RR transcription (소리 나는 대로), including the assimilation
 * rules that matter for station names:
 *
 *   신림   → Sillim      (ㄴ + ㄹ → ll)
 *   종로   → Jongno      (ㅇ + ㄹ → ng + n)
 *   왕십리 → Wangsimni   (ㅂ + ㄹ → m + n)
 *   역삼   → Yeoksam
 *   합정   → Hapjeong
 *
 * Known limitation: ㄴ-insertion across morpheme boundaries is not applied,
 * because it needs morpheme segmentation we don't have. 서울역 romanizes as
 * "Seouryeok" rather than the official "Seoullyeok". This text is a decorative
 * signage subtitle, never an identifier, so the tradeoff is acceptable.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const MEDIAL_COUNT = 21;
const FINAL_COUNT = 28;

/** Onset (초성) romanization, indexed by choseong index 0–18. */
const ONSETS = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
  'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
] as const;

/** Vowel (중성) romanization, indexed by jungseong index 0–20. */
const VOWELS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
  'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
] as const;

/** Coda (종성) romanization in final position, indexed by jongseong index 0–27. */
const CODAS = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k',
  'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't',
  't', 'ng', 't', 't', 'k', 't', 'p', 't',
] as const;

/**
 * Liaison (연음): what a coda becomes when the next syllable starts with ㅇ.
 * `[coda that stays, consonant that moves to the next onset]`.
 */
const LIAISON: ReadonlyArray<readonly [string, string]> = [
  ['', ''],     // (none)
  ['', 'g'],    // ㄱ
  ['', 'kk'],   // ㄲ
  ['k', 's'],   // ㄳ
  ['', 'n'],    // ㄴ
  ['n', 'j'],   // ㄵ
  ['', 'n'],    // ㄶ — ㅎ drops
  ['', 'd'],    // ㄷ
  ['', 'r'],    // ㄹ
  ['l', 'g'],   // ㄺ
  ['l', 'm'],   // ㄻ
  ['l', 'b'],   // ㄼ
  ['l', 's'],   // ㄽ
  ['l', 't'],   // ㄾ
  ['l', 'p'],   // ㄿ
  ['', 'r'],    // ㅀ — ㅎ drops
  ['', 'm'],    // ㅁ
  ['', 'b'],    // ㅂ
  ['p', 's'],   // ㅄ
  ['', 's'],    // ㅅ
  ['', 'ss'],   // ㅆ
  ['ng', ''],   // ㅇ — stays put (강아 → gang-a)
  ['', 'j'],    // ㅈ
  ['', 'ch'],   // ㅊ
  ['', 'k'],    // ㅋ
  ['', 't'],    // ㅌ
  ['', 'p'],    // ㅍ
  ['', ''],     // ㅎ — drops (좋아 → joa)
];

// Coda groups, by the sound the coda actually closes on.
const K_CODAS = new Set([1, 2, 3, 9, 24]);
const T_CODAS = new Set([7, 19, 20, 22, 23, 25, 27]);
const P_CODAS = new Set([14, 17, 18, 26]);
const N_CODAS = new Set([4, 5, 6]);
const L_CODAS = new Set([8, 11, 12, 13, 15]);
const M_CODAS = new Set([10, 16]);
const NG_CODA = 21;

// Choseong indices we branch on.
const CHO_G = 0, CHO_N = 2, CHO_D = 3, CHO_R = 5, CHO_M = 6;
const CHO_S = 9, CHO_IEUNG = 11, CHO_J = 12, CHO_H = 18;

interface Syllable {
  onset: number;
  vowel: number;
  coda: number;
}

function decompose(ch: string): Syllable | null {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return null;
  const offset = code - HANGUL_BASE;
  return {
    onset: Math.floor(offset / (MEDIAL_COUNT * FINAL_COUNT)),
    vowel: Math.floor(offset / FINAL_COUNT) % MEDIAL_COUNT,
    coda: offset % FINAL_COUNT,
  };
}

/**
 * Resolve the boundary between one syllable's coda and the next syllable's onset.
 * Returns `[coda romanization, next onset romanization]`.
 */
function resolveBoundary(coda: number, nextOnset: number): [string, string] {
  // Liaison — the coda slides into the empty onset.
  if (nextOnset === CHO_IEUNG) {
    const [stays, moves] = LIAISON[coda]!;
    return [stays, moves];
  }

  const defaultCoda = CODAS[coda]!;
  const defaultOnset = ONSETS[nextOnset]!;

  // ㅎ coda + plain stop → aspirated stop (놓고 → noko).
  if (coda === 27) {
    if (nextOnset === CHO_G) return ['', 'k'];
    if (nextOnset === CHO_D) return ['', 't'];
    if (nextOnset === CHO_J) return ['', 'ch'];
    if (nextOnset === CHO_S) return ['', 'ss'];
    if (nextOnset === CHO_N) return ['n', 'n'];
  }

  // Plain stop coda + ㅎ → aspirated stop (축하 → chuka).
  if (nextOnset === CHO_H) {
    if (K_CODAS.has(coda)) return ['', 'k'];
    if (T_CODAS.has(coda)) return ['', 't'];
    if (P_CODAS.has(coda)) return ['', 'p'];
  }

  // Nasalization before ㄴ / ㅁ (국민 → gungmin, 닫는 → danneun, 밥물 → bammul).
  if (nextOnset === CHO_N || nextOnset === CHO_M) {
    if (K_CODAS.has(coda)) return ['ng', defaultOnset];
    if (T_CODAS.has(coda)) return ['n', defaultOnset];
    if (P_CODAS.has(coda)) return ['m', defaultOnset];
    if (L_CODAS.has(coda) && nextOnset === CHO_N) return ['l', 'l'];
  }

  // Before ㄹ: either lateralization (ll) or ㄹ → ㄴ after a nasal/stop.
  if (nextOnset === CHO_R) {
    if (N_CODAS.has(coda)) return ['l', 'l'];   // 신림 → Sillim
    if (L_CODAS.has(coda)) return ['l', 'l'];   // 울릉 → Ulleung
    if (K_CODAS.has(coda)) return ['ng', 'n'];  // 백로 → baengno
    if (T_CODAS.has(coda)) return ['n', 'n'];
    if (P_CODAS.has(coda)) return ['m', 'n'];   // 왕십리 → Wangsimni
    if (M_CODAS.has(coda)) return ['m', 'n'];   // 침략 → chimnyak
    if (coda === NG_CODA) return ['ng', 'n'];   // 종로 → Jongno
  }

  return [defaultCoda, defaultOnset];
}

/**
 * Romanize a Korean string using Revised Romanization transcription.
 * Non-Hangul characters (digits, Latin, `·`, spaces) pass through unchanged.
 */
export function romanize(input: string): string {
  const chars = [...input];
  const out: string[] = [];

  // Onset override carried over from the previous syllable's liaison.
  let pendingOnset: string | null = null;

  for (let i = 0; i < chars.length; i++) {
    const syllable = decompose(chars[i]!);

    if (!syllable) {
      pendingOnset = null;
      out.push(chars[i]!);
      continue;
    }

    const onset = pendingOnset ?? ONSETS[syllable.onset]!;
    pendingOnset = null;

    const next = i + 1 < chars.length ? decompose(chars[i + 1]!) : null;

    let coda: string;
    if (next) {
      const [codaOut, nextOnsetOut] = resolveBoundary(syllable.coda, next.onset);
      coda = codaOut;
      pendingOnset = nextOnsetOut;
    } else {
      coda = CODAS[syllable.coda]!;
    }

    out.push(onset + VOWELS[syllable.vowel]! + coda);
  }

  return out.join('');
}

/**
 * Romanize a station name for signage display: RR transcription, first letter
 * capitalized, the way it is printed on a real 역명판.
 */
export function romanizeStation(name: string): string {
  const romanized = romanize(name);
  if (!romanized) return '';
  return romanized.charAt(0).toUpperCase() + romanized.slice(1);
}
