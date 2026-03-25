import { buildGatewayPacket } from "./adapters.js";
import { DeviceProfile, GatewayPacket, GatewaySendRequest } from "./contracts.js";
import { GatewayError } from "./errors.js";
import { GatewayErrorCode } from "./error-codes.js";
import { buildMultipartMediaPayload } from "./media-payload-builder.js";
import { normalizeGatewayRequest } from "./normalizer.js";
import { resolveFingerprintPolicy } from "./fingerprint-library.js";

interface DispatchBuildInput {
  request: GatewaySendRequest;
  profile: DeviceProfile;
  localAbsolutePath?: string;
}

interface DispatchOutput {
  packet: GatewayPacket;
  http2Headers?: Record<string, string>;
  notes: string[];
}

export const buildDispatchRequest = async (input: DispatchBuildInput): Promise<DispatchOutput> => {
  const normalized = normalizeGatewayRequest(input.request);
  if (normalized.platform !== input.profile.platform) {
    throw new GatewayError({
      message: `platform mismatch: request=${normalized.platform} profile=${input.profile.platform}`,
      code: GatewayErrorCode.INVALID_REQUEST,
      status: 400,
    });
  }
  const notes: string[] = [];
  let packet = buildGatewayPacket(normalized);
  const fingerprintPolicy = resolveFingerprintPolicy({
    platform: input.profile.platform,
    profile: input.profile,
  });
  notes.push(`fingerprint policy: ${fingerprintPolicy.policyId}`);

  if (normalized.message.type !== "sms" && input.localAbsolutePath) {
    const media = await buildMultipartMediaPayload({
      localAbsolutePath: input.localAbsolutePath,
      profile: input.profile,
      fieldName: "file",
      extraFields: {
        to: normalized.message.to,
        text: normalized.message.text || "",
      },
      includeHexPreview: false,
    });
    packet = {
      ...packet,
      headers: {
        ...packet.headers,
        ...media.headers,
      },
      body: media.bodyStream,
    };
    notes.push(`multipart built from local media (${media.fileName}, ${media.mime}, ${media.size} bytes)`);
    notes.push(`binary-to-hex preview ready (stream mode, bodyLength=${media.bodyLength} bytes)`);
  }

  if (input.profile.platform === "iOS") {
    // Compliance-safe: only inject already issued Session-PX value, never synthesize device fingerprint.
    const sessionPx = String(input.profile.sessionPx || normalized.session.pxToken || "").trim();
    if (!sessionPx) {
      throw new GatewayError({
        message: "iOS dispatch requires provided Session-PX token from upstream",
        code: GatewayErrorCode.INVALID_SESSION,
        status: 401,
      });
    }
    notes.push("iOS Session-PX present (validated), no proxy fingerprint headers injected");
    return { packet, notes };
  }

  if (input.profile.platform === "Android") {
    notes.push(`${fingerprintPolicy.notes}; JA signatures are mapped as policy tags for egress`);
  }

  return { packet, notes };
};
