import crypto from "crypto";

const hashPair = (name: string, seed: number) =>
  parseInt(crypto.createHash("sha256").update(`${name}:${seed}`).digest("hex").slice(0, 8), 16);

export const buildOrderedHeaderTuples = (
  headers: Record<string, string>,
  seed: number
): Array<[string, string]> => {
  return Object.entries(headers).sort((a, b) => hashPair(a[0], seed) - hashPair(b[0], seed));
};

