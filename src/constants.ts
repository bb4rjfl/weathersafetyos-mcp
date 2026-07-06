// 서버 상수. 서버명·툴명에 'kakao' 금지(규칙 01 §3-1) — 네이밍 린트가 강제.
// process는 Node(Express/stdio)엔 있고 Cloudflare Worker엔 없다 → 안전 접근.
const envGet = (k: string): string | undefined => (typeof process !== "undefined" ? process.env?.[k] : undefined);
export const SERVER_NAME = "weathersafetyos";
export const SERVER_VERSION = "0.1.0";
// 코어 엔진(배포된 sentinel-demo Worker) 주소. 이 MCP는 공개 API만 호출(키 미보유).
export const BACKEND_URL = envGet("WSOS_BACKEND") ?? "https://weathersafetyos.oneul-suncare.workers.dev";
// 외부 호출 타임아웃. CF 서비스바인딩 경로는 <2s지만, KC→CF 크로스클라우드 홉이 붙는 KC 배포에선
// 근소차(2.95s)로 끊기면 '에러'가 나므로 홉 여유를 둔다(3.4s). 실제 답 반환이 근소차 에러보다 낫다.
// 대부분 툴은 캐시·바운드로 <2.5s. env(WSOS_TIMEOUT_MS)로 배포별 조정 가능.
export const FETCH_TIMEOUT_MS = Number(envGet("WSOS_TIMEOUT_MS") ?? 4500);
export const MAX_RESPONSE_CHARS = 23000; // 24k 가드(규칙 01 §3-3)
