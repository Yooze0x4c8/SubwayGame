#!/usr/bin/env python3
"""
SUBWAY 역 데이터 빌드
  raw/*.xlsx + override/*.csv  ->  out/{stations,lines,station_lines,meta}.csv

원본은 절대 수정하지 않는다. 모든 보정은 override/ 에서.
검증 실패 시 exit 1 — 깨진 데이터가 조용히 배포되는 것보다 빌드가 깨지는 게 낫다.
"""
import sys, re, math, json, unicodedata, itertools, collections
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).parent
RAW = sorted((ROOT / "raw").glob("*.xlsx"))[-1]
OUT = ROOT / "out"; OUT.mkdir(exist_ok=True)

# 역명 뒤에 '역'을 일괄로 붙이는 기관 — 표기 투표에서 제외한다.
# 원본 검증 결과: 코레일 333/334행, 김포골드라인 10/10행이 이 패턴.
SUFFIX_OPS = {"한국철도공사", "김포골드라인에스알에스㈜",
              "남양주도시공사", "구리도시공사"}
GRAY_LO, GRAY_HI = 300, 1500   # 이 구간은 자동 판정 금지 -> homonym.csv 선언 필수
MIN_LINE_STATIONS = 20         # 시작 노선 가중 랜덤 하한 (기획서 §6)

errors, warnings = [], []
def err(m): errors.append(m)
def warn(m): warnings.append(m)


# ── 유틸 ──────────────────────────────────────────────────────────────
def dist_m(a, b):
    """위경도 -> 미터. 한반도 위도대에서 오차 1% 미만이라 이 정도면 충분."""
    return math.hypot((a[0] - b[0]) * 111_000, (a[1] - b[1]) * 88_000)

def strip_paren(s):
    return re.sub(r"\s*\(.*?\)\s*", "", s).strip()

def paren_content(s):
    m = re.search(r"\((.*?)\)", s)
    return m.group(1).strip() if m else None

def norm_key(s):
    """판정용 키: NFC 정규화 + 공백/중점/마침표 제거."""
    s = unicodedata.normalize("NFC", s)
    return re.sub(r"[\s·.\-]", "", s)

def syllables(s):
    """이름 보너스용 음절 수 — 괄호 병기명 제외, 한글 음절만 (기획서 §4.1)."""
    return sum(1 for c in strip_paren(s) if "가" <= c <= "힣")


# ── 로드 ──────────────────────────────────────────────────────────────
df = pd.read_excel(RAW, dtype=str)
base_date = str(df["데이터기준일자"].iloc[0])[:10]
print(f"원본: {RAW.name}  ({len(df)}행, 기준일 {base_date})")

line_meta = pd.read_csv(ROOT / "override/line_meta.csv", dtype=str).fillna("")
homonym = pd.read_csv(ROOT / "override/homonym.csv", dtype=str).fillna("")
patch = pd.read_csv(ROOT / "override/station_patch.csv", dtype=str).fillna("")
lsplit = pd.read_csv(ROOT / "override/line_split.csv", dtype=str).fillna("")

LMAP = {r.raw_line_name: r for r in line_meta.itertuples()}
HOM = {(r.region, r.name): r.verdict for r in homonym.itertuples()}
PAREN_ID = {r.raw_name for r in patch.itertuples() if r.op == "paren_id"}
KEEP_YEOK = {r.raw_name for r in patch.itertuples() if r.op == "keep_yeok"}
RENAME = {r.raw_name: r.arg for r in patch.itertuples() if r.op == "rename"}  # "역사명|노선명" -> 새 이름


# ── 1. 노선 정규화 ────────────────────────────────────────────────────
unknown = set(df["노선명"]) - set(LMAP)
if unknown:
    err(f"line_meta.csv 에 없는 노선: {sorted(unknown)}  <- 신규 노선 개통. 매핑 추가 필요")

df["line_id"] = df["노선명"].map(lambda x: LMAP[x].line_id if x in LMAP else None)
df["region"] = df["노선명"].map(lambda x: LMAP[x].region if x in LMAP else None)

dropped = df[df["line_id"] == "EXCLUDE"]
if len(dropped):
    print(f"  제외: {len(dropped)}행 ({', '.join(sorted(set(dropped['노선명'])))})")
df = df[df["line_id"].notna() & (df["line_id"] != "EXCLUDE")].copy()

# 물리 노선 하나가 운행계통 두 개인 경우 (경원선 = 경의중앙 + 1호선) — 역 단위 예외
SPLIT = {(r.raw_line_name, norm_key(r.station)): r.line_id for r in lsplit.itertuples()}
def apply_split(row):
    k = (row["노선명"], norm_key(re.sub(r"\s*\(.*?\)\s*", "", row["역사명"]).rstrip("역")))
    return SPLIT.get(k, row["line_id"])
