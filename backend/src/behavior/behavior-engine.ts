import crypto from "crypto";
import { buildBehaviorProfile } from "./behavior-profile.js";

export type BehaviorDecision =
  | { type: "send" }
  | { type: "pause"; delayMs: number };

const roll = (sessionId: string, salt: string): number => {
  const hex = crypto.createHash("sha256").update(`${sessionId}:${salt}`).digest("hex").slice(0, 8);
  return parseInt(hex, 16) / 0xffffffff;
};

export const decideBehavior = (sessionId: string, now: Date = new Date()): BehaviorDecision => {
  const safeSessionId = String(sessionId || "unknown-session");
  const profile = buildBehaviorProfile(safeSessionId);
  const hour = now.getHours();

  if (hour < profile.activeHours[0] || hour > profile.activeHours[1]) {
    return { type: "pause", delayMs: 60 * 60 * 1000 };
  }

  const minuteBucket = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
  const chance = roll(safeSessionId, minuteBucket);

  if (profile.activityTier === "silent" && chance < 0.85) {
    return { type: "pause", delayMs: profile.cooldownMs };
  }
  if (profile.activityTier === "occasional" && chance < 0.45) {
    return { type: "pause", delayMs: profile.baseIntervalMs + profile.cooldownMs };
  }
  if (profile.activityTier === "active" && chance < 0.1) {
    return { type: "pause", delayMs: profile.baseIntervalMs };
  }

  return { type: "send" };
};

