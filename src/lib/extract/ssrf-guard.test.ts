import { describe, it, expect } from "vitest";
import { isBlockedHost } from "./ssrf-guard";

describe("isBlockedHost", () => {
  it("bloquea loopback", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("127.13.37.1")).toBe(true);
  });

  it("bloquea metadata link-local de cloud", () => {
    expect(isBlockedHost("169.254.169.254")).toBe(true);
  });

  it("bloquea rangos privados", () => {
    expect(isBlockedHost("10.0.0.5")).toBe(true);
    expect(isBlockedHost("192.168.1.1")).toBe(true);
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
  });

  it("permite hosts públicos", () => {
    expect(isBlockedHost("vercel.com")).toBe(false);
    expect(isBlockedHost("stripe.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("172.32.0.1")).toBe(false); // fuera del rango privado 172.16-31
  });

  it("bloquea 0.0.0.0 e IPv6 loopback", () => {
    expect(isBlockedHost("0.0.0.0")).toBe(true);
    expect(isBlockedHost("[::1]")).toBe(true);
    expect(isBlockedHost("::1")).toBe(true);
  });
});
