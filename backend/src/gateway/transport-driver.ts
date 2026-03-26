import crypto from "crypto";
import { Readable } from "stream";
import { GatewayPacket } from "./contracts.js";
import { GatewayErrorCode, isRetryableStatus } from "./error-codes.js";
import { GatewayError } from "./errors.js";
import { deriveFingerprint } from "./device-fingerprint-store.js";
import { buildOrderedHeaderTuples } from "./header-order.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GATEWAY_TIMEOUT_JITTER_RATIO = Math.min(0.35, Math.max(0, Number(process.env.GATEWAY_TIMEOUT_JITTER_RATIO || 0.12)));
const GATEWAY_REQUEST_LOG_ENABLED = process.env.GATEWAY_REQUEST_LOG_ENABLED !== "false";
const GATEWAY_FINGERPRINT_LOG_SAMPLE_PERCENT = Math.max(
  0,
  Math.min(100, Number(process.env.GATEWAY_FINGERPRINT_LOG_SAMPLE_PERCENT || 2))
);

const buildTraceId = () => `gw-${crypto.randomUUID()}`;

const hashToInt = (input: string): number => {
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  return parseInt(hex.slice(0, 8), 16);
};

const toHeadersObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
};

const withJitter = (value: number, ratio: number): number => {
  if (value <= 0 || ratio <= 0) return Math.max(0, Math.round(value));
  const factor = 1 - ratio + Math.random() * ratio * 2;
  return Math.max(0, Math.round(value * factor));
};

const computeAttemptTimeoutMs = (baseTimeoutMs: number, attempt: number): number => {
  const scaled = baseTimeoutMs + attempt * 1500;
  return withJitter(Math.min(90000, Math.max(1000, scaled)), GATEWAY_TIMEOUT_JITTER_RATIO);
};

const computeRetryDelayMs = (attempt: number, seed: number): number => {
  // Human-like retries: 1st retry in 2-5s, 2nd retry in 10-30s, then stop.
  const jitter = (seed % 1000) / 1000;
  if (attempt <= 0) return Math.round(2000 + 3000 * jitter);
  return Math.round(10000 + 20000 * jitter);
};

const buildStableHeaders = (
  baseHeaders: Record<string, string>,
  sessionId: string,
  platform: "iOS" | "Android"
): {
  headers: Record<string, string>;
  headerOrderSeed: number;
  retryJitterSeed: number;
  tlsProfile: "cfnetwork" | "okhttp";
  h2Settings: { weight: number; windowSize: number };
} => {
  const fp = deriveFingerprint(sessionId, platform);
  return {
    headers: {
      ...baseHeaders,
      // Internal only. Do not forward to upstream.
      __h2_weight: String(fp.h2Settings.weight),
      __h2_window: String(fp.h2Settings.windowSize),
    },
    headerOrderSeed: fp.headerOrderSeed,
    retryJitterSeed: fp.retryJitterSeed,
    tlsProfile: fp.tlsProfile,
    h2Settings: fp.h2Settings,
  };
};

const shouldSampleFingerprintLog = (sessionId: string): boolean => {
  if (GATEWAY_FINGERPRINT_LOG_SAMPLE_PERCENT <= 0) return false;
  const score = hashToInt(`fp-log:${String(sessionId || "unknown-session")}`) % 100;
  return score < GATEWAY_FINGERPRINT_LOG_SAMPLE_PERCENT;
};

const logGatewayRequest = (payload: {
  sessionId: string;
  traceId: string;
  latency: number;
  status: number;
  retryCount: number;
}) => {
  if (!GATEWAY_REQUEST_LOG_ENABLED) return;
  console.log("[gateway:request]", JSON.stringify(payload));
};

const shouldStripOutboundHeader = (name: string): boolean => {
  const k = String(name || "").trim().toLowerCase();
  if (!k) return true;
  if (k.startsWith("x-gw-")) return true;
  if (k.startsWith("x-h2-")) return true;
  if (k.startsWith("x-ja")) return true;
  if (k === "x-device-fingerprint-policy") return true;
  if (k === "x-session-px") return true;
  if (k === "x-hardware-fingerprint") return true;
  if (k === "x-stream-attempt") return true;
  if (k === "x-dispatch-attempt") return true;
  if (k === "x-tls-client-profile") return true;
  if (k === "x-egress-profile-applied") return true;
  if (k === "x-idempotency-key") return true;
  if (k === "x-request-id") return true;
  return false;
};

