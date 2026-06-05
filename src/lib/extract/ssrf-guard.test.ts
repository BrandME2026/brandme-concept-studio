import { describe, it, expect } from "vitest";
import { isBlockedHost, isBlockedAddress } from "./ssrf-guard";

describe("isBlockedHost (string síncrono)", () => {
  it("bloquea loopback y localhost", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("app.localhost")).toBe(true);
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("127.13.37.1")).toBe(true);
  });

  it("bloquea metadata link-local y rangos privados", () => {
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    expect(isBlockedHost("10.0.0.5")).toBe(true);
    expect(isBlockedHost("192.168.1.1")).toBe(true);
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
  });

  it("bloquea 0.0.0.0 e IPv6 internas (cualquier forma de bracket)", () => {
    expect(isBlockedHost("0.0.0.0")).toBe(true);
    expect(isBlockedHost("[::1]")).toBe(true);
    expect(isBlockedHost("::1")).toBe(true);
    expect(isBlockedHost("fe80::1")).toBe(true);
    expect(isBlockedHost("fc00::1")).toBe(true);
  });

  it("permite hosts/IPs públicos", () => {
    expect(isBlockedHost("vercel.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("172.32.0.1")).toBe(false);
  });
});

describe("isBlockedAddress (IP resuelta)", () => {
  it("clasifica IPv4-mapped en IPv6 como interna", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("bloquea carrier-grade NAT y unspecified", () => {
    expect(isBlockedAddress("100.64.0.1")).toBe(true);
    expect(isBlockedAddress("::")).toBe(true);
  });

  it("permite IPs públicas", () => {
    expect(isBlockedAddress("1.1.1.1")).toBe(false);
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });
});
