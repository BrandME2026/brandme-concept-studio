import { describe, it, expect, vi, beforeEach } from "vitest";

describe("isFirebaseConfigured", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("es false cuando faltan las env vars de Firebase", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "");
    const { isFirebaseConfigured } = await import("./client");
    expect(isFirebaseConfigured()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("es true cuando están apiKey + projectId + appId", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "k");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "p");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "a");
    const { isFirebaseConfigured } = await import("./client");
    expect(isFirebaseConfigured()).toBe(true);
    vi.unstubAllEnvs();
  });
});
