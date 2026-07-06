// 실제 MCP 프로토콜 검증 — 로컬 기동 서버에 SDK 클라이언트로 붙어 initialize·tools/list·tools/call.
// 사용: (터미널1) npm start  →  (터미널2) tsx scripts/client-smoke.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL ?? "http://127.0.0.1:8080/mcp");
const client = new Client({ name: "smoke-client", version: "0.0.1" });
await client.connect(new StreamableHTTPClientTransport(url));

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
console.log("annotations 샘플:", JSON.stringify(tools.tools[0]?.annotations));

const r = await client.callTool({ name: "resolve_location", arguments: { lat: 37.4784, lon: 126.9516 } });
console.log("\nresolve_location →\n" + (r.content as any[])[0].text);

const s = await client.callTool({ name: "simulate_weather_risk", arguments: { occupation: "farming", ageBand: "70-79", feelsLikeC: 38, warning: "heatwave", lat: 36.5684, lon: 128.7294 } });
console.log("\nsimulate_weather_risk →\n" + (s.content as any[])[0].text);

await client.close();
console.log("\n✅ MCP 프로토콜 검증 통과 (StreamableHTTP · initialize · tools/list · tools/call)");
