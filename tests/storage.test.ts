import { describe, expect, it } from "vitest";
import { createChunkedStorage } from "../src/lib/chunked-storage";
function setup() {
  const entries = new Map<string, string>();
  let generation = 0;
  let failure = "";
  const store = createChunkedStorage(
    {
      getItem: async (key) => entries.get(key) ?? null,
      setItem: async (key, value) => {
        if (key === failure) throw new Error("Keychain unavailable");
        entries.set(key, value);
      },
      removeItem: async (key) => {
        entries.delete(key);
      },
    },
    () => `g${++generation}`,
  );
  return {
    store,
    entries,
    fail: (key: string) => {
      failure = key;
    },
  };
}
describe("native session storage", () => {
  it("round trips long sessions with Unicode and small UTF-8 chunks", async () => {
    const { store, entries } = setup();
    const value = JSON.stringify({
      token: "x".repeat(5000),
      metadata: "🙂".repeat(500),
    });
    await store.setItem("auth", value);
    expect(await store.getItem("auth")).toBe(value);
    for (const [key, chunk] of entries)
      if (!key.endsWith("manifest"))
        expect(Buffer.byteLength(chunk)).toBeLessThanOrEqual(1600);
  });
  it("retains the old session if writing a new chunk fails", async () => {
    const { store, fail } = setup();
    await store.setItem("auth", "old-session");
    fail("auth.g2.1");
    await expect(store.setItem("auth", "x".repeat(1000))).rejects.toThrow();
    expect(await store.getItem("auth")).toBe("old-session");
  });
  it("cleans up superseded tokens and clears the session on sign-out", async () => {
    const { store, entries } = setup();
    await store.setItem("auth", "x".repeat(1000));
    await store.setItem("auth", "new");
    expect([...entries.keys()].some((key) => key.includes("g1"))).toBe(false);
    await store.removeItem("auth");
    expect(await store.getItem("auth")).toBeNull();
    expect(entries.size).toBe(0);
  });
});
