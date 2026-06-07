import { describe, expect, it } from "vitest";
import { signUpSchema, signInSchema } from "../src/auth";

describe("signUpSchema", () => {
  it("acepta email y password válidos", () => {
    const r = signUpSchema.safeParse({
      email: "jess@example.com",
      password: "Password1",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza email inválido", () => {
    const r = signUpSchema.safeParse({ email: "no-email", password: "Password1" });
    expect(r.success).toBe(false);
  });

  it("rechaza password de menos de 8 caracteres", () => {
    const r = signUpSchema.safeParse({ email: "a@b.com", password: "Pass1" });
    expect(r.success).toBe(false);
  });

  it("rechaza password sin al menos una letra y un número", () => {
    const r1 = signUpSchema.safeParse({ email: "a@b.com", password: "abcdefgh" });
    const r2 = signUpSchema.safeParse({ email: "a@b.com", password: "12345678" });
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
  });

  it("normaliza el email a minúsculas y recorta espacios", () => {
    const r = signUpSchema.parse({ email: "  JESS@EXAMPLE.COM ", password: "Password1" });
    expect(r.email).toBe("jess@example.com");
  });
});

describe("signInSchema", () => {
  it("acepta credenciales con formato válido", () => {
    const r = signInSchema.safeParse({ email: "a@b.com", password: "x" });
    expect(r.success).toBe(true);
  });

  it("exige una password no vacía", () => {
    const r = signInSchema.safeParse({ email: "a@b.com", password: "" });
    expect(r.success).toBe(false);
  });
});
