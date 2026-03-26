import { decideBehavior } from "../behavior/behavior-engine.js";
import { buildBehaviorProfile } from "../behavior/behavior-profile.js";
import { deriveFingerprint } from "../gateway/device-fingerprint-store.js";
import { buildOrderedHeaderTuples } from "../gateway/header-order.js";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

(() => {
  const sessionId = "session-deploy-check-001";
  const fpA = deriveFingerprint(sessionId, "iOS");
  const fpB = deriveFingerprint(sessionId, "iOS");
  assert(JSON.stringify(fpA) === JSON.stringify(fpB), "fingerprint must be deterministic for same session");

  const fpAndroid = deriveFingerprint(sessionId, "Android");
  assert(fpA.tlsProfile !== fpAndroid.tlsProfile, "platform tls profile mapping should stay stable and different");
})();

(() => {
  const headers = {
    authorization: "Bearer token",
    "content-type": "application/json",
    "x-trace-id": "trace-1",
    accept: "application/json",
  };
  const first = buildOrderedHeaderTuples(headers, 12345);
  const second = buildOrderedHeaderTuples(headers, 12345);
  assert(JSON.stringify(first) === JSON.stringify(second), "header order must be stable for same seed");

  const third = buildOrderedHeaderTuples(headers, 54321);
  assert(JSON.stringify(first) !== JSON.stringify(third), "header order should vary across different seeds");
})();

(() => {
  const sessionId = "session-behavior-001";
  const outsideActive = new Date(2026, 2, 26, 3, 0, 0, 0);
  const d1 = decideBehavior(sessionId, outsideActive);
  assert(d1.type === "pause", "outside active hours should pause");

  const sameMinuteA = decideBehavior(sessionId, new Date(2026, 2, 26, 12, 34, 5, 0));
  const sameMinuteB = decideBehavior(sessionId, new Date(2026, 2, 26, 12, 34, 50, 0));
  assert(JSON.stringify(sameMinuteA) === JSON.stringify(sameMinuteB), "decision should be deterministic in same time bucket");
})();

(() => {
  const counts = { active: 0, occasional: 0, silent: 0 };
  for (let i = 0; i < 200; i += 1) {
    const profile = buildBehaviorProfile(`session-${i}`);
    counts[profile.activityTier] += 1;
  }
  assert(counts.active > 0, "activity tier should include active group");
  assert(counts.occasional > 0, "activity tier should include occasional group");
  assert(counts.silent > 0, "activity tier should include silent group");
})();

console.log("deploy-strategy-check passed");
