// WeatherSafetyOS MCP — 툴 정의(PlayMCP 규격). 배포된 코어 Worker의 공개 API만 호출하는 얇은 레이어.
// 규칙(kakaomcp docs 01/03): 영문 description(≤1024·서비스명 병기), annotations 5종, Markdown 응답(≤24k)+선택지 칩.
// 응답 언어는 한국어(PlayMCP 타깃=국내 사용자). description만 영문.
import { z, type ZodRawShape } from "zod";
import { BACKEND_URL, FETCH_TIMEOUT_MS, MAX_RESPONSE_CHARS } from "./constants.js";

// ── 공통 유틸 ────────────────────────────────────────────────────────
const SERVICE = "Part of WeatherSafetyOS(웨더세이프티OS).";
// 백엔드 호출자 — 기본은 공개 URL로 HTTP fetch(Node/KC 경로). Cloudflare Worker 경로에선
// 같은 계정 워커끼리 workers.dev 호출이 라우팅 문제를 내므로, 서비스 바인딩 fetch로 교체(setBackendFetch).
type BackendFetch = (path: string, init?: RequestInit) => Promise<Response>;
let backendFetch: BackendFetch = (path, init) => fetch(`${BACKEND_URL}${path}`, init);
export function setBackendFetch(fn: BackendFetch): void { backendFetch = fn; }