const sanitizeOutboundHeaders = (headers: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  Object.entries(headers).forEach(([k, v]) => {
    if (!shouldStripOutboundHeader(k)) {
      out[k] = v;
    }
  });
  return out;
};

const isReadableBody = (body: GatewayPacket["body"]): body is NodeJS.ReadableStream => {
  return body instanceof Readable;
};

const readStreamIntoBuffer = (stream: NodeJS.ReadableStream): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

const createBodyFactory = async (body: GatewayPacket["body"]): Promise<(() => any) | undefined> => {
  if (body == null) return undefined;
  if (typeof body === "string" || Buffer.isBuffer(body)) return () => body;
  if (isReadableBody(body)) {
    const buffered = await readStreamIntoBuffer(body);
    return () => buffered;
  }
  return () => body as any;
};

type EgressProfileApplier = (args: { profile: string; url: string; headers: Record<string, string> }) => Promise<void> | void;
export const setEgressProfileApplier = (_fn: EgressProfileApplier | null) => {
  // kept for backward compatibility; transport no longer consumes egress profile headers
};

export const sendViaTransportDriver = async (input: {
  packet: GatewayPacket;
  timeoutMs: number;
  maxRetries: number;
}) => {
  const traceId = buildTraceId();
  let attempt = 0;
  let lastError: unknown = null;
  const bodyFactory = await createBodyFactory(input.packet.body);
  const stable = buildStableHeaders(
    input.packet.headers,
    input.packet.metadata.sessionId,
    input.packet.metadata.platform
  );
  if (shouldSampleFingerprintLog(input.packet.metadata.sessionId)) {
    console.log(
      "[gateway:fingerprint]",
      JSON.stringify({
        sessionId: input.packet.metadata.sessionId,
        tlsProfile: stable.tlsProfile,
        h2: stable.h2Settings,
        headerSeed: stable.headerOrderSeed,
      })
    );
  }
  const maxRetries = Math.max(0, Math.min(Number(input.maxRetries || 0), 2));

  while (attempt <= maxRetries) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const attemptTimeoutMs = computeAttemptTimeoutMs(input.timeoutMs, attempt);
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);
    try {
      const wireHeaders = { ...stable.headers };
      delete wireHeaders.__h2_weight;
      delete wireHeaders.__h2_window;
      const cleanWireHeaders = sanitizeOutboundHeaders({
        ...wireHeaders,
        "x-trace-id": traceId,
      });
      const orderedHeaders = buildOrderedHeaderTuples(cleanWireHeaders, stable.headerOrderSeed);
      const res = await fetch(
        input.packet.url,
        {
          method: input.packet.method,
          headers: orderedHeaders,
          body: bodyFactory ? (bodyFactory() as any) : undefined,
          signal: controller.signal,
        } as any // cast to avoid TS complaining about non‑standard fields
      );
      clearTimeout(timer);
      const responseBody = await res.text();
      const latencyMs = Date.now() - startedAt;
      logGatewayRequest({
        sessionId: input.packet.metadata.sessionId,
        traceId,
        latency: latencyMs,
        status: res.status,
        retryCount: attempt,
      });
      return {
        traceId,
        status: res.status,
        ok: res.ok,
        retryable: isRetryableStatus(res.status),
        responseHeaders: toHeadersObject(res.headers),
        responseBody,
        latencyMs,
      };
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      const isTimeout = String(err?.name || "").includes("Abort");
      const canRetry = attempt < maxRetries;

      if (!canRetry) {
        logGatewayRequest({
          sessionId: input.packet.metadata.sessionId,
          traceId,
          latency: Date.now() - startedAt,
          status: isTimeout ? 504 : 503,
          retryCount: attempt,
        });
        throw new GatewayError({
          message: isTimeout ? "transport timeout" : `transport network error: ${err?.message || err}`,
          code: isTimeout ? GatewayErrorCode.TRANSPORT_TIMEOUT : GatewayErrorCode.TRANSPORT_NETWORK_ERROR,
          status: isTimeout ? 504 : 503,
          retryable: true,
          details: { traceId, attempt },
        });
      }

      await sleep(computeRetryDelayMs(attempt, stable.retryJitterSeed));
      attempt += 1;
    }
  }

  throw new GatewayError({
    message: `transport failed: ${String((lastError as any)?.message || lastError || "unknown")}`,
    code: GatewayErrorCode.TRANSPORT_NETWORK_ERROR,
    status: 503,
    retryable: true,
  });
};
