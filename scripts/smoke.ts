// 로컬 스모크 — 5개 툴 핸들러를 라이브 코어 Worker로 실호출하고 Markdown 출력·지연을 확인.
// 실행: npm run smoke
import { TOOLS } from "../src/tools.js";

const cases: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: "assess_weather_risk", args: { lat: 37.4784, lon: 126.9516 } },
  { name: "simulate_weather_risk", args: { occupation: "farming", ageBand: "70-79", feelsLikeC: 38, warning: "heatwave", lat: 36.5684, lon: 128.7294 } },
  { name: "find_nearest_shelter", args: { lat: 37.4784, lon: 126.9516, kind: "heat" } },
  { name: "official_impact_forecast", args: { lat: 36.5684, lon: 128.7294, sector: "farming", hazard: "heat" } },
  { name: "resolve_location", args: { lat: 37.4784, lon: 126.9516 } },
];

let ok = 0;
for (const c of cases) {
  const tool = TOOLS.find((t) => t.name === c.name)!;
  const t0 = Date.now();
  try {
    const out = await tool.handler(c.args);
    const ms = Date.now() - t0;
    console.log(`\n===== ${c.name} (${ms}ms) =====`);
    console.log(out);
    if (out.length > 23000) console.log("⚠️ 24k 초과!");
    ok++;
  } catch (e) {
    console.log(`\n❌ ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`\n${ok}/${cases.length} 툴 통과`);
