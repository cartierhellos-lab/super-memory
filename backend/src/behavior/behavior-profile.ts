import crypto from "crypto";

const hashToInt = (input: string): number => {
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  return parseInt(hex.slice(0, 8), 16);
};

export type ActivityTier = "active" | "occasional" | "silent";

export type BehaviorProfile = {
  activeHours: [number, number];
  baseIntervalMs: number;
  burstSize: number;
  cooldownMs: number;
  activityTier: ActivityTier;
};

export const buildBehaviorProfile = (sessionId: string): BehaviorProfile => {
  const safeSessionId = String(sessionId || "unknown-session");
  const seed = hashToInt(safeSessionId);
  const percentile = seed % 100;

  let activityTier: ActivityTier = "occasional";
  if (percentile < 20) activityTier = "active";
  else if (percentile >= 70) activityTier = "silent";

  return {
    activeHours: [8 + (seed % 4), 20 + (seed % 3)],
    baseIntervalMs: 1200 + (seed % 2301), // 1.2s - 3.5s
    burstSize: 2 + (seed % 4), // 2 - 5
    cooldownMs: 5000 + (seed % 15001), // 5s - 20s
    activityTier,
  };
};

