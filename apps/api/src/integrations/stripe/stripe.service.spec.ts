import { describe, expect, it } from "vitest";
import { stripeClientOptions } from "./stripe.service";

describe("stripeClientOptions", () => {
  it("leaves the SDK defaults untouched when no override is configured", () => {
    expect(stripeClientOptions(undefined)).toEqual({});
    expect(stripeClientOptions("")).toEqual({});
  });

  it("maps an http origin onto SDK host, port and protocol", () => {
    expect(stripeClientOptions("http://127.0.0.1:12111")).toEqual({
      host: "127.0.0.1",
      port: 12111,
      protocol: "http",
    });
  });

  it("maps an https origin and defaults the port", () => {
    expect(stripeClientOptions("https://stripe-mock.internal")).toEqual({
      host: "stripe-mock.internal",
      port: 443,
      protocol: "https",
    });
  });

  it("defaults the port for an http origin without one", () => {
    expect(stripeClientOptions("http://stripe-mock.internal")).toEqual({
      host: "stripe-mock.internal",
      port: 80,
      protocol: "http",
    });
  });
});
