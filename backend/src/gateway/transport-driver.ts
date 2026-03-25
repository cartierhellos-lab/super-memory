import crypto from "crypto";
import { GatewayPacket } from "./contracts.js";
import { GatewayErrorCode, isRetryableStatus } from "./error-codes.js";
import { GatewayError } from "./errors.js";
import { getOrCreateFingerprint } from "./device-fingerprint-store.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GATEWAY_RETRY_BASE_MS = Math.max(50, Number(process.env.GATEWAY_RETRY_BASE_MS || 200));
const GATEWAY_RETRY_MAX_MS = Math.max(GATEWAY_RETRY_BASE_MS, Number(process.env.GATEWAY_RETRY_MAX_MS || 3000));
const GATEWAY_TIMEOUT_JITTER_RATIO = Math.min(0.35, Math.max(0, Number(process.env.GATEWAY_TIMEOUT_JITTER_RATIO || 0.12)));

const buildTraceId = () => `gw-${crypto.randomUUID()}`;

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

const computeRetryDelayMs = (attempt: number): number => {
  const exponential = GATEWAY_RETRY_BASE_MS * Math.pow(2, attempt);
  const bounded = Math.min(GATEWAY_RETRY_MAX_MS, exponential);
  return withJitter(bounded, 0.2);
};

const buildStableHeaders = (
  baseHeaders: Record<string, string>,
  sessionId: string,
  platform: "iOS" | "Android"
): Record<string, string> => {
  const fp = getOrCreateFingerprint(sessionId, platform);
  return {
    ...baseHeaders,
    // Internal only. Do not forward to upstream.
    __h2_weight: String(fp.h2Settings.weight),
    __h2_window: String(fp.h2Settings.windowSize),
  };
};

const shouldStripOutboundHeader = (name: string): boolean => {
  const k = String(name || "").trim().toLowerCase();
  if (!k) return true;
  if (k.startsWith("x-gw-")) return true;
  if (k.startsWith("x-h2-")) return true;
  if (k.startsWith("x-ja3-")) return true;
  if (k.startsWith("x-ja4-")) return true;
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

  while (attempt <= input.maxRetries) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const attemptTimeoutMs = computeAttemptTimeoutMs(input.timeoutMs, attempt);
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);
    try {
      const stableHeaders = buildStableHeaders(
        input.packet.headers,
        input.packet.metadata.sessionId,
        input.packet.metadata.platform
      );
      const { __h2_weight, __h2_window, ...wireHeaders } = stableHeaders;
      const cleanWireHeaders = sanitizeOutboundHeaders(wireHeaders);
      const res = await fetch(
        input.packet.url,
        {
          method: input.packet.method,
          headers: cleanWireHeaders,
          body: input.packet.body as any,
          signal: controller.signal,
        } as any // cast to avoid TS complaining about non‑standard fields
      );
      clearTimeout(timer);
      const responseBody = await res.text();
      const latencyMs = Date.now() - startedAt;
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
      const canRetry = attempt < input.maxRetries;

      if (!canRetry) {
        throw new GatewayError({
          message: isTimeout ? "transport timeout" : `transport network error: ${err?.message || err}`,
          code: isTimeout ? GatewayErrorCode.TRANSPORT_TIMEOUT : GatewayErrorCode.TRANSPORT_NETWORK_ERROR,
          status: isTimeout ? 504 : 503,
          retryable: true,
          details: { traceId, attempt },
        });
      }

      await sleep(computeRetryDelayMs(attempt));
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
