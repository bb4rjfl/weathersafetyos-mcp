// Cloudflare Workers 호스팅 MCP (Streamable HTTP, stateless) — 즉시 공개 엔드포인트용.
// KC(Docker) 배포와 별개의 "지금 바로 등록·테스트" 경로. 같은 TOOLS(tools.ts)를 공유한다.
// PlayMCP는 공개 URL이면 등록/정보 불러오기가 되므로, KC 발급 전에도 이 URL로 테스트 가능.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOLS, setBackendFetch } from "./tools.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";

// 코어 워커 서비스 바인딩(같은 계정 워커 직접 호출 — workers.dev 라우팅 문제 회피)
interface Env { CORE?: { fetch(req: Request): Promise<Response> }; WSOS_BACKEND?: string }
let backendWired = false;
function wireBackend(env: Env): void {
  if (backendWired || !env.CORE) return;
  backendWired = true;
  // 서비스 바인딩은 호스트 무시(바인딩된 워커로 라우팅) — path만 유효하면 됨
  setBackendFetch((path, init) => env.CORE!.fetch(new Request(`https://core${path}`, init)));
}

const PROTOCOL_VERSION = "2025-06-18";
const INSTRUCTIONS =
  "WeatherSafetyOS는 위치·직업·연령 기반 개인 기상안전 도우미입니다. 기상청 실시간 데이터로 '지금 당신에게' 위험한지와 무엇을 해야 하는지를 알려줍니다. 생명에 위급한 상황은 반드시 119로 안내하세요.";

// 툴 목록(JSON Schema로 변환) — 기동 시 1회 계산
const TOOL_LIST = TOOLS.map((t) => {
  const schema = zodToJsonSchema(z.object(t.inputSchema), { $refStrategy: "none" }) as Record<string, unknown>;
  delete (schema as any).$schema;
  return { name: t.name, description: t.description, inputSchema: schema, annotations: t.annotations };
});

const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleRpc(msg: any): Promise<any | null> {
  const { id, method, params } = msg ?? {};
  switch (method) {
    case "initialize":
      return ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, instructions: INSTRUCTIONS });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOL_LIST });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return err(id, -32602, `unknown tool: ${params?.name}`);
      // 서버측 입력 검증(방어) — 필수 누락·enum 위반을 렌더 전에 차단(P5/P6). 클라이언트가 이미 스키마 검증하지만 이중 방어.
      const parsed = z.object(tool.inputSchema).safeParse(params?.arguments ?? {});
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        return ok(id, { content: [{ type: "text", text: `⚠️ 입력값을 확인해 주세요 — ${msg}` }], isError: true });
      }
      try {
        const text = await tool.handler(parsed.data as Record<string, unknown>);
        return ok(id, { content: [{ type: "text", text }] });
      } catch (e) {
        const msgTxt = e instanceof Error && e.name === "AbortError" ? "요청이 지연되어 응답하지 못했어요. 잠시 후 다시 시도해 주세요." : `일시적 오류: ${e instanceof Error ? e.message : String(e)}`;
        return ok(id, { content: [{ type: "text", text: `⚠️ ${msgTxt}` }], isError: true });
      }
    }
    default:
      return err(id, -32601, `method not found: ${method}`);
  }
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    wireBackend(env);
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/health" || (url.pathname === "/" && req.method === "GET")) {
      return Response.json({ name: SERVER_NAME, version: SERVER_VERSION, status: "ok", tools: TOOLS.map((t) => t.name), mcp: "/mcp" }, { headers: CORS });
    }
    if (url.pathname === "/mcp") {
      if (req.method === "GET") return new Response("Method Not Allowed (stateless — use POST /mcp).", { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
      if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });
      let body: any;
      try { body = await req.json(); } catch { return Response.json(err(null, -32700, "Parse error"), { status: 400, headers: CORS }); }
      const H = { "mcp-protocol-version": PROTOCOL_VERSION, ...CORS };
      if (Array.isArray(body)) {
        const out = (await Promise.all(body.map(handleRpc))).filter((r) => r !== null);
        return out.length ? Response.json(out, { headers: H }) : new Response(null, { status: 202, headers: CORS });
      }
      const result = await handleRpc(body);
      return result === null ? new Response(null, { status: 202, headers: CORS }) : Response.json(result, { headers: H });
    }
    return new Response("Not Found", { status: 404, headers: CORS });
  },
};
