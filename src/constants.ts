// 서버 상수. 서버명·툴명에 'kakao' 금지(규칙 01 §3-1) — 네이밍 린트가 강제.
export const SERVER_NAME = "weathersafetyos";
export const SERVER_VERSION = "0.1.0";
// 코어 엔진(배포된 sentinel-demo Worker) 주소. 이 MCP는 공개 API만 호출(키 미보유).
export const BACKEND_URL = process.env.WSOS_BACKEND ?? "https://weathersafetyos.oneul-suncare.workers.dev";
// 외부 호출 타임아웃 — PlayMCP p99 3s 규칙 사수(규칙 01 §3-5).
export const FETCH_TIMEOUT_MS = Number(process.env.WSOS_TIMEOUT_MS ?? 2800);
export const MAX_RESPONSE_CHARS = 23000; // 24k 가드(규칙 01 §3-3)
