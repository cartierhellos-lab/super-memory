import fs from "fs";
import os from "os";
import path from "path";
import { buildDispatchRequest } from "../gateway/dispatch-manager.js";
import { buildMultipartMediaPayload } from "../gateway/media-payload-builder.js";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

(async () => {
  const tmpFile = path.join(os.tmpdir(), `gw-media-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"));

  const multipart = await buildMultipartMediaPayload({
    localAbsolutePath: tmpFile,
    profile: { platform: "iOS", model: "iPhone14,8", osVersion: "18.4.1", sessionPx: "px-token" },
    extraFields: { to: "+15550100001", text: "hello" },
  });
  assert(multipart.contentType.includes("multipart/form-data; boundary="), "multipart content type failed");
  assert(!!multipart.bodyStream, "stream body generation failed");

  const iosDispatch = await buildDispatchRequest({
    request: {
      tenantId: "tenant-a",
      platform: "iOS",
      session: { Cookie: "_pxhd=abc", "X-PX-AUTHORIZATION": "3:abc", sessionId: "ios-session-1" },
      message: { to: "+15550100001", type: "image", text: "hello ios image", mediaUrl: "https://example.com/a.png" },
      hints: { endpoint: "https://example.com/upstream/send", method: "POST" },
    },
    profile: { platform: "iOS", sessionPx: "px-token", hardwareFingerprint: "hwfp-1" },
    localAbsolutePath: tmpFile,
  });
  assert(!iosDispatch.http2Headers, "ios dispatch should not expose pseudo headers");
  assert(!("x-session-px" in iosDispatch.packet.headers), "ios session-px header should not be injected");

  const androidDispatch = await buildDispatchRequest({
    request: {
      tenantId: "tenant-a",
      platform: "Android",
      session: { token: "abc", "X-PX-AUTHORIZATION": "3:def", sessionId: "android-session-1" },
      message: { to: "+15550100002", type: "sms", text: "hello android sms" },
      hints: { endpoint: "https://example.com/upstream/send", method: "POST" },
    },
    profile: { platform: "Android" },
  });
  assert(!("x-tls-client-profile" in androidDispatch.packet.headers), "android tls profile header should not be injected");
  assert(androidDispatch.notes.some((v) => v.includes("fingerprint policy:")), "fingerprint note missing");

  console.log("media-dispatch-smoke test passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
