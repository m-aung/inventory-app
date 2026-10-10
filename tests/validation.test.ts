import { describe, expect, it } from "vitest";
import { itemSchema, emailSchema, passwordSchema } from "../src/lib/validation";
const draft = { name: "Milk", quantity: "2", unit: "bottles", notes: "" };
describe("forms", () => {
  it("accepts zero and decimal quantities including decimal comma", () => {
    expect(itemSchema.parse({ ...draft, quantity: "0" }).quantity).toBe(0);
    expect(itemSchema.parse({ ...draft, quantity: "0,125" }).quantity).toBe(
      0.125,
    );
  });
  it.each(["", "-1", "Infinity", "NaN", "1e3", "1.0001", "1000000"])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(itemSchema.safeParse({ ...draft, quantity }).success).toBe(false);
    },
  );
  it("rejects empty names and overlong notes", () => {
    expect(itemSchema.safeParse({ ...draft, name: "  " }).success).toBe(false);
    expect(
      itemSchema.safeParse({ ...draft, notes: "x".repeat(501) }).success,
    ).toBe(false);
  });
  it("normalizes email and enforces new-password length", () => {
    expect(emailSchema.parse("BOB@example.com")).toBe("bob@example.com");
    expect(passwordSchema.safeParse("short").success).toBe(false);
  });
});
