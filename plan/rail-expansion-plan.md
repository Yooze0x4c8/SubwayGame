# 고속철도(KTX·SRT) 확장 모드 구현 계획

> 작성 기준일 2026-07-30. 근거: 코드/데이터 실측 조인. 이 문서는 구현의 단일 기준(SSOT).

## 0. 목표와 확정 사항

일반 지하철 게임(`metro`)은 **동작을 100% 그대로 유지**하고, 새 게임 모드 `railExpansion`을
추가한다. 확장 모드는 수도권 지하철에서 출발해 서울·용산·수서 등에서 KTX/SRT로 진입하고,
지방 도착 후 지방 지하철로 다시 환승하는 전국 철도 플레이를 허용한다.

확정 사항(사용자 결정):
- 모드명: **고속철도 확장** (`railExpansion`)
- **KTX + SRT 주요 계통** 포함
- 실제 운행 계통별로 `line_id` **분리** (한 덩어리 금지)
- 같은 계통 정차역이면 역 순서와 무관하게 연결 (기존 판정 규칙 유지)
- 신규 고속철도역 `region = national` **신설** (기존 역은 원 지역 유지)
- 시작역은 고속철도를 제외한 **수도권 철도 환승역**, 시작 노선도 수도권 철도로 제한

## 1. 현재 구조 (근거 코드)

- 판정 `packages/shared/src/judgment.ts` `judge()`: **지역/모드 필터 없음.** 후보는 전국
  `index.byName`에서 뽑고, `직진 = activeMask & lines(c)`, `환승 = lines(현재역) & lines(c)`.
  → 노선 비트가 지역별로 분리돼 있어서 지금은 크로스-리전 누수가 없을 뿐. **KTX/SRT는 최초의
  지역 관통 노선**이라, 마스크 없이 붙이면 metro 모드에서도 서울역→부산역이 정답 처리된다.
- 시작 `packages/server/src/game/engine.ts`: 엔진이 단일 `region`에 바인딩. startPool은
  `region` + `tierFilter`로만 필터(`engine.ts:161-173`). "노선 먼저 → 환승역" 순서.
- 설정 `packages/shared/src/types.ts` `Settings`: `region`, `tierFilter`만 사용.
- 로더 `packages/server/src/data/loader.ts`: `lines.csv`에서 `line_id,line_name,region,tier,
  station_count,startable` 읽어 비트 인터닝. 컬럼 추가는 하위호환(무시됨).
- 데이터 빌드 `station_data/build.py`: `override/*.csv` → `out/*.csv`.
  - `manual_stations.csv` 루프(`build.py:229-259`): `(region,name)`이 기존역과 **유일 매칭**이면
    그 `station_id` 재사용(노선만 추가), 아니면 신규 역 생성(좌표 필수).
  - `line_meta.csv` → lines 테이블, `startable = int(station_count >= 20)`.
  - 검증: 고아역, 환승 불일치, 권역 내 동명이역 미선언(=err), 노선 연결성(=warn).

## 2. 데이터 커버리지 (실측 조인)

원본: `data/한국철도공사_KTX 노선별 역정보_20251121.csv`(계통·순번·역명·주소),
`data/한국철도공사_역 위치 정보_20240401.csv`(위경도, EUC-KR), SRT 5계통은 사용자 제공.

- **KTX 7계통**: 경부(19)·호남(17)·경전(16)·전라(18)·강릉(16)·중앙(10)·중부내륙(6)
- **SRT 5계통**: 경부(12)·호남(11)·전라(14)·경전(15)·동해(10)
- KTX 고유역 69개: 기존역과 이름일치 20 / 신규 49 (좌표확보 45, 수동보충 4)
- SRT 고유역 32개: 대부분 KTX·기존과 공유, **SRT 단독 신규는 김천구미·신경주 2개**

## 3. 설계 결정

### 3.1 모드 마스크 (지역이 아니라 노선 종류로 격리)
- 노선에 `line_kind ∈ {metro, highspeed}` 부여.
- **metroMask** = 모든 `line_kind=metro` 노선 비트의 OR (지금까지의 전부).
- **expansionMask** = 전체 노선 비트 OR (metro + highspeed).
- `judge()`에 `allowedMask` 인자 추가 → 후보/현재역 노선을 `& allowedMask`로 제한.
  metro 모드는 `allowedMask=metroMask`라서 KTX/SRT 비트가 절대 안 열린다.
