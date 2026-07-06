// 대회 우승 가능성 — 심사위원 현실 시나리오 종합 테스트. 전 툴·11 harm·다양한 페르소나·엣지.
// 전체 응답을 캡처해 품질 평가. KV 절약: simulate(캐시경량) 위주 + assess 소수 주요도시.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { writeFileSync } from "node:fs";

const URL_ = process.env.MCP_URL;
const c = new Client({ name: "judge", version: "0.0.1" });
await c.connect(new StreamableHTTPClientTransport(new URL(URL_)));

const out = [];
const lat = [];
async function run(section, tag, tool, args) {
  const t = Date.now();
  let text = "", err = false;
  try { const r = await c.callTool({ name: tool, arguments: args }); text = r.content?.[0]?.text ?? ""; err = r.isError === true || text.includes("지연되어"); }
  catch (e) { text = "THROW: " + (e.message || e); err = true; }
  const ms = Date.now() - t; lat.push(ms);
  out.push({ section, tag, tool, args, ms, err, text });
  console.log(`[${section}] ${tag} — ${tool} ${ms}ms${err ? " ✗" : ""}`);
}

// A. 킬러 데모 — 동일 재난, 다른 운명 (같은 폭염 38℃, 페르소나만)
const heat = (occ, age, extra = {}) => ({ occupation: occ, ageBand: age, feelsLikeC: 38, warning: "heatwave", place: "대구", ...extra });
await run("A.동일재난다른운명", "78세 농업(야외)", "simulate_weather_risk", heat("farming", "70-79"));
await run("A.동일재난다른운명", "20대 사무(실내)", "simulate_weather_risk", heat("office", "20-29"));
await run("A.동일재난다른운명", "50대 건설+고혈압", "simulate_weather_risk", heat("construction", "50-59", { chronic: "cardio" }));
await run("A.동일재난다른운명", "30대 배달(야외)", "simulate_weather_risk", heat("delivery", "30-39"));

// B. 11 harm 커버리지 — 다양한 재해×직업
await run("B.멀티해저드", "어민+풍랑 4m", "simulate_weather_risk", { occupation: "fishing", ageBand: "50-59", waveM: 4.0, windMs: 16, warning: "high_seas", place: "부산 영도구" });
await run("B.멀티해저드", "건설+강풍 22m/s", "simulate_weather_risk", { occupation: "construction", ageBand: "40-49", windMs: 22, warning: "strong_wind", place: "인천" });
await run("B.멀티해저드", "택배+호우 40mm", "simulate_weather_risk", { occupation: "delivery", ageBand: "30-39", rain1hMm: 40, warning: "heavy_rain", place: "서울 강남구" });
await run("B.멀티해저드", "노인+한파 -18℃", "simulate_weather_risk", { occupation: "farming", ageBand: "70-79", feelsLikeC: -18, warning: "cold_wave", place: "안동" });
await run("B.멀티해저드", "천식+미세먼지 180", "simulate_weather_risk", { occupation: "outdoor_guide", ageBand: "60-69", pm10: 180, chronic: "respiratory", warning: "pm", place: "서울" });
await run("B.멀티해저드", "환경미화+낙뢰 3km", "simulate_weather_risk", { occupation: "cleaning", ageBand: "50-59", lightningKm: 3, rain1hMm: 20, warning: "heavy_rain", place: "광주광역시" });
await run("B.멀티해저드", "화물운전+태풍", "simulate_weather_risk", { occupation: "freight_driving", ageBand: "40-49", windMs: 25, rain1hMm: 30, warning: "typhoon", place: "부산" });

// C. 실시간 개인 위험 (assess — 주요도시, KV 소수)
await run("C.실시간assess", "택배 대구 야외", "assess_weather_risk", { place: "대구", occupation: "delivery" });
await run("C.실시간assess", "건설 부산", "assess_weather_risk", { place: "부산", occupation: "construction" });
await run("C.실시간assess", "노인 서울", "assess_weather_risk", { place: "서울", occupation: "farming" });

// D. 보조 툴 — 쉼터·공식영향예보·위치
await run("D.보조툴", "무더위쉼터 해운대", "find_nearest_shelter", { place: "부산 해운대" });
await run("D.보조툴", "한파쉼터 춘천", "find_nearest_shelter", { place: "춘천", kind: "cold" });
await run("D.보조툴", "공식영향예보 서울", "official_impact_forecast", { place: "서울" });
await run("D.보조툴", "위치확인 전주", "resolve_location", { place: "전주" });

// E. 로버스트니스·안전
await run("E.로버스트", "헷갈리는 광주", "assess_weather_risk", { place: "광주" });
await run("E.로버스트", "헷갈리는 중구", "resolve_location", { place: "중구" });
await run("E.로버스트", "없는 지명", "resolve_location", { place: "존재안함9999" });
await run("E.로버스트", "한국밖 좌표", "assess_weather_risk", { lat: 35.6, lon: 139.7 });
await run("E.로버스트", "위치 누락", "assess_weather_risk", {});
await run("E.로버스트", "극한 위급 온열", "simulate_weather_risk", { occupation: "construction", ageBand: "70-79", feelsLikeC: 41, warning: "heatwave", chronic: "cardio", place: "대구" });

const s = lat.slice().sort((a, b) => a - b);
const summary = { n: lat.length, p50: s[Math.floor(s.length * 0.5)], p90: s[Math.floor(s.length * 0.9)], max: s[s.length - 1], over3s: lat.filter((x) => x > 3000).length, errors: out.filter((o) => o.err).length };
console.log("\n■ LATENCY/HEALTH:", JSON.stringify(summary));

writeFileSync(process.env.OUT_FILE, out.map((o) => `\n${"=".repeat(80)}\n[${o.section}] ${o.tag}  (${o.tool}, ${o.ms}ms${o.err ? ", ERROR" : ""})\nargs: ${JSON.stringify(o.args)}\n${"-".repeat(80)}\n${o.text}`).join("\n"), "utf8");
console.log("전체 응답 저장:", process.env.OUT_FILE);
await c.close();