df["line_id"] = df.apply(apply_split, axis=1)
hit = {k for k in SPLIT if k[0] in set(df["노선명"])}
if len(hit) != len(SPLIT):
    err(f"line_split.csv 에 매칭 안 된 항목: {sorted(set(SPLIT) - hit)}")


# ── 2. 역명 정규화 ────────────────────────────────────────────────────
def canon_name(row):
    n = unicodedata.normalize("NFC", row["역사명"]).strip()
    return RENAME.get(f"{n}|{row['노선명']}", n)

def match_key(base):
    """매칭 키 — '역' 접미사를 기관 무관하게 제거한다.

    기관별 표기가 제각각이라(코레일/김포골드라인/대경선은 붙이고 나머지는 안 붙임)
    운영기관 기준 규칙은 깨진다. 전부 떼서 맞추고, 잘못 붙는 건 좌표가 잡는다.
    표시용 이름은 아래에서 다수결로 되살린다.
    """
    b = norm_key(base)
    return b[:-1] if b.endswith("역") and len(b) > 2 else b

df["name"] = df.apply(canon_name, axis=1)
df["base"] = df["name"].map(strip_paren)
df["key"] = df["base"].map(match_key)
df["lat"] = df["역위도"].astype(float)
df["lon"] = df["역경도"].astype(float)


# ── 3. 역 병합 — (권역, 키) 단위, 좌표로 동명이역 선별 ─────────────────
stations, station_lines = [], []
groups = collections.defaultdict(list)
for _, r in df.iterrows():
    groups[(r["region"], r["key"])].append(r)

undeclared, sid = [], 0
for (region, key), rows in sorted(groups.items()):
    clusters = []  # [[row, ...], ...]
    for r in rows:
        placed = False
        for c in clusters:
            d = min(dist_m((r.lat, r.lon), (x.lat, x.lon)) for x in c)
            if d <= GRAY_LO:
                c.append(r); placed = True; break
            if d < GRAY_HI:
                # 회색 구간 — 자동 판정 금지. 선언을 봐야 한다.
                v = HOM.get((region, rows[0]["base"]))
                if v is None:
                    undeclared.append((region, rows[0]["base"], round(d),
                                       [x["노선명"] for x in c] + [r["노선명"]]))
                    c.append(r); placed = True; break
                if v == "merge":
                    c.append(r); placed = True; break
                # split -> 다음 클러스터로
        if not placed:
            clusters.append([r])

    if len(clusters) > 1 and HOM.get((region, rows[0]["base"])) is None:
        undeclared.append((region, rows[0]["base"], -1, [x["노선명"] for x in rows]))

    # 대표 표기는 그룹 전체(=모든 클러스터)에서 뽑는다. 동명이역은 이름이 같아야
    # 하고(신촌/신촌은 둘 다 '신촌'), 갈리는 건 노선 집합뿐이다 — 기획서 §6.
    # 표기 투표에서 코레일은 뺀다. 코레일은 333/334행에서 '역'을 일괄로 붙이므로
    # 표를 주면 '청량리'가 '청량리역'이 된다. 반대로 진짜 이름이 '역'으로 끝나는
    # 역(서울역·대구역·광주송정역)은 타 기관이 '역'을 붙여 쓰므로 그대로 살아남는다.
    voters = [x for x in rows if x["운영기관명"] not in SUFFIX_OPS] or rows
    cnt = collections.Counter(x["base"] for x in voters)
    top = max(cnt.values())
    rep_base = min((b for b, n in cnt.items() if n == top), key=lambda b: (len(b), b))
    if not [x for x in rows if x["운영기관명"] not in SUFFIX_OPS]:
        # 코레일 단독 역 — 접미사를 벗긴다 (남동인더스파크역 -> 남동인더스파크)
        if rep_base.endswith("역") and len(rep_base) > 2 and rep_base not in KEEP_YEOK:
            rep_base = rep_base[:-1]
    rep = min((x["name"] for x in voters if strip_paren(x["name"]).startswith(rep_base)),
              key=len, default=rep_base)
    for x in voters:  # 괄호 병기가 있는 표기를 우선 채택
        if strip_paren(x["name"]).startswith(rep_base) and paren_content(x["name"]) \
           and x["name"] not in PAREN_ID:
            rep = x["name"]; break
    rep = rep if strip_paren(rep) == rep_base or paren_content(rep) else rep_base

    for c in clusters:
        sid += 1
        station_id = f"{region}_{sid:04d}"
        aliases = set()
        for x in rows:
            if x["name"] in PAREN_ID:
                continue
            p = paren_content(x["name"])
            if p:
                aliases.add(p)
                aliases.add(strip_paren(x["name"]))
        aliases.discard(strip_paren(rep))
        stations.append(dict(
            station_id=station_id,
            name=rep_base,
            display_name=rep,
            name_key=key,
            region=region,
            syllables=syllables(rep),
            is_transfer=int(len({x["line_id"] for x in c}) > 1),
            aliases="|".join(sorted(a for a in aliases if a)),
            lat=round(sum(x.lat for x in c) / len(c), 6),
            lon=round(sum(x.lon for x in c) / len(c), 6),
        ))
        for lid in sorted({x["line_id"] for x in c}):
            station_lines.append(dict(station_id=station_id, line_id=lid))

