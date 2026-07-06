// stdio MCP 서버 — 로컬/Claude Desktop 등에서 즉시 사용·테스트(공유 TOOLS, registerTool 규격 동일).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { assertNamingOk } from "./naming.js";
import { TOOLS, TOOL_NAMES } from "./tools.js";

assertNamingOk(SERVER_NAME, TOOL_NAMES);
const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations },
    async (args: Record<string, unknown>) => {
      try {
        return { content: [{ type: "text" as const, text: await tool.handler(args) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );
}
await server.connect(new StdioServerTransport());
console.error(`WeatherSafetyOS MCP (stdio) — 툴 ${TOOL_NAMES.length}: ${TOOL_NAMES.join(", ")}`);
