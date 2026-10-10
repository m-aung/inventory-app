import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { createChunkedStorage } from "./chunked-storage";
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const native = createChunkedStorage(
  {
    getItem: (key) => SecureStore.getItemAsync(key, options),
    setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
    removeItem: (key) => SecureStore.deleteItemAsync(key, options),
  },
  () => Crypto.randomUUID(),
);
export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return Platform.OS === "web"
      ? typeof window === "undefined"
        ? null
        : window.localStorage.getItem(key)
      : native.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined")
        window.localStorage.setItem(key, value);
    } else await native.setItem(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
    } else await native.removeItem(key);
  },
};