if undeclared:
    for region, name, d, lines in undeclared:
        err(f"동명이역 미선언: {region}/{name} ({d}m, {lines}) "
            f"-> homonym.csv 에 merge/split 선언 필요")

st = pd.DataFrame(stations)
sl = pd.DataFrame(station_lines).drop_duplicates()


# ── 4. 노선 테이블 ────────────────────────────────────────────────────
seen, lines = {}, []
for r in line_meta.itertuples():
    if r.line_id in ("EXCLUDE", "") or r.line_id in seen:
        continue
    seen[r.line_id] = True
    n = int((sl["line_id"] == r.line_id).sum())
    lines.append(dict(line_id=r.line_id, line_name=r.line_name, region=r.region,
                      tier=r.tier, station_count=n,
                      startable=int(n >= MIN_LINE_STATIONS)))
ln = pd.DataFrame(lines)
ln = ln[ln.station_count > 0]


# ── 5. 검증 ───────────────────────────────────────────────────────────
orphan = set(st.station_id) - set(sl.station_id)
if orphan:
    err(f"노선 없는 역: {len(orphan)}개")

bad = st[(st.is_transfer == 1) & st.station_id.map(lambda s: (sl.station_id == s).sum() < 2)]
if len(bad):
    err(f"환승 표시인데 노선 1개: {list(bad.name)}")

for region, g in st.groupby("region"):
    dup = g[g.duplicated("name_key", keep=False)]
    for k, gg in dup.groupby("name_key"):
        if HOM.get((region, gg.iloc[0]["name"])) != "split":
            err(f"권역 내 이름 충돌 미선언: {region}/{gg.iloc[0]['name']}")

# 노선별 연결성 — 노선 하나가 통째로 고립되면 게임이 안 됨
adj = collections.defaultdict(set)
for lid, g in sl.groupby("line_id"):
    ids = list(g.station_id)
    for a, b in itertools.combinations(ids, 2):
        pass  # 노선 내부 인접은 원본에 없음 (역 순서 미제공) — 아래 주석 참조
tr = sl.groupby("station_id")["line_id"].nunique()
hub = set(tr[tr > 1].index)
for region, g in st.groupby("region"):
    lids = set(sl[sl.station_id.isin(g.station_id)]["line_id"])
    reach, frontier = set(), {sorted(lids)[0]}
    while frontier:
        cur = frontier.pop(); reach.add(cur)
        sids = set(sl[sl.line_id == cur]["station_id"]) & hub
        for nxt in set(sl[sl.station_id.isin(sids)]["line_id"]) - reach:
            frontier.add(nxt)
    if lids - reach:
        warn(f"{region}: 다른 노선과 환승으로 이어지지 않는 노선 {sorted(lids - reach)}")

if not (st.syllables > 0).all():
    err(f"음절 수 0인 역: {list(st[st.syllables == 0]['name'])}")


# ── 6. 출력 ───────────────────────────────────────────────────────────
for m in warnings:
    print(f"  [warn] {m}")
if errors:
    print("\n빌드 실패:")
    for m in errors:
        print(f"  [ERROR] {m}")
    sys.exit(1)

st.sort_values("station_id").to_csv(OUT / "stations.csv", index=False)
sl.sort_values(["station_id", "line_id"]).to_csv(OUT / "station_lines.csv", index=False)
ln.sort_values("line_id").to_csv(OUT / "lines.csv", index=False)
(OUT / "meta.json").write_text(json.dumps({
    "source": "공공데이터포털 전국도시철도역사정보표준데이터",
    "source_file": RAW.name,
    "data_base_date": base_date,
    "stations": len(st), "lines": len(ln), "pairs": len(sl),
    "by_region": st.groupby("region").size().to_dict(),
}, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"\n빌드 성공 — 역 {len(st)} · 노선 {len(ln)} · 매핑 {len(sl)}")
print(st.groupby("region").size().to_string())
