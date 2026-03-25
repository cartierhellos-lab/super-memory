import crypto from "crypto";
import { GatewayPlatform } from "./contracts.js";

export type DeviceFingerprint = {
  tlsProfile: "cfnetwork" | "okhttp";
  h2Settings: {
    weight: number;
    windowSize: number;
  };
  headerOrderSeed: number;
};

const store = new Map<string, DeviceFingerprint>();

const hashToInt = (input: string): number => {
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  return parseInt(hex.slice(0, 8), 16);
};

export const getOrCreateFingerprint = (
  sessionId: string,
  platform: GatewayPlatform
): DeviceFingerprint => {
  const safeSessionId = String(sessionId || "").trim();
  if (store.has(safeSessionId)) {
    return store.get(safeSessionId)!;
  }

  const seed = hashToInt(safeSessionId || `${platform}-unknown-session`);
  const fingerprint: DeviceFingerprint = {
    tlsProfile: platform === "iOS" ? "cfnetwork" : "okhttp",
    h2Settings: {
      weight: 32 + (seed % 180),
      windowSize: 65535 + (seed % 65535),
    },
    headerOrderSeed: seed,
  };

  store.set(safeSessionId, fingerprint);
  return fingerprint;
};

