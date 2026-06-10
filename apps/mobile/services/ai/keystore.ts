import * as SecureStore from "expo-secure-store";
import type { ProviderName } from "@oraculo/core";

const KEY_PREFIX = "oraculo.ai.";

function keyFor(p: ProviderName): string {
  return `${KEY_PREFIX}${p}`;
}

export async function getKey(p: ProviderName): Promise<string | null> {
  return SecureStore.getItemAsync(keyFor(p));
}

export async function setKey(p: ProviderName, key: string): Promise<void> {
  await SecureStore.setItemAsync(keyFor(p), key);
}

export async function deleteKey(p: ProviderName): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(p));
}
