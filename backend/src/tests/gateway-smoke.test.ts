import { buildGatewayPacket } from "../gateway/adapters.js";
import { normalizeGatewayRequest } from "../gateway/normalizer.js";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

(() => {
  const ios = normalizeGatewayRequest({
    tenantId: "tenant-a",
    platform: "iOS",
    session: {
      Cookie: "_pxhd=abc",
      "X-PX-AUTHORIZATION": "3:abc",
      clientId: "c1",
      "X-PX-OS": "iOS",
    },
    message: {
      to: "+1 (555) 010-1111",
      type: "sms",
      text: "hello ios",
    },
    hints: {
      endpoint: "https://example.com/upstream/send",
      method: "POST",
      protocolVersion: "v1",
      adapterVersion: "v1",
    },
  });

  const iosPacket = buildGatewayPacket(ios);
  const iosBody = JSON.parse(iosPacket.body.toString());
  assert(!("x-gw-platform-profile" in iosPacket.headers), "ios leak header should be removed");
  assert(!!iosPacket.metadata.sessionId, "ios metadata.sessionId missing");
  assert(iosBody.message?.channel === "sms", "ios sms payload failed");

  const android = normalizeGatewayRequest({
    tenantId: "tenant-a",
    platform: "Android",
    session: {
      token: "bearer_token_x",
      "X-PX-AUTHORIZATION": "3:def",
      clientId: "c2",
      "X-PX-OS": "Android",
    },
    message: {
      to: "15550102222",
      type: "image",
      mediaUrl: "https://example.com/x.png",
      text: "hello android image",
    },
    hints: {
      endpoint: "https://example.com/upstream/send",
      method: "POST",
    },
  });

  const androidPacket = buildGatewayPacket(android);
  const androidBody = JSON.parse(androidPacket.body.toString());
  assert(!("x-gw-platform-profile" in androidPacket.headers), "android leak header should be removed");
  assert(!!androidPacket.metadata.sessionId, "android metadata.sessionId missing");
  assert(androidBody.message?.channel === "mms", "android mms payload failed");
  assert(androidBody.message?.attachments?.length === 1, "android image attachment failed");

  console.log("gateway-smoke test passed");
})();
