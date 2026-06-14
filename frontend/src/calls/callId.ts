// Deterministic, order-independent call id for a 1:1 pair.
//
// Stream call ids must be <= 64 chars and match [A-Za-z0-9_-]. Our user ids are
// UUIDs (36 chars each), so two of them joined would overflow that limit — we
// hash the sorted pair instead. Because it's a pure function of the two ids,
// caller and callee compute the same id with no extra signaling.

function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function makeCallId(a: string, b: string): string {
  const seed = [a, b].sort().join("__");
  return "swag_" + cyrb53(seed).toString(36);
}
