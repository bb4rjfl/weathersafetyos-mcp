// WeatherSafetyOS MCP — Streamable HTTP(stateless) 서버. PlayMCP in KC 배포 대상.
// 패턴: Express 5 + @modelcontextprotocol/sdk McpServer + StreamableHTTPServerTransport (요청당 새 서버, no session).
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SERVER_NAME, SERVER_VERSION, BACKEND_URL } from "./constants.js";
import { assertNamingOk } from "./naming.js";
import { TOOLS, TOOL_NAMES } from "./tools.js";

// 기동 시 네이밍 규칙 위반이면 트래픽을 받지 않는다(반려 방지).
assertNamingOk(SERVER_NAME, TOOL_NAMES);

function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations },
      async (args: Record<string, unknown>) => {
        const start = Date.now();
        try {
          const text = await tool.handler(args);
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          const msg = err instanceof Error && err.name === "AbortError"
            ? "요청이 지연되어 응답하지 못했어요. 잠시 후 다시 시도해 주세요."
            : `일시적인 오류가 발생했어요: ${err instanceof Error ? err.message : String(err)}`;
          return { content: [{ type: "text" as const, text: `⚠️ ${msg}\n\n다음으로 › \`다시 시도\`` }], isError: true };
        } finally {
          console.log(`[tool] ${tool.name} ${Date.now() - start}ms`);
        }
      },
    );
  }
  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: SERVER_NAME, version: SERVER_VERSION, status: "ok",
    tools: TOOL_NAMES.length, backend: BACKEND_URL,
    description: "위치·직업·연령 기반 개인 기상안전 MCP (WeatherSafetyOS)",
  });
});

// Streamable HTTP, stateless: 요청마다 새 server+transport, 세션 없음.
app.post("/mcp", async (req: Request, res: Response) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});

const methodNotAllowed = (_req: Request, res: Response) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)." }, id: null });
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  res.status(400).json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error: invalid JSON body." }, id: null });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`${SERVER_NAME} v${SERVER_VERSION} — Streamable HTTP (stateless) on :${port}`);
  console.log(`Tools (${TOOL_NAMES.length}): ${TOOL_NAMES.join(", ")}`);
});
