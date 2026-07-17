/**
 * Seoul metro (and other Korean transit) line brand colors.
 * Keyed by the line_id slug used in the server's CSV data.
 * Used by RouteRibbon (segment tinting) and current-line chips.
 *
 * Sources:
 *   수도권: 서울특별시도시철도공사 / 코레일 공식 노선 색상
 *   부산·대구·대전·광주: 각 도시철도 공사 브랜드 가이드
 */

/** Hex color string. */
export type LineColor = string;

/** Static map: line_id slug → hex brand color. */
export const LINE_COLORS: Record<string, LineColor> = {
  // ── 수도권 (capital) ─────────────────────────────────────────
  seoul_1:        '#0052A4', // 1호선 파랑
  seoul_2:        '#00A84D', // 2호선 초록
  seoul_3:        '#EF7C1C', // 3호선 주황
  seoul_4:        '#00A5DE', // 4호선 하늘
  seoul_5:        '#996CAC', // 5호선 보라
  seoul_6:        '#CD7C2F', // 6호선 황토
  seoul_7:        '#747F00', // 7호선 올리브
  seoul_8:        '#E6186C', // 8호선 핑크
  seoul_9:        '#BDB092', // 9호선 골드
  gyeongui:       '#77C4A3', // 경의중앙선 연두
  bundang:        '#F5A200', // 분당선 노랑
  sinbundang:     '#D4003B', // 신분당선 빨강
  arex:           '#0090D2', // 공항철도 파랑
  gyeongchun:     '#0C8E72', // 경춘선 녹색
  gyeonggang:     '#003DA5', // 경강선 파랑
  suin:           '#F5A200', // 수인선 (분당 동일)
  seohae:         '#8FC31F', // 서해선 연두
  gtx_a:          '#9B1B7E', // GTX-A 보라
  ui:             '#B0B0B0', // 우이신설 회색
  silim:          '#6789CA', // 신림선 파랑
  gimpo:          '#8ABC00', // 김포골드 연두
  incheon_1:      '#7CA8D5', // 인천1호선 파랑
  incheon_2:      '#F5A200', // 인천2호선 노랑
  // ── 부산 (busan) ─────────────────────────────────────────────
  busan_1:        '#F05B28', // 부산1호선 주황
  busan_2:        '#2DBE6C', // 부산2호선 초록
  busan_3:        '#C0A83C', // 부산3호선 황금
  busan_4:        '#5498CE', // 부산4호선 파랑
  donghae:        '#E60012', // 동해선 빨강
  busan_gimhae:   '#8BC541', // 부산김해 연두
  // ── 대구 (daegu) ─────────────────────────────────────────────
  daegu_1:        '#D93F3F', // 대구1호선 빨강
  daegu_2:        '#3CB83A', // 대구2호선 초록
  daegu_3:        '#F5A200', // 대구3호선 황금
  // ── 대전 (daejeon) ───────────────────────────────────────────
  daejeon_1:      '#0063A8', // 대전1호선 파랑
  // ── 광주 (gwangju) ───────────────────────────────────────────
  gwangju_1:      '#00A84D', // 광주1호선 초록
};

/** Human-readable display names keyed by line_id slug. */
export const LINE_NAMES: Record<string, string> = {
  seoul_1: '1호선', seoul_2: '2호선', seoul_3: '3호선', seoul_4: '4호선',
  seoul_5: '5호선', seoul_6: '6호선', seoul_7: '7호선', seoul_8: '8호선',
  seoul_9: '9호선', gyeongui: '경의중앙선', bundang: '분당선',
  sinbundang: '신분당선', arex: '공항철도', gyeongchun: '경춘선',
  gyeonggang: '경강선', suin: '수인선', seohae: '서해선',
  gtx_a: 'GTX-A', ui: '우이신설선', silim: '신림선', gimpo: '김포골드라인',
  incheon_1: '인천1호선', incheon_2: '인천2호선',
  busan_1: '부산1호선', busan_2: '부산2호선', busan_3: '부산3호선',
  busan_4: '부산4호선', donghae: '동해선', busan_gimhae: '부산김해경전철',
  daegu_1: '대구1호선', daegu_2: '대구2호선', daegu_3: '대구3호선',
  daejeon_1: '대전1호선', gwangju_1: '광주1호선',
};

/** Fallback for unknown line_id slugs. */
export const LINE_COLOR_FALLBACK: LineColor = '#6B7280';

/**
 * Resolve a brand color from a line_id slug.
 * Returns the fallback grey for unrecognised lines rather than throwing.
 */
export function lineColor(lineId: string): LineColor {
  return LINE_COLORS[lineId] ?? LINE_COLOR_FALLBACK;
}

/**
 * Given a list of line_id slugs (e.g. the activeMask lines),
 * return the most prominent/first recognisable color.
 */
export function primaryLineColor(lineIds: string[]): LineColor {
  for (const id of lineIds) {
    const c = LINE_COLORS[id];
    if (c) return c;
  }
  return LINE_COLOR_FALLBACK;
}
