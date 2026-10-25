import * as SecureStore from "expo-secure-store";

export const storage = {
  async set(key: string, value: string) {
    await SecureStore.setItemAsync(key, value);
  },

  async get(key: string) {
    return SecureStore.getItemAsync(key);
  },

  async remove(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};