/**
 * 고속철도 증강 빌드 (원본 xlsx 불필요, 재실행 안전/idempotent).
 *
 *   BASE : data/{stations,lines,station_lines}.csv   (기존 정식 산출물)
 *   OVER : station_data/{rail_lines,rail_stops}.csv   (gen-rail-stops.mjs 산출)
 *   OUT  : data/{stations,lines,station_lines}.csv + data/meta.json  (덮어씀)
 *
 * 매 실행마다 이전 고속철도 행(rail line_id / region=national 역)을 먼저 제거한 뒤
 * override로부터 재구성하므로 여러 번 돌려도 결과가 동일하다.
 *
 * 실행: node tools/build-rail.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

// ── CSV (RFC4180 최소 파서, loader.ts와 동일 규칙) ────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false, i = 0;
  const n = text.length;
  const endF = () => { row.push(field); field = ''; };
  const endR = () => { endF(); rows.push(row); row = []; };
  while (i < n) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',') { endF(); i++; continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') { endR(); i += 2; continue; } endR(); i++; continue; }
    if (ch === '\n') { endR(); i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) endR();
  return rows;
}
function records(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0];
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === '') continue;
    const rec = {};
    header.forEach((h, c) => (rec[h] = cells[c] ?? ''));
    out.push(rec);
  }
  return { header, rows: out };
}
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) =>
  [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';

// ── 판정 키 / 음절 (build.py·judgment.ts와 동일) ──────────────────────
const stripParen = (s) => s.replace(/\s*\(.*?\)\s*/g, '').trim();
function nameKey(s) {
  s = s.normalize('NFC').replace(/\s*\(.*?\)\s*/g, '').trim().replace(/[\s·.\-]/g, '');
  if (s.endsWith('역') && s.length > 2) s = s.slice(0, -1);
  return s;
}
const syllables = (s) => [...stripParen(s)].filter((c) => c >= '가' && c <= '힣').length;

// ── 로드 ──────────────────────────────────────────────────────────────
const stB = records(readFileSync('data/stations.csv', 'utf8'));
const lnB = records(readFileSync('data/lines.csv', 'utf8'));
const slB = records(readFileSync('data/station_lines.csv', 'utf8'));
const railLines = records(readFileSync('station_data/rail_lines.csv', 'utf8')).rows;
const railStops = records(readFileSync('station_data/rail_stops.csv', 'utf8')).rows;

const railLineIds = new Set(railLines.map((r) => r.line_id));

// ── idempotent: 이전 고속철도 산출물 제거 ─────────────────────────────
let stations = stB.rows.filter((r) => r.region !== 'national');
let lines = lnB.rows.filter((r) => !railLineIds.has(r.line_id));
let stationLines = slB.rows.filter((r) => !railLineIds.has(r.line_id));

// 기존 lines.csv에 line_kind/operator 없으면 metro로 채움 (스키마 확장)
for (const r of lines) { r.line_kind = r.line_kind || 'metro'; r.operator = r.operator || ''; }

// ── 신규 national 역 결정 (canon name 기준, 결정적 id) ────────────────
const newByName = new Map(); // canon → {name, aliases, lat, lon}
for (const s of railStops) {
  if (s.resolve !== 'new') continue;
  if (!newByName.has(s.name)) {
    newByName.set(s.name, { name: s.name, aliases: s.aliases || '', lat: s.lat, lon: s.lon });
  }
}
const errors = [];
const nationalId = new Map(); // canon → national_XXXX (sorted name)
[...newByName.keys()].sort().forEach((name, i) => {
  nationalId.set(name, `national_${String(i + 1).padStart(4, '0')}`);
});
for (const [name, info] of newByName) {
  if (info.lat === '' || info.lon === '') errors.push(`신규역 좌표 없음: ${name}`);
  stations.push({
    station_id: nationalId.get(name),
    name,
    display_name: name,
    name_key: nameKey(name),
    region: 'national',
    syllables: String(syllables(name)),
    is_transfer: '0', // 최종 재계산
    aliases: info.aliases,
    lat: String(info.lat),
    lon: String(info.lon),
  });
}

