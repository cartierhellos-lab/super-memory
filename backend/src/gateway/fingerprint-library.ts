import { DeviceProfile, GatewayPlatform } from "./contracts.js";

type FingerprintPolicy = {
  policyId: string;
  tlsClientProfile: string;
  ja3PolicyId: string;
  ja4PolicyId: string;
  h2WeightRange: [number, number];
  h2WindowRange: [number, number];
  notes: string;
};

const IOS_DEFAULT_POLICY: FingerprintPolicy = {
  policyId: "ios-cfnetwork-v1",
  tlsClientProfile: "cfnetwork-real-device",
  ja3PolicyId: "ja3-ios-cfnetwork-v1",
  ja4PolicyId: "ja4-ios-cfnetwork-v1",
  h2WeightRange: [32, 220],
  h2WindowRange: [65535, 131070],
  notes: "iOS profile mapping for CFNetwork-aligned egress",
};

const ANDROID_DEFAULT_POLICY: FingerprintPolicy = {
  policyId: "android-okhttp-v1",
  tlsClientProfile: "okhttp-real-device",
  ja3PolicyId: "ja3-android-okhttp-v1",
  ja4PolicyId: "ja4-android-okhttp-v1",
  h2WeightRange: [24, 200],
  h2WindowRange: [65535, 196605],
  notes: "Android profile mapping for OkHttp-aligned egress",
};

export const resolveFingerprintPolicy = (input: {
  platform: GatewayPlatform;
  profile?: DeviceProfile;
}) => {
  return input.platform === "iOS" ? IOS_DEFAULT_POLICY : ANDROID_DEFAULT_POLICY;
};