- `region=national`은 "고속철도 전용 신규역"을 담는 버킷일 뿐, 격리는 마스크가 담당.

### 3.2 계통별 line_id (분리)
```
ktx_gyeongbu, ktx_honam, ktx_gyeongjeon, ktx_jeolla,
ktx_gangneung, ktx_jungang, ktx_jungbunaeryuk,
srt_gyeongbu, srt_honam, srt_jeolla, srt_gyeongjeon, srt_donghae
```
- tier = `normal`(신규 tier값 도입 안 함 — 로더 검증이 intro/normal/hardcore만 허용).
- 모두 `startable=0` (계통 station_count가 20 미만이라 자동 0이지만, 확장 시작 로직도 별도 차단).

### 3.3 명시적 정차역 매핑 (오탐 방지) — ⚠️ 중요
이름 자동매칭은 **오탐**이 있다:
- `마산`: capital_0337 = 경의중앙 마산(파주). KTX/SRT 경전선 마산 = 창원. **다른 역** → 신규 national.
- `양평`: capital_0585/0586 split 동명이역. KTX 양평(강릉/중앙) = 경의중앙·중앙선 양평 → **station_id 지정 필요.**
- 그 외 대부분은 `(region,name)` 유일 매칭이 안전(서울/용산/광명/수서/동탄/대전/동대구/부산/광주송정/평택지제/상봉/덕소/부발 등).

→ 정차역 매핑은 **신규 override `rail_stops.csv`**로 관리하고, 각 정차역을 셋 중 하나로 명시 해결한다:
1. `station_id` 명시 → 그 역에 계통 추가 (동명이역/오탐 대상)
2. `region`+`name` 유일 매칭 → 그 역에 계통 추가
3. 매칭 없음 → `region=national` 신규역 생성 (좌표 필수)

### 3.4 표기 통일 (alias)
- `김천(구미)`[SRT] ↔ `김천구미`[KTX]: 정식명 `김천구미`, alias `김천(구미)|김천` (같은 역, 한 station_id).
- `신경주`[SRT] ↔ `경주`[KTX]: 같은 역(신경주역→경주역 개명). 정식명 `경주`, alias `신경주`.
- `여수EXPO`: alias `여수엑스포|여수`.
- `울산(통도사)`: alias `울산|통도사`.

## 4. 데이터 파이프라인 변경

### 4.1 override 파일
- `line_meta.csv`: 컬럼에 `line_kind`(기본 metro), `operator` 추가. 12개 고속철도 계통 행 추가
  (`line_kind=highspeed`, `region=national`, `tier=normal`).
- **신규 `rail_stops.csv`**: `line_id,seq,name,resolve,station_id,region,lat,lon,aliases`
  - 계통×정차역 1행. KTX는 원본 CSV에서 생성 + 좌표 조인, SRT는 사용자 목록에서 생성.
  - 좌표 수동보충 4역: 김천구미·여수EXPO·동해·(경주는 신경주 좌표 흡수).
- `homonym.csv`: 전국 확장으로 생기는 충돌 선언 (예: national 마산 vs capital 마산은 지역이
  달라 per-region 검사엔 안 걸리나, byName 다중후보이므로 문서화. 필요한 merge/split 추가).

### 4.2 build.py
- `line_meta` 로드에 `line_kind`,`operator` 반영 → lines 출력에 두 컬럼 추가.
- `rail_stops.csv` 처리 블록 신설(§3.3 3-way 해결). manual_stations와 동일한 방식으로
  `st`/`sl`에 append하되 `station_id` 명시 해결을 우선.
- 신규역 `region=national` 허용(지역 화이트리스트가 있으면 추가).
- 검증: national 노선의 연결성 warn은 정상(허브=서울/오송/대전 등)임을 확인. 고아역 0 유지.
- `lines.csv` 출력 스키마: `line_id,line_name,region,tier,station_count,startable,line_kind,operator`.

### 4.3 산출물
- `data/{stations,lines,station_lines}.csv` 재생성 + `meta.json` 갱신(national 카운트).
- **검수 리스트** `plan/rail-expansion-verify.md`: 애매한 매핑 6~8건 사람이 확인.

