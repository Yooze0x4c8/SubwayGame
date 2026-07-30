/**
 * 고속철도(KTX·SRT) override 생성기.
 *   IN : data/한국철도공사_KTX 노선별 역정보_*.csv  (계통·순번·역명·주소)
 *        data/한국철도공사_역 위치 정보_*.csv        (좌표, EUC-KR)
 *        data/stations.csv                            (기존 정식 산출물)
 *        + SRT 5계통(사용자 제공, 아래 하드코딩)
 *   OUT: station_data/rail_lines.csv                  (계통 메타)
 *        station_data/rail_stops.csv                  (계통×정차역, 3-way 해결)
 *        plan/rail-expansion-verify.md                (검수 리스트)
 *
 * 실행: node tools/gen-rail-stops.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const dec = (p) => {
  const b = readFileSync(p);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('euc-kr').decode(b);
  }
};
const rows = (t) => t.split(/\r?\n/).filter((x) => x.trim()).map((r) => r.split(','));
const key = (s) => {
  s = s.normalize('NFC').replace(/\s*\(.*?\)\s*/g, '').trim().replace(/[\s·.\-]/g, '');
  if (s.endsWith('역') && s.length > 2) s = s.slice(0, -1);
  return s;
};

// ── 계통 메타 (line_id, 표시명, 운영사, kind) ──────────────────────────
const RAIL_LINES = [
  ['ktx_gyeongbu', 'KTX 경부선', 'KORAIL', 'highspeed', 'normal'],
  ['ktx_honam', 'KTX 호남선', 'KORAIL', 'highspeed', 'normal'],
  ['ktx_gyeongjeon', 'KTX 경전선', 'KORAIL', 'highspeed', 'normal'],
  ['ktx_jeolla', 'KTX 전라선', 'KORAIL', 'highspeed', 'normal'],
  ['ktx_gangneung', 'KTX 강릉선', 'KORAIL', 'highspeed', 'normal'],
  ['ktx_jungang', 'KTX 중앙선', 'KORAIL', 'highspeed', 'normal'],
  ['ktx_jungbunaeryuk', 'KTX 중부내륙선', 'KORAIL', 'highspeed', 'normal'],
  ['srt_gyeongbu', 'SRT 경부선', 'SR', 'highspeed', 'normal'],
  ['srt_honam', 'SRT 호남선', 'SR', 'highspeed', 'normal'],
  ['srt_jeolla', 'SRT 전라선', 'SR', 'highspeed', 'normal'],
  ['srt_gyeongjeon', 'SRT 경전선', 'SR', 'highspeed', 'normal'],
  ['srt_donghae', 'SRT 동해선', 'SR', 'highspeed', 'normal'],
];

// KTX 원본 노선명 → line_id
const KTX_LINE = {
  경부선: 'ktx_gyeongbu', 호남선: 'ktx_honam', 경전선: 'ktx_gyeongjeon',
  전라선: 'ktx_jeolla', 강릉선: 'ktx_gangneung', 중앙선: 'ktx_jungang',
  중부내륙선: 'ktx_jungbunaeryuk',
};

// SRT 5계통 (사용자 제공)
const SRT = {
  srt_gyeongbu: ['수서', '동탄', '평택지제', '천안아산', '오송', '대전', '김천구미', '서대구', '동대구', '신경주', '울산(통도사)', '부산'],
  srt_honam: ['수서', '동탄', '평택지제', '천안아산', '오송', '공주', '익산', '정읍', '광주송정', '나주', '목포'],
  srt_jeolla: ['수서', '동탄', '평택지제', '천안아산', '오송', '공주', '익산', '전주', '남원', '곡성', '구례구', '순천', '여천', '여수EXPO'],
  srt_gyeongjeon: ['수서', '동탄', '평택지제', '천안아산', '오송', '대전', '김천구미', '서대구', '동대구', '밀양', '진영', '창원중앙', '창원', '마산', '진주'],
  srt_donghae: ['수서', '동탄', '평택지제', '천안아산', '오송', '대전', '김천구미', '서대구', '동대구', '포항'],
};

