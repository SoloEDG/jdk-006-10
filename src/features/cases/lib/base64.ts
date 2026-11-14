const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));
export function decodeBase64(input: string, label = "声音数据"): Uint8Array {
  const clean = input.replace(/\s+/g, "");
  if (!clean.length) throw new Error(`${label}为空`);
  if (clean.length % 4 !== 0) throw new Error(`${label}的 base64 编码无效`);
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const length = (clean.length / 4) * 3 - padding;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const group = clean
      .slice(i, i + 4)
      .split("")
      .map((c, j) => {
        if (c === "=" && i + 4 >= clean.length && j >= 4 - padding) return 0;
        const value = LOOKUP.get(c);
        if (value === undefined) throw new Error(`${label}的 base64 编码无效`);
        return value;
      });
    const triple = (group[0] << 18) | (group[1] << 12) | (group[2] << 6) | group[3];
    if (offset < length) bytes[offset++] = (triple >> 16) & 0xff;
    if (offset < length) bytes[offset++] = (triple >> 8) & 0xff;
    if (offset < length) bytes[offset++] = triple & 0xff;
  }
  return bytes;
}
export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i],
      b = i + 1 < bytes.length ? bytes[i + 1] : 0,
      c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += ALPHABET[(triple >> 18) & 63] + ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? ALPHABET[triple & 63] : "=";
  }
  return out;
}