// ── station_lines 매핑 추가 ───────────────────────────────────────────
const stationByName = new Map(); // (region 무시) name_key → id 는 애매하므로 id 직접 사용
const idSet = new Set(stations.map((s) => s.station_id));
for (const s of railStops) {
  let sid;
  if (s.resolve === 'existing') {
    sid = s.station_id;
    if (!idSet.has(sid)) { errors.push(`rail_stops existing 미존재 station_id: ${sid} (${s.name}/${s.line_id})`); continue; }
  } else if (s.resolve === 'new') {
    sid = nationalId.get(s.name);
  } else {
    errors.push(`rail_stops 미해결 resolve=${s.resolve}: ${s.name}/${s.line_id}`);
    continue;
  }
  stationLines.push({ station_id: sid, line_id: s.line_id });
}
// 중복 제거
{
  const seen = new Set();
  stationLines = stationLines.filter((r) => {
    const k = `${r.station_id}|${r.line_id}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}

// ── is_transfer 재계산 ────────────────────────────────────────────────
const lineCount = new Map();
for (const r of stationLines) lineCount.set(r.station_id, (lineCount.get(r.station_id) ?? 0) + 1);
for (const s of stations) s.is_transfer = (lineCount.get(s.station_id) ?? 0) > 1 ? '1' : '0';

// ── 고속철도 노선 행 추가 (station_count/startable 계산) ──────────────
const countByLine = new Map();
for (const r of stationLines) countByLine.set(r.line_id, (countByLine.get(r.line_id) ?? 0) + 1);
for (const rl of railLines) {
  const n = countByLine.get(rl.line_id) ?? 0;
  lines.push({
    line_id: rl.line_id,
    line_name: rl.line_name,
    region: 'national',
    tier: rl.tier,
    station_count: String(n),
    startable: '0', // 고속철도는 시작 노선 금지
    line_kind: rl.line_kind, // highspeed
    operator: rl.operator,
  });
}
// 기존 노선 station_count 재확인 (매핑 불변이지만 안전차원)
for (const r of lines) {
  if (railLineIds.has(r.line_id)) continue;
  const n = countByLine.get(r.line_id) ?? 0;
  if (String(n) !== String(r.station_count)) {
    r.station_count = String(n); // 재보정
  }
}

// ── 검증 ──────────────────────────────────────────────────────────────
const orphan = stations.filter((s) => (lineCount.get(s.station_id) ?? 0) === 0);
if (orphan.length) errors.push(`고아역: ${orphan.map((s) => s.station_id).join(', ')}`);
// 권역 내 name_key 충돌(national) — split 선언 없이 중복이면 경고
const byRegionKey = new Map();
for (const s of stations) {
  const k = `${s.region}|${s.name_key}`;
  (byRegionKey.get(k) ?? byRegionKey.set(k, []).get(k)).push(s);
}
const nationalDup = [...byRegionKey.entries()].filter(([k, v]) => k.startsWith('national|') && v.length > 1);
for (const [k, v] of nationalDup) errors.push(`national 동명 충돌: ${v.map((s) => s.name).join(',')}`);

if (errors.length) {
  console.error('빌드 실패:');
  for (const e of errors) console.error('  [ERROR]', e);
  process.exit(1);
}

// ── 출력 ──────────────────────────────────────────────────────────────
stations.sort((a, b) => a.station_id.localeCompare(b.station_id));
stationLines.sort((a, b) => (a.station_id + a.line_id).localeCompare(b.station_id + b.line_id));
lines.sort((a, b) => a.line_id.localeCompare(b.line_id));

writeFileSync('data/stations.csv', toCsv(stB.header, stations), 'utf8');
writeFileSync('data/station_lines.csv', toCsv(slB.header, stationLines), 'utf8');
const lineHeader = ['line_id', 'line_name', 'region', 'tier', 'station_count', 'startable', 'line_kind', 'operator'];
writeFileSync('data/lines.csv', toCsv(lineHeader, lines), 'utf8');

const byRegion = {};
for (const s of stations) byRegion[s.region] = (byRegion[s.region] ?? 0) + 1;
const meta = JSON.parse(readFileSync('data/meta.json', 'utf8'));
meta.stations = stations.length;
meta.lines = lines.length;
meta.pairs = stationLines.length;
meta.by_region = byRegion;
meta.rail_expansion = {
  base_date: '2025-11-21 (KTX 노선별 역정보) / SRT 사용자제공',
  ktx_lines: railLines.filter((r) => r.line_id.startsWith('ktx_')).length,
  srt_lines: railLines.filter((r) => r.line_id.startsWith('srt_')).length,
  national_stations: byRegion.national ?? 0,
};
writeFileSync('data/meta.json', JSON.stringify(meta, null, 2) + '\n', 'utf8');

console.log(`빌드 성공 — 역 ${stations.length} · 노선 ${lines.length} · 매핑 ${stationLines.length}`);
console.log('region:', byRegion);