// ── 역 정체성 통일 (개명/표기 병합) ───────────────────────────────────
// raw 표기 → { canon: 정식명, aliases: [...] }
const CANON = {
  '경주': { canon: '경주', aliases: ['신경주'] },
  '신경주': { canon: '경주', aliases: ['신경주'] },
  '김천구미': { canon: '김천구미', aliases: ['김천(구미)'] },
  '김천(구미)': { canon: '김천구미', aliases: ['김천(구미)'] },
  '여수EXPO': { canon: '여수EXPO', aliases: ['여수엑스포', '여수'] },
  '울산(통도사)': { canon: '울산(통도사)', aliases: ['울산', '통도사'] },
  '진부(오대산)': { canon: '진부(오대산)', aliases: ['진부', '오대산'] },
  '판교(경기)': { canon: '판교(경기)', aliases: ['판교'] },
};
const canonOf = (raw) => (CANON[raw]?.canon ?? raw);
const aliasesOf = (raw) => (CANON[raw]?.aliases ?? []);

// ── 명시적 해결 오버라이드 (오탐/동명이역 차단) ──────────────────────
// canonical name → { station_id } (기존역 강제 지정) 또는 { forceNew:true }
const RESOLVE = {
  '양평': { station_id: 'capital_0586' }, // 경의중앙 양평 (5호선 0585 아님)
  '용산': { station_id: 'capital_0630' }, // 서울 용산 (대구2호선 daegu_0869 아님)
  '마산': { forceNew: true },             // KTX/SRT 마산=창원. capital 마산(파주) 아님
};

// 좌표 수동보충 (역위치 파일에서 key 매칭 실패하는 역)
const MANUAL_COORD = {
  '경주': [35.798766, 129.138752],   // 신경주역
  '김천구미': [36.113482, 128.180991],
  '여수EXPO': [34.75, 127.75],
  '동해': [37.4949, 129.1401],
};

// ── 로드 ──────────────────────────────────────────────────────────────
const ktxRows = rows(dec('data/한국철도공사_KTX 노선별 역정보_20251121.csv')).slice(1);
const locRows = rows(dec('data/한국철도공사_역 위치 정보_20240401.csv')).slice(1);
const stRows = rows(dec('data/stations.csv')).slice(1);

const coordByKey = new Map();
for (const c of locRows) coordByKey.set(key(c[1]), [Number(c[2]), Number(c[3])]);

// 기존역: name_key → [{id,region}]
const existByKey = new Map();
for (const c of stRows) {
  const k = c[3];
  if (!existByKey.has(k)) existByKey.set(k, []);
  existByKey.get(k).push({ id: c[0], region: c[4] });
}

// ── 계통별 정차역 조립 (KTX 원본 + SRT) ──────────────────────────────
const routes = {}; // line_id → [rawName,...] (순번 순)
for (const c of ktxRows) {
  const lid = KTX_LINE[c[2]];
  if (!lid) continue;
  (routes[lid] = routes[lid] ?? []).push(c[4].trim());
}
for (const [lid, names] of Object.entries(SRT)) routes[lid] = names.slice();

// ── 정차역 해결 ───────────────────────────────────────────────────────
const stops = []; // {line_id, seq, name, resolve, station_id, region, lat, lon, aliases}
const newStations = new Map(); // canon → {name, aliases, lat, lon, note}
const verify = [];

