# WeatherSafetyOS MCP — 카카오 PlayMCP 제출용

위치·직업·연령 기반 **개인 기상안전 도우미** MCP 서버. 기상청 실시간 데이터로 "지금 당신에게" 위험한지와 무엇을 해야 하는지를 알려준다.

> **별도 트랙**: 메인 산출물(`../sentinel-demo`, 기상청 실증 코어)과 분리된 얇은 MCP 인터페이스.
> 코어는 건드리지 않고 배포된 공개 Worker API만 호출한다. 기상청/재난안전 API 키는 코어 Worker만 보유 —
> 이 MCP는 키를 갖지 않는다(유출 표면 0, 카카오 규칙 §4 개인정보/인증정보 반려 회피).

## 규격 준수 (카카오 PlayMCP 규칙 01)

| 항목 | 상태 |
|---|---|
| 전송 | ✅ Streamable HTTP (SDK `StreamableHTTPServerTransport`), stateless(no session) |
| 버전 | ✅ SDK 협상(2025-06-18 등, 허용범위 내) |
| 서버/툴명 `kakao` 금지 | ✅ 빌드 전 네이밍 린트가 강제 |
| 툴 개수 3~10 | ✅ 5개 |
| annotations 5종 | ✅ title·readOnlyHint·destructiveHint·openWorldHint·idempotentHint |
| description 영문·≤1024·서비스명 | ✅ "… Part of WeatherSafetyOS(웨더세이프티OS)." |
| 응답 Markdown·≤24k·TextContent | ✅ 선택지 칩 푸터 포함, 24k 가드 |
| p99 3s | ✅ 외부호출 2.8s 타임아웃 + 코어 병렬화·KV 캐시 |
| 광고·리워드·개인정보 6종 | ✅ 없음 |
| LLM 웹검색 불가 고유가치 | ✅ 실시간 공식경보·낙뢰관측·쉼터DB·결정론 위험엔진·공식 영향예보 |

## 제공 툴 (5)

| 툴 | 용도 |
|---|---|
| `assess_weather_risk(lat, lon)` | 지금 이 좌표의 개인 기상위험 판정 + 행동요령 + 최근접 쉼터 (실시간) |
| `simulate_weather_risk(occupation, ageBand, …)` | "만약 이런 날씨에 이런 사람이라면?" what-if — 같은 기상, 직업·연령별 차등 |
| `find_nearest_shelter(lat, lon, kind)` | 행안부 공식 무더위/한파 쉼터 6만여 곳 중 최근접 |
| `official_impact_forecast(lat, lon, sector)` | 기상청 공식 영향예보(직업 분야별 등급) — "농업 경고 vs 일반인 주의" |
| `resolve_location(lat, lon)` | GPS → 기상청 4체계 위치 변환 |

## 로컬 실행·검증

```bash
npm install
npm run build          # 네이밍 린트 + tsc → dist/
npm start              # Express 서버 :8080  (POST /mcp)
npm run smoke          # 5툴 핸들러 직접 호출(라이브 코어)
# 실제 MCP 프로토콜 검증: (서버 켠 상태에서) tsx scripts/client-smoke.ts
npm run inspect        # MCP Inspector (제출 전 필수 점검)
npm run stdio          # 로컬/Claude Desktop용 stdio 전송
```

## PlayMCP in KC 배포 (Kev 액션)

KC는 **Git 소스 빌드**(루트 Dockerfile) 또는 컨테이너 이미지(linux/amd64)만 받는다. 절차:

1. **이 폴더(`mcp-server/`)를 공개 Git repo로 푸시** (루트에 `Dockerfile` 있음, 브랜치 `main`).
   - 로컬 도커 확인(선택): `docker build --platform linux/amd64 -t weathersafetyos-mcp . && docker run -p 8080:8080 weathersafetyos-mcp`
2. **KC(`playmcp.kakaocloud.io`) → PlayMCP in KC 서버 생성**: 서버명 `weathersafetyos-mcp`, Git URL·브랜치 `main`·Dockerfile 경로 `Dockerfile` → 빌드 → `Active` → **Endpoint URL** 복사.
3. **PlayMCP 임시 등록**: Endpoint URL 입력 → "정보 불러오기" 성공 확인 → 도구함 추가 → AI채팅 테스트.
4. **대화 예시 3개 입력**(아래) → **심사 요청(≤7/7 권장)** → 승인 → **전체 공개** → 상세 URL 확보.
5. **공모전 비즈폼 "Player 예선 참여"**(≤7/14, 1회, 최대 2개 — 슬롯2로 제출).

### 등록용 대화 예시 3개

1. **"지금 관악구인데 밖에 나가도 될까?"**
   → `assess_weather_risk` (실시간 위험 + 행동요령 + 쉼터)
2. **"폭염경보 떴는데 시골에서 밭일 하시는 78세 아버지, 위험할까?"**
   → `simulate_weather_risk(occupation=farming, ageBand=70-79, feelsLikeC=38, warning=heatwave)` → 온열질환 위급 + **기상청 공식 영향예보 "농업 경고 vs 일반인 주의"**
3. **"이 근처 무더위 쉼터 어디 있어?"**
   → `find_nearest_shelter` (행안부 공식 6만 곳 중 최근접 + 지도)

## 구조
```
mcp-server/
├─ Dockerfile          ← KC Git-소스 빌드(linux/amd64, node:22, dist/server.js)
├─ src/tools.ts        ← 툴 5종(zod·annotations·영문desc·Markdown+칩), 코어 Worker 호출
├─ src/server.ts       ← Express 5 + SDK StreamableHTTPServerTransport(stateless)
├─ src/stdio.ts        ← stdio 전송(로컬/Claude)
├─ src/naming.ts       ← kakao 네이밍 금지 강제
└─ scripts/            ← lint-naming · smoke · client-smoke
```
