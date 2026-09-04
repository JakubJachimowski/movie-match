import AsyncStorage from '@react-native-async-storage/async-storage';

// Domyślnie sesja jest trwale zapisywana (AsyncStorage) — użytkownik zostaje
// zalogowany między uruchomieniami appki. Gdy "Zapamiętaj mnie" jest odznaczone,
// sesja trzymana jest tylko w pamięci (do zamknięcia appki), nic nie trafia na dysk.
let rememberMe = true;
const memoryStore = new Map<string, string>();

export function setRememberMe(value: boolean) {
  rememberMe = value;
}

export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (memoryStore.has(key)) return memoryStore.get(key) ?? null;
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (rememberMe) {
      memoryStore.delete(key);
      await AsyncStorage.setItem(key, value);
    } else {
      memoryStore.set(key, value);
      await AsyncStorage.removeItem(key).catch(() => {});
    }
  },
  removeItem: async (key: string): Promise<void> => {
    memoryStore.delete(key);
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};