for (const [lid, names] of Object.entries(routes)) {
  names.forEach((raw, i) => {
    const canon = canonOf(raw);
    const aliases = aliasesOf(raw);
    const k = key(canon);
    const ov = RESOLVE[canon];

    let resolve, station_id = '', region = '', lat = '', lon = '';

    if (ov?.station_id) {
      resolve = 'existing';
      station_id = ov.station_id;
    } else if (!ov?.forceNew) {
      const hits = existByKey.get(k);
      if (hits && hits.length === 1) {
        resolve = 'existing';
        station_id = hits[0].id;
      } else if (hits && hits.length > 1) {
        resolve = 'AMBIGUOUS';
        verify.push(`- ⚠️ **${canon}** (${lid}): 기존역 ${hits.length}개(${hits.map((h) => h.id).join(', ')}) — station_id 지정 필요`);
      }
    }

    if (resolve === undefined || ov?.forceNew) {
      resolve = 'new';
      region = 'national';
      const coord = coordByKey.get(k) ?? MANUAL_COORD[canon];
      if (coord) { [lat, lon] = coord; }
      else verify.push(`- ❌ **${canon}** (${lid}): 좌표 없음 — 수동 입력 필요`);
      if (!newStations.has(canon)) {
        newStations.set(canon, { name: canon, aliases, lat, lon, forced: !!ov?.forceNew });
      }
    }

    stops.push({ line_id: lid, seq: i + 1, name: canon, resolve, station_id, region, lat, lon, aliases: aliases.join('|') });
  });
}

// ── 출력 ──────────────────────────────────────────────────────────────
const q = (v) => (String(v).includes(',') ? `"${v}"` : String(v));

const railLinesCsv = ['line_id,line_name,operator,line_kind,tier',
  ...RAIL_LINES.map((r) => r.map(q).join(','))].join('\n') + '\n';
writeFileSync('station_data/rail_lines.csv', railLinesCsv, 'utf8');

const stopsCsv = ['line_id,seq,name,resolve,station_id,region,lat,lon,aliases',
  ...stops.map((s) => [s.line_id, s.seq, s.name, s.resolve, s.station_id, s.region, s.lat, s.lon, s.aliases].map(q).join(','))].join('\n') + '\n';
writeFileSync('station_data/rail_stops.csv', stopsCsv, 'utf8');

// 검수 리스트
const existingList = [...new Set(stops.filter((s) => s.resolve === 'existing').map((s) => s.name))];
const newList = [...newStations.keys()];
const verifyMd = [
  '# 고속철도 확장 — 데이터 검수 리스트',
  '',
  `자동 생성(${new Date ? '' : ''}tools/gen-rail-stops.mjs). 아래 항목을 사람이 확인.`,
  '',
  `## 요약`,
  `- 계통: ${RAIL_LINES.length}개, 정차역 매핑: ${stops.length}건`,
  `- 기존역 재사용(환승연결): ${existingList.length}개`,
  `- 신규 national 역: ${newList.length}개`,
  '',
  '## 확인 필요',
  ...(verify.length ? verify : ['- (자동 해결 완료, 이상 없음)']),
  '',
  '## 병합/개명 처리 (같은 역사)',
  '- 경주 ≡ 신경주 (2021 개명) — 정식명 경주, alias 신경주',
  '- 김천구미 ≡ 김천(구미) — 정식명 김천구미, alias 김천(구미)',
  '- 여수EXPO ≡ 여수엑스포 ≡ 여수',
  '- 울산(통도사) ≡ 울산 ≡ 통도사',
  '',
  '## 명시 오버라이드 (오탐 차단)',
  '- 양평 → capital_0586 (경의중앙, 5호선 capital_0585 아님)',
  '- 마산 → 신규 national (KTX/SRT=창원, capital 마산=파주 경의중앙 아님)',
  '',
  '## 신규 national 역 목록',
  ...newList.map((n) => {
    const s = newStations.get(n);
    return `- ${n} (${s.lat || '좌표?'}, ${s.lon || '좌표?'})${s.forced ? ' [강제신규]' : ''}`;
  }),
].join('\n') + '\n';
writeFileSync('plan/rail-expansion-verify.md', verifyMd, 'utf8');

console.log(`계통 ${RAIL_LINES.length} · 정차역매핑 ${stops.length} · 기존재사용 ${existingList.length} · 신규 ${newList.length}`);
console.log('검수항목:', verify.length);
console.log('신규역:', newList.join(', '));
