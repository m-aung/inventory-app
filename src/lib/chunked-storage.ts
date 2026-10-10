type Store = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};
type Manifest = { generation: string; count: number };
export function createChunkedStorage(
  store: Store,
  generationId: () => string,
): Store {
  async function manifest(key: string): Promise<Manifest | null> {
    const raw = await store.getItem(`${key}.manifest`);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      return typeof value.generation === "string" &&
        Number.isInteger(value.count) &&
        value.count > 0 &&
        value.count <= 1000
        ? value
        : null;
    } catch {
      return null;
    }
  }
  async function cleanup(key: string, value: Manifest | null) {
    if (value)
      for (let i = 0; i < value.count; i++)
        await store
          .removeItem(`${key}.${value.generation}.${i}`)
          .catch(() => {});
  }
  return {
    async getItem(key) {
      const value = await manifest(key);
      if (!value) return null;
      const parts = await Promise.all(
        Array.from({ length: value.count }, (_, i) =>
          store.getItem(`${key}.${value.generation}.${i}`),
        ),
      );
      return parts.some((p) => p === null) ? null : parts.join("");
    },
    async setItem(key, value) {
      const old = await manifest(key);
      // Split at Unicode codepoint boundaries; 400 codepoints <= 1600 UTF-8 bytes.
      const characters = Array.from(value);
      const next = {
        generation: generationId(),
        count: Math.max(1, Math.ceil(characters.length / 400)),
      };
      if (next.count > 1000) throw new Error("Session is too large to store.");
      try {
        for (let i = 0; i < next.count; i++)
          await store.setItem(
            `${key}.${next.generation}.${i}`,
            characters.slice(i * 400, (i + 1) * 400).join(""),
          );
        // Publish only after every new chunk is written. Failed writes retain the old session.
        await store.setItem(`${key}.manifest`, JSON.stringify(next));
      } catch (e) {
        await cleanup(key, next);
        throw e;
      }
      await cleanup(key, old);
    },
    async removeItem(key) {
      const old = await manifest(key);
      await store.removeItem(`${key}.manifest`);
      await cleanup(key, old);
    },
  };
}