## 5. 엔진/판정 변경

### 5.1 shared
- `Settings`에 `gameMode: 'metro' | 'railExpansion'`(기본 `metro`). `protocol.ts` 반영.
- `types.ts`: `Line`에 `lineKind`, `StationIndex`에 `metroMask`/`expansionMask`(bigint) 추가.
- `judge()` 시그니처에 `allowedMask: bigint` 추가. `linesT &= allowedMask`,
  `currentLines &= allowedMask` 후 기존 로직. (metro는 metroMask, expansion은 expansionMask)
- 타임아웃 예시 정답 생성기도 동일 `allowedMask` 사용.

### 5.2 loader
- lines.csv `line_kind` 읽어 `lineKind` 채우고, 로드시 `metroMask`(비고속 OR),
  `expansionMask`(전체 OR) 계산해 `StationIndex`에 노출.

### 5.3 engine
- `EngineDeps`에 `gameMode`, `allowedMask` 추가.
- metro 경로: 기존 그대로(단 judge에 metroMask 전달).
- railExpansion 경로 시작 로직:
  1. 후보 = `region=capital` && 비고속(capital metro) 노선 **2개 이상** 가진 환승역.
  2. 후보 역을 먼저 추첨(가중치 없이 균등 or 노선수 가중 — 균등 채택).
  3. 그 역의 비고속 capital 노선 중 하나를 시작 `activeMask`로 선택.
  4. `allowedMask=expansionMask`로 진행.
- `rooms.ts`: `Settings.gameMode` → 엔진 생성 시 `allowedMask` 결정, region 바인딩은
  expansion일 때 무시(전국).

## 6. UI 변경 (client)
- 대기실: `일반 지하철 / 고속철도 확장` 모드 선택. expansion 선택 시 지역·tier 필터 숨김/고정.
- 방 목록: 모드 배지.
- 노선 색상: KTX(코레일 블루)·SRT(퍼플) 배지/색 `lineColors.ts`,`theme.ts`.
- 게임 설명 팝업: 전국 철도 환승 규칙 1줄 추가.

## 7. 검증 계획
- 단위: `judge()` metroMask에서 KTX/SRT 후보 `lineMismatch`. expansionMask에서 수도권→KTX→지방 성립.
- 로더: metroMask/expansionMask popcount, national 역 lineMask가 고속 비트만 갖는지.
- 엔진: expansion 시작역이 항상 capital 환승역 & 시작 activeMask가 비고속(반복 추첨 테스트).
  KTX↔SRT 공용역(오송·동대구 등) 환승 판정. 동명이역(마산·양평) 정확 선택.
- 빌드: `python station_data/build.py` 성공, 고아역 0, meta 카운트 갱신.
- 회귀: 기존 loader.test / engine.test / judgment.test / socket.test 전부 green.

## 8. 작업 순서 (체크리스트)
1. [ ] 데이터: `rail_stops.csv` 생성(KTX 조인 + SRT + 좌표 보충), `line_meta.csv`/`homonym.csv` 확장
2. [ ] build.py 확장 + 재빌드 → `data/*.csv` 갱신, 검수 리스트 산출
3. [ ] shared: `gameMode`, `Line.lineKind`, `judge(allowedMask)`, protocol
4. [ ] loader: `lineKind` + metroMask/expansionMask + 테스트
5. [ ] engine/rooms: expansion 시작 로직 + allowedMask 배선 + 테스트
6. [ ] client UI: 모드 선택/배지/색상/설명
7. [ ] 전체 테스트 + 빌드 green, 회귀 확인

## 9. 리스크 / 미해결
- SRT 신경주=경주, 김천(구미)=김천구미 동일역사 판단은 **사람 검수 필요**(검수 리스트에 명시).
- 이름 오탐(마산·양평 등)은 §3.3 명시 매핑으로 차단. 추가 오탐은 검수 리스트에서 확인.
- national 노선 연결성 warn은 허용(전국 허브 경유). 고아역/미선언 동명이역은 err → 반드시 해소.
- 좌표 4역 수동보충 값은 위키 기준, 검수 리스트에 출처 표기.
