import { createProvider, type AIProvider, type CanonicalHint, type ProviderName } from "@oraculo/core";
import { supabase } from "../../lib/supabase";
import { getKey } from "./keystore";

/** Resuelve el provider activo del usuario; lanza si no hay key configurada. */
export async function resolveActiveProvider(): Promise<{ provider: AIProvider; apiKey: string; name: ProviderName }> {
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("preferred_ai_provider")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = settings?.preferred_ai_provider as string | null | undefined;
  const name: ProviderName = raw === "claude" || raw === "openai" ? raw : "gemini";
  const apiKey = await getKey(name);
  if (!apiKey) {
    const e = new Error(`Falta API key para ${name}`) as Error & { code: "NO_KEY"; provider: ProviderName };
    e.code = "NO_KEY";
    e.provider = name;
    throw e;
  }
  return { provider: createProvider(name), apiKey, name };
}

/** Top-N canonicals del hogar con sus aliases (max 3 por canonical). */
export async function getCanonicalHints(householdId: string, limit = 50): Promise<CanonicalHint[]> {
  const { data: canonicals, error } = await supabase
    .from("canonical_products")
    .select("id, name")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!canonicals || canonicals.length === 0) return [];
  const ids = canonicals.map((c) => c.id as string);
  const { data: aliases } = await supabase
    .from("product_aliases")
    .select("canonical_product_id, alias_normalized")
    .in("canonical_product_id", ids);
  const byCanonical = new Map<string, string[]>();
  for (const a of aliases ?? []) {
    const arr = byCanonical.get(a.canonical_product_id as string) ?? [];
    if (arr.length < 3) arr.push(a.alias_normalized as string);
    byCanonical.set(a.canonical_product_id as string, arr);
  }
  return canonicals.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    aliases: byCanonical.get(c.id as string) ?? [],
  }));
}
