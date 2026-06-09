import { describe, expect, it } from "vitest";
import { monthRange, shiftMonth } from "../src/month-range";

describe("monthRange", () => {
  it("devuelve inicio y fin exclusivo del mes", () => {
    expect(monthRange(2026, 6)).toEqual({ start: "2026-06-01", endExclusive: "2026-07-01" });
  });
  it("maneja el rollover de diciembre", () => {
    expect(monthRange(2026, 12)).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });
  it("rellena meses de un dígito", () => {
    expect(monthRange(2026, 3)).toEqual({ start: "2026-03-01", endExclusive: "2026-04-01" });
  });
});

describe("shiftMonth", () => {
  it("avanza al siguiente mes", () => {
    expect(shiftMonth(2026, 6, 1)).toEqual({ year: 2026, month: 7 });
  });
  it("retrocede cruzando el año", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("avanza cruzando el año", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});
