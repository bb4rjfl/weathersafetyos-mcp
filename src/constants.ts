// 서버 상수. 서버명·툴명에 'kakao' 금지(규칙 01 §3-1) — 네이밍 린트가 강제.
// process는 Node(Express/stdio)엔 있고 Cloudflare Worker엔 없다 → 안전 접근.
const envGet = (k: string): string | undefined => (typeof process !== "undefined" ? process.env?.[k] : undefined);
export const SERVER_NAME = "weathersafetyos";
export const SERVER_VERSION = "0.1.0";
// 코어 엔진(배포된 sentinel-demo Worker) 주소. 이 MCP는 공개 API만 호출(키 미보유).
export const BACKEND_URL = envGet("WSOS_BACKEND") ?? "https://weathersafetyos.oneul-suncare.workers.dev";
// 외부 호출 타임아웃 — PlayMCP p99 3s 규칙 사수(규칙 01 §3-5). 백엔드 콜드 상한(~2.6s)에 맞춰 2.95s(3s 미만).
export const FETCH_TIMEOUT_MS = Number(envGet("WSOS_TIMEOUT_MS") ?? 2950);
export const MAX_RESPONSE_CHARS = 23000; // 24k 가드(규칙 01 §3-3)
