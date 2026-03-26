import crypto from "crypto";
import { GatewayPlatform } from "./contracts.js";

export type DeviceFingerprint = {
  seed: number;
  tlsProfile: "cfnetwork" | "okhttp";
  h2Settings: {
    weight: number;
    windowSize: number;
  };
  headerOrderSeed: number;
  retryJitterSeed: number;
};

const hashToInt = (input: string): number => {
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  return parseInt(hex.slice(0, 8), 16);
};

export const deriveFingerprint = (
  sessionId: string,
  platform: GatewayPlatform
): DeviceFingerprint => {
  const safeSessionId = String(sessionId || "").trim();
  const seed = hashToInt(safeSessionId || `${platform}-unknown-session`);
  return {
    seed,
    tlsProfile: platform === "iOS" ? "cfnetwork" : "okhttp",
    h2Settings: {
      weight: 32 + (seed % 180),
      windowSize: 65535 + (seed % 65535),
    },
    headerOrderSeed: seed,
    retryJitterSeed: seed % 1000,
  };
};

export const getOrCreateFingerprint = deriveFingerprint;