async function callBackend(path: string, init?: RequestInit): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await backendFetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: { "user-agent": "WeatherSafetyOS-MCP/0.1", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`backend_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
function guard(md: string): string {
  return md.length > MAX_RESPONSE_CHARS ? md.slice(0, MAX_RESPONSE_CHARS) + "\n\n… (이하 생략)" : md;
}
/** 다음 액션 선택지 칩 푸터(규칙 04) — LLM이 자연스럽게 후속 툴콜하도록 유도 */
function chips(...items: string[]): string {
  return items.length ? `\n\n---\n다음으로 › ${items.map((c) => `\`${c}\``).join("  ")}` : "";
}

const SEV_KO: Record<string, string> = {
  extreme: "🔴 위급(즉시 대피)", high: "🟠 높음(오늘은 피하세요)", moderate: "🟡 보통(대비하세요)",
  low: "🟢 낮음(유의)", advisory: "🔵 생활 안내", info: "⚪ 특이사항 없음",
};
const HARM_KO: Record<string, string> = {
  heat_illness: "온열질환", flood_isolation: "침수·고립", lightning: "낙뢰", drowning: "익수·풍랑",
  hypothermia: "저체온·한파", respiratory: "호흡기(미세먼지)", traffic: "교통", wind_damage: "강풍",
  landslide: "산사태", surge_structure: "폭풍해일",
};
const IMPACT_LV = ["영향없음", "관심", "주의", "경고", "위험"];

const OCC_TO_HEG: Record<string, string> = {
  office: "HEG-INDOOR-SAFE", farming: "HEG-OUT-AGRI", fishing: "HEG-OUT-FISH",
  construction: "HEG-OUT-CONST", cleaning: "HEG-OUT-CLEAN", delivery: "HEG-OUT-DELIV",
  freight_driving: "HEG-DRIVE-LONG", outdoor_guide: "HEG-OUT-GUIDE", kitchen: "HEG-INDOOR-HEAT",
  caregiving: "HEG-CARE",
};
const OCC_KO: Record<string, string> = {
  office: "사무직", farming: "농업", fishing: "어업", construction: "건설", cleaning: "환경미화",
  delivery: "배달", freight_driving: "화물운전", outdoor_guide: "실외 가이드", kitchen: "주방", caregiving: "돌봄",
};
const AGE_BANDS = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"] as const;

function renderItems(j: any): string {
  const items: any[] = j.items ?? (j.risk ? [{ risk: j.risk, card: j.card }] : []);
  if (!items.length) return "_지금 조건에서는 특별한 위험이 없습니다 — 평온한 상태예요._";
  return items.map((it: any, i: number) => {
    const r = it.risk, card = it.card;
    const head = `**${i === 0 ? "주위험" : "동반"} · ${SEV_KO[r.severity] ?? r.severity} · ${HARM_KO[r.harm] ?? r.harm}**`;
    const lines = [head];
    if (card?.title) lines.push(`- ${card.title}${card.body ? ` — ${card.body}` : ""}`);
    if (r.drivers?.length) lines.push(`- _근거: ${r.drivers.slice(0, 3).join(" · ")}_`);
    const sh = r.action?.shelter;
    if (sh) lines.push(`- 🏠 최근접 대피: **${sh.name}** (도보 ${sh.walkMin}분) — [지도](${sh.mapLink ?? ""})`);
    return lines.join("\n");
  }).join("\n\n");
}
function impactBlock(oi: any): string {
  if (!oi) return "";
  const s = IMPACT_LV[oi.sectorLevel] ?? "-", g = IMPACT_LV[oi.generalLevel] ?? "-";
  let out = `\n\n> 🏛️ **기상청 공식 영향예보**(내일 기준): ${oi.sectorName} **${s}**`;
  if (oi.generalLevel !== oi.sectorLevel) out += ` · 일반인 ${g}`;
  if (oi.vulnerableLevel != null && oi.vulnerableLevel !== oi.sectorLevel) out += ` · 보건취약 ${IMPACT_LV[oi.vulnerableLevel]}`;
  if (oi.sectorLevel !== oi.generalLevel) out += `\n> ↳ 같은 기상인데 기상청도 **직업 분야마다 등급이 다릅니다**. 이 서비스는 여기서 한 걸음 더 — 지금 이 자리의 당신에게 도달합니다.`;
  return out;
}
function warnLine(j: any): string {
  const active = j.warning?.active ?? [];
  if (!active.length) return "발효 중인 기상특보 없음";
  const KO: Record<string, string> = { heatwave: "폭염", cold_wave: "한파", heavy_rain: "호우", strong_wind: "강풍", high_seas: "풍랑", heavy_snow: "대설", pm: "미세먼지", typhoon: "태풍" };
  const LV: Record<string, string> = { watch: "주의보", warning: "경보", grave: "중대경보" };
  return active.map((a: any) => `${KO[a.hazard] ?? a.hazard}${LV[a.level] ?? ""}`).join(", ");
}

// ── 툴 인터페이스 ────────────────────────────────────────────────────
export interface ToolDef {
  name: string;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean; idempotentHint: boolean };
  description: string;
  inputSchema: ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

const RO = { readOnlyHint: true, destructiveHint: false } as const;

export const TOOLS: ToolDef[] = [
  {
    name: "assess_weather_risk",
    annotations: { title: "Assess Personal Weather Risk Now", ...RO, openWorldHint: true, idempotentHint: false },
    description:
      "Assesses the real-time weather danger at a GPS coordinate in South Korea from a personal-safety point of view. It combines the national weather service's live observation, short-term forecast, official warnings, real-time lightning strikes, marine buoy wave height, flood-prone terrain and the official impact forecast to compute every hazard (heat illness, flood, lightning, strong wind, cold, fine dust, high seas, landslide) and returns the danger level, exactly what to do, and the nearest government shelter. Use for questions like 'is it dangerous here right now?' or 'is it safe to go outside?'. " + SERVICE,
    inputSchema: { lat: z.number().describe("위도 (예: 37.5665)"), lon: z.number().describe("경도 (예: 126.9780)") },
    handler: async (a) => {
      const j = await callBackend(`/api/risk?lat=${Number(a.lat)}&lon=${Number(a.lon)}`);
      // 안전 원칙: 실시간 관측이 지연/미확인이면 "위험 없음"으로 오도하지 말고 명확히 보류 안내
      const noObs = j.sources?.ncst === "unavailable" || !Number.isFinite(j.weather?.feelsLikeC);
      const hasActiveWarn = (j.warning?.active ?? []).length > 0;
      if (noObs && !hasActiveWarn && !(j.items ?? []).length) {
        return guard(
          `## 📍 ${j.location?.adminName ?? `${a.lat}, ${a.lon}`}\n` +
          `🌤️ 실시간 기상 관측이 잠시 지연되고 있어, 지금은 위험도를 확정하지 못했어요. 잠시 후 다시 확인해 주세요.\n\n` +
          `_생명에 위급한 상황이면 지체 없이 119._` +
          chips("다시 확인", "이 근처 대피소 찾기"),
        );
      }
      const md =
        `## 📍 ${j.location?.adminName ?? `${a.lat}, ${a.lon}`}\n` +
        `🌤️ ${j.weatherContext ?? ""}\n\n` +
        `⚠️ **특보**: ${warnLine(j)}\n` +
        ((j.contextNotes ?? []).length ? `🧭 ${j.contextNotes.join(" ")}\n` : "") +
        `\n${renderItems(j)}${impactBlock(j.officialImpact)}\n\n` +
        `_실시간 기상청 데이터 기반. 생명에 위급하면 즉시 119._` +
        chips("이 근처 대피소 찾기", "폭염 때 야외작업이면?", "좌표 위치정보 보기");
      return guard(md);
    },
  },
  {
    name: "simulate_weather_risk",
    annotations: { title: "Simulate Weather Risk by Profile", ...RO, openWorldHint: true, idempotentHint: false },
    description:
      "Simulates the weather risk for a hypothetical weather situation combined with a specific personal profile (occupation, age, location) in South Korea. Unlike a real-time check, it answers what-if questions such as 'what if a 70-year-old farmer is in a 38-degree heatwave?' or 'how risky is a delivery rider during a typhoon?'. It shows how the very same weather produces different danger levels and different recommended actions depending on occupation and age, and cross-references the official sector impact forecast. " + SERVICE,
    inputSchema: {
      occupation: z.enum(Object.keys(OCC_TO_HEG) as [string, ...string[]]).describe("직업: office/farming/fishing/construction/cleaning/delivery/freight_driving/outdoor_guide/kitchen/caregiving"),
      ageBand: z.enum(AGE_BANDS as unknown as [string, ...string[]]).describe("연령대 (예: 70-79)"),
      feelsLikeC: z.number().optional().describe("체감온도(℃) — 폭염/한파 시나리오"),
      rain1hMm: z.number().optional().describe("시간당 강수량(mm) — 호우"),
      windMs: z.number().optional().describe("풍속(m/s) — 강풍"),
      waveM: z.number().optional().describe("유의파고(m) — 풍랑"),
      pm10: z.number().optional().describe("미세먼지 PM10(㎍/㎥)"),
      lightningKm: z.number().optional().describe("최근접 낙뢰 거리(km)"),
      warning: z.enum(["none", "heatwave", "cold_wave", "heavy_rain", "strong_wind", "high_seas", "typhoon", "heavy_snow", "pm"]).optional().describe("발효 특보"),
      chronic: z.enum(["none", "cardio", "respiratory", "diabetes"]).optional().describe("기저질환"),
      lat: z.number().optional().describe("위도(선택, 기본 서울)"),
      lon: z.number().optional().describe("경도(선택)"),
    },
    handler: async (a) => {
      const persona: any = { heg: OCC_TO_HEG[a.occupation as string] ?? "HEG-INDOOR-SAFE", ageBand: a.ageBand, occupationLabel: OCC_KO[a.occupation as string] };
      if (Number.isFinite(Number(a.lat))) persona.lat = Number(a.lat);
      if (Number.isFinite(Number(a.lon))) persona.lon = Number(a.lon);
      if (a.chronic && a.chronic !== "none") persona.chronic = a.chronic;
      const scenario: any = {};
      for (const k of ["feelsLikeC", "rain1hMm", "windMs", "waveM", "pm10", "lightningKm"]) if (Number.isFinite(Number(a[k]))) scenario[k] = Number(a[k]);
      if (scenario.feelsLikeC !== undefined) scenario.hour = 14.5;
      if (a.warning && a.warning !== "none") scenario.warnings = [{ hazard: a.warning, level: "warning" }];
      const j = await callBackend(`/api/simulate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario, persona }) });
      const md =
        `## 🧑 ${a.ageBand} ${OCC_KO[a.occupation as string] ?? a.occupation}${persona.chronic ? ` · ${persona.chronic}` : ""} @ ${j.location?.adminName ?? "서울"}\n` +
        `🌤️ ${j.weatherContext ?? ""}\n` +
        (j.summary ? `\n🧭 ${j.summary}\n` : "") +
        `\n${renderItems(j)}${impactBlock(j.officialImpact)}` +
        chips("같은 상황, 다른 직업으로", "이 근처 대피소 찾기", "지금 실제 위험 보기");
      return guard(md);
    },
  },
  {
    name: "find_nearest_shelter",
    annotations: { title: "Find Nearest Heat/Cold Shelter", ...RO, openWorldHint: true, idempotentHint: true },
    description:
      "Finds the nearest government-registered public shelter to a GPS coordinate in South Korea — heat-relief shelters and cold-wave shelters from the official 60,000+ nationwide registry — with the shelter name, estimated walking time, and a map link. Use when someone needs a cool or warm place to shelter nearby during extreme heat or cold. " + SERVICE,
    inputSchema: {
      lat: z.number().describe("위도"),
      lon: z.number().describe("경도"),
      kind: z.enum(["heat", "cold"]).optional().describe("쉼터 종류(heat=무더위/cold=한파), 기본 heat"),
    },
    handler: async (a) => {
      // 코어 무변경 재사용: 극한 시나리오를 주면 엔진이 최근접 쉼터를 카드에 첨부한다.
      const hot = a.kind === "cold" ? { feelsLikeC: -18, warnings: [{ hazard: "cold_wave", level: "warning" }] } : { feelsLikeC: 40, warnings: [{ hazard: "heatwave", level: "warning" }] };
      const j = await callBackend(`/api/simulate`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: { ...hot, hour: 14.5 }, persona: { heg: "HEG-OUT-CONST", ageBand: "70-79", lat: Number(a.lat), lon: Number(a.lon) } }),
      });
      const items: any[] = j.items ?? [];
      const sh = items.map((it) => it.risk?.action?.shelter).find(Boolean);
      if (!sh) return guard(`## 🏠 근처 쉼터\n${j.location?.adminName ?? ""} 인근 쉼터를 찾지 못했습니다. 좌표를 확인해 주세요.` + chips("좌표 위치정보 보기"));
      const md =
        `## 🏠 가장 가까운 ${a.kind === "cold" ? "한파" : "무더위"} 쉼터\n` +
        `📍 ${j.location?.adminName ?? ""}\n\n` +
        `**${sh.name}** — 도보 약 ${sh.walkMin}분\n` +
        `🗺️ [지도에서 열기](${sh.mapLink ?? ""})\n\n` +
        `_행정안전부 공식 등록 쉼터 6만여 곳 중 최근접. 폭염·한파 시 무료 개방._` +
        chips("지금 이 위치 위험도 보기", "다른 위치로 검색");
      return guard(md);
    },
  },
  {
    name: "official_impact_forecast",
    annotations: { title: "Official Heat/Cold Impact Forecast by Sector", ...RO, openWorldHint: true, idempotentHint: false },
    description:
      "Returns the national weather service's official impact forecast for heat or cold at a GPS coordinate in South Korea, broken down by occupation sector (general public, health-vulnerable, industry, agriculture, livestock, fisheries). It shows how the government itself rates the same weather at different danger levels for different sectors — e.g. 'agriculture: warning, general public: caution' — which is the basis for personalized safety. Available during active heat/cold advisory periods. " + SERVICE,
    inputSchema: {
      lat: z.number().describe("위도"),
      lon: z.number().describe("경도"),
      sector: z.enum(Object.keys(OCC_TO_HEG) as [string, ...string[]]).optional().describe("관심 직업 분야(기본 farming)"),
      hazard: z.enum(["heat", "cold"]).optional().describe("폭염(heat)/한파(cold), 기본 heat"),
    },
    handler: async (a) => {
      const heg = OCC_TO_HEG[(a.sector as string) ?? "farming"] ?? "HEG-OUT-AGRI";
      const sc = a.hazard === "cold" ? { feelsLikeC: -12, warnings: [{ hazard: "cold_wave", level: "warning" }] } : { feelsLikeC: 35, warnings: [{ hazard: "heatwave", level: "warning" }] };
      const j = await callBackend(`/api/simulate`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: { ...sc, hour: 14.5 }, persona: { heg, ageBand: "60-69", lat: Number(a.lat), lon: Number(a.lon) } }),
      });
      const oi = j.officialImpact;
      if (!oi) return guard(`## 🏛️ 기상청 공식 영향예보\n📍 ${j.location?.adminName ?? ""}\n\n현재 이 지역에 발효 중인 ${a.hazard === "cold" ? "한파" : "폭염"} 영향예보가 없습니다(비시즌이거나 영향없음 단계).` + chips("지금 이 위치 위험도 보기"));
      // 관심 직업이 '보건(일반인)' 자체면 일반인 라인과 중복 → 한 줄로. 그 외 직업이면 대비용으로 일반인 라인 병기.
      const isGeneralSector = oi.sectorName.includes("일반인");
      const md =
        `## 🏛️ 기상청 공식 영향예보 — ${j.location?.adminName ?? ""}\n` +
        `(${a.hazard === "cold" ? "한파" : "폭염"}, 내일 기준)\n\n` +
        `- **${oi.sectorName}**: ${IMPACT_LV[oi.sectorLevel]}\n` +
        (isGeneralSector ? "" : `- 일반인(보건): ${IMPACT_LV[oi.generalLevel]}\n`) +
        (oi.vulnerableLevel != null && !isGeneralSector ? `- 보건 취약인: ${IMPACT_LV[oi.vulnerableLevel]}\n` : "") +
        `\n${oi.sectorLevel !== oi.generalLevel ? "> 같은 기상인데 기상청도 **직업 분야마다 등급이 다릅니다**. WeatherSafetyOS는 이 구역 등급을 넘어 ‘지금 그 자리의 당신’에게 도달합니다." : ""}` +
        chips("이 직업의 개인 위험 시뮬레이션", "지금 실제 위험 보기");
      return guard(md);
    },
  },
  {
    name: "resolve_location",
    annotations: { title: "Resolve Korean Weather Location Codes", ...RO, openWorldHint: false, idempotentHint: true },
    description:
      "Converts a GPS coordinate into South Korea's four weather-service location identifier systems (village-forecast grid, warning zone, forecast zone, and nearest automatic weather station) plus the administrative district name. Useful to see which warning zone a coordinate belongs to or which observation station is closest. " + SERVICE,
    inputSchema: { lat: z.number().describe("위도"), lon: z.number().describe("경도") },
    handler: async (a) => {
      const j = await callBackend(`/api/resolve?lat=${Number(a.lat)}&lon=${Number(a.lon)}`);
      const md =
        `## 📍 ${j.adminName ?? ""}\n` +
        `- 동네예보 격자: (${j.grid?.nx}, ${j.grid?.ny})\n` +
        `- 특보구역 코드: ${j.warnZone}\n` +
        `- 예보구역 코드: ${j.fcstZone}\n` +
        `- 최근접 AWS 관측지점: ${j.awsStationId}\n` +
        `- 생활기상 areaNo: ${j.areaNo}` +
        chips("지금 이 위치 위험도 보기", "이 근처 대피소 찾기");
      return guard(md);
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
