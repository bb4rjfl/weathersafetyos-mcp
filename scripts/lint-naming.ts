// 빌드 전 네이밍 린트 — 'kakao' 등 규칙 위반 시 빌드 실패(카카오 규칙 01 §3-1).
import { SERVER_NAME } from "../src/constants.js";
import { TOOL_NAMES } from "../src/tools.js";
import { assertNamingOk } from "../src/naming.js";
try {
  assertNamingOk(SERVER_NAME, TOOL_NAMES);
  console.log(`✅ 네이밍 OK — server:${SERVER_NAME}, tools:${TOOL_NAMES.length} (${TOOL_NAMES.join(", ")})`);
} catch (e) {
  console.error(`❌ 네이밍 린트 실패: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
