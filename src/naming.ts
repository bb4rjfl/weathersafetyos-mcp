// 네이밍 규칙 강제(카카오 규칙 01 §3-1): 서버명·툴명에 'kakao'(대소문자 불문) 금지, 문자셋·중복·개수.
const TOOL_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function assertNamingOk(serverName: string, toolNames: string[]): void {
  const bad = (s: string) => /kakao/i.test(s);
  if (bad(serverName)) throw new Error(`서버명에 'kakao' 금지: ${serverName}`);
  if (toolNames.length < 1 || toolNames.length > 20) throw new Error(`툴 개수 1~20 위반: ${toolNames.length}`);
  const seen = new Set<string>();
  for (const n of toolNames) {
    if (bad(n)) throw new Error(`툴명에 'kakao' 금지: ${n}`);
    if (!TOOL_RE.test(n)) throw new Error(`툴명 문자셋 위반(A-Za-z0-9_-, 1~128): ${n}`);
    if (seen.has(n)) throw new Error(`툴명 중복: ${n}`);
    seen.add(n);
  }
}
