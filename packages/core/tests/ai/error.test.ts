import { describe, expect, it } from "vitest";
import { toAIError, isAIError } from "../../src/ai/error";

describe("toAIError", () => {
  it("maps 401 to auth", () => {
    const r = new Response("", { status: 401 });
    const e = toAIError(r, "gemini");
    expect(e.kind).toBe("auth");
    expect(e.provider).toBe("gemini");
  });

  it("maps 403 to auth", () => {
    const r = new Response("", { status: 403 });
    expect(toAIError(r, "claude").kind).toBe("auth");
  });

  it("maps 429 to rate_limit", () => {
    const r = new Response("", { status: 429 });
    expect(toAIError(r, "openai").kind).toBe("rate_limit");
  });

  it("DOMException AbortError → timeout", () => {
    const e = new DOMException("aborted", "AbortError");
    expect(toAIError(e, "gemini").kind).toBe("timeout");
  });

  it("TypeError de fetch → network", () => {
    const e = new TypeError("Failed to fetch");
    expect(toAIError(e, "gemini").kind).toBe("network");
  });

  it("Response 500 → unknown", () => {
    const r = new Response("server boom", { status: 500 });
    const e = toAIError(r, "gemini");
    expect(e.kind).toBe("unknown");
  });

  it("preserva el provider en todos los casos", () => {
    expect(toAIError(new Response("", { status: 429 }), "claude").provider).toBe("claude");
  });
});

describe("isAIError", () => {
  it("true para errores creados por toAIError", () => {
    expect(isAIError(toAIError(new TypeError("x"), "gemini"))).toBe(true);
  });

  it("false para errores normales", () => {
    expect(isAIError(new Error("plain"))).toBe(false);
  });
});
