import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalKeys, makeServiceClient, makeUserClient, cleanupUser } from "./helpers/supabase-clients";

const keys = getLocalKeys();
const service = makeServiceClient(keys);

let userA: { userId: string; client: SupabaseClient };
let userB: { userId: string; client: SupabaseClient };
let householdA: string;
let householdB: string;

beforeAll(async () => {
  const stamp = Date.now();
  userA = await makeUserClient(keys, service, `h2a_${stamp}@test.local`, "password123");
  userB = await makeUserClient(keys, service, `h2b_${stamp}@test.local`, "password123");

  const { data: hA } = await service.from("households").insert({ name: "H2 A", created_by: userA.userId }).select("id").single();
  householdA = hA!.id;
  await service.from("household_members").insert({ household_id: householdA, user_id: userA.userId, role: "owner" });
  const { data: hB } = await service.from("households").insert({ name: "H2 B", created_by: userB.userId }).select("id").single();
  householdB = hB!.id;
  await service.from("household_members").insert({ household_id: householdB, user_id: userB.userId, role: "owner" });
});

afterAll(async () => {
  await cleanupUser(service, userA.userId);
  await cleanupUser(service, userB.userId);
});

async function seedCanonical(client: SupabaseClient, householdId: string, name: string, alias: string, normalized: string) {
  const { data: cp } = await client
    .from("canonical_products")
    .insert({ household_id: householdId, name, unit: "lt", unit_quantity: "1" })
    .select("id")
    .single();
  await client
    .from("product_aliases")
    .insert({ canonical_product_id: cp!.id, alias, alias_normalized: normalized, source: "user_confirmed", confidence: 1.0 });
  return cp!.id as string;
}

describe("match_product RPC", () => {
  it("Capa 1: exact match retorna confidence 1.0", async () => {
    const cpId = await seedCanonical(userA.client, householdA, "Leche Alpina 1L", "LECHE ALPINA 1L", "LECHE ALPINA 1L");
    const { data } = await userA.client.rpc("match_product", {
      p_household_id: householdA,
      p_normalized: "LECHE ALPINA 1L",
    });
    expect(data.exact?.canonical_id).toBe(cpId);
    expect(data.exact?.confidence).toBe(1);
    expect(data.fuzzy).toEqual([]);
  });

  it("Capa 2: fuzzy retorna top-3 por score, sin duplicar canonical", async () => {
    // Self-seed: no depende de fixtures de otros tests.
    const cpId = await seedCanonical(userA.client, householdA, "Aceite Premier 1L", "ACEITE PREMIER 1L", "ACEITE PREMIER 1L");
    // Segundo alias del MISMO canonical → debe dedupe a 1 sola entrada en el resultado.
    await userA.client.from("product_aliases").insert({
      canonical_product_id: cpId,
      alias: "ACT PRMR",
      alias_normalized: "ACEITE PREMIER",
      source: "user_confirmed",
      confidence: 1.0,
    });
    // Buscar "ACEITE PREMIE 1L": no exactea ningún alias_normalized → cae a Capa 2.
    const { data } = await userA.client.rpc("match_product", {
      p_household_id: householdA,
      p_normalized: "ACEITE PREMIE 1L",
    });
    // Sin exact (string distinto a cualquier alias_normalized)
    expect(data.exact).toBeNull();
    // fuzzy debe tener exactamente 1 entrada (el canonical único, deduplicado)
    expect(data.fuzzy).toHaveLength(1);
    expect(data.fuzzy[0]?.score).toBeGreaterThanOrEqual(0.6);
  });

  it("threshold: similarity < min_similarity → vacío", async () => {
    const { data } = await userA.client.rpc("match_product", {
      p_household_id: householdA,
      p_normalized: "PANALES TURBO",
      p_min_similarity: 0.9,
    });
    expect(data.exact).toBeNull();
    expect(data.fuzzy).toEqual([]);
  });

  it("RLS: A no ve canonicales de B (RPC contra household de B desde A → vacío)", async () => {
    await seedCanonical(service, householdB, "Yogurt B", "YOGURT B", "YOGURT B");
    const { data } = await userA.client.rpc("match_product", {
      p_household_id: householdB,
      p_normalized: "YOGURT B",
    });
    expect(data.exact).toBeNull();
    expect(data.fuzzy).toEqual([]);
  });
});

describe("create_receipt_with_items v2 persiste alias", () => {
  it("inserta alias cuando el item trae canonical_product_id + alias_normalized", async () => {
    const cpId = await seedCanonical(userA.client, householdA, "Pan Bimbo", "PAN BIMBO", "PAN BIMBO");
    await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-08",
      p_currency: "COP",
      p_items: [
        {
          raw_name: "Pan Bimbo grande",
          quantity: "1",
          unit: null,
          unit_price: "8000",
          total_price: "8000",
          category_id: null,
          canonical_product_id: cpId,
          alias_normalized: "PAN BIMBO GRANDE",
        },
      ],
    });
    const { data: aliases } = await userA.client
      .from("product_aliases")
      .select("alias_normalized")
      .eq("canonical_product_id", cpId);
    expect(aliases?.map((a) => a.alias_normalized)).toContain("PAN BIMBO GRANDE");
  });

  it("ON CONFLICT: segundo INSERT del mismo (canonical, alias_normalized) es no-op", async () => {
    const { data: cp } = await userA.client
      .from("canonical_products")
      .select("id")
      .eq("name", "Pan Bimbo")
      .limit(1)
      .single();
    const before = (
      await userA.client.from("product_aliases").select("id", { count: "exact", head: true }).eq("canonical_product_id", cp!.id)
    ).count;
    await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-08",
      p_currency: "COP",
      p_items: [
        {
          raw_name: "Pan Bimbo grande",
          quantity: "1",
          unit: null,
          unit_price: "8000",
          total_price: "8000",
          category_id: null,
          canonical_product_id: cp!.id,
          alias_normalized: "PAN BIMBO GRANDE",
        },
      ],
    });
    const after = (
      await userA.client.from("product_aliases").select("id", { count: "exact", head: true }).eq("canonical_product_id", cp!.id)
    ).count;
    expect(after).toBe(before);
  });

  it("ítem sin canonical_product_id: no inserta alias", async () => {
    const { count: before } = await userA.client
      .from("product_aliases")
      .select("id", { count: "exact", head: true });
    await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-08",
      p_currency: "COP",
      p_items: [
        {
          raw_name: "Cualquier cosa",
          quantity: "1",
          unit: null,
          unit_price: "100",
          total_price: "100",
          category_id: null,
        },
      ],
    });
    const { count: after } = await userA.client
      .from("product_aliases")
      .select("id", { count: "exact", head: true });
    expect(after).toBe(before);
  });

  it("rechaza canonical_product_id de otro hogar", async () => {
    // Canónico creado en hogar B (con service client para bypassear RLS).
    const { data: cpB } = await service
      .from("canonical_products")
      .insert({ household_id: householdB, name: "Otro de B", unit: "un", unit_quantity: "1" })
      .select("id")
      .single();
    // userA intenta usar el canónico de hogar B en una factura de hogar A → el guard del RPC bloquea.
    const { error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-08",
      p_currency: "COP",
      p_items: [
        {
          raw_name: "Robado",
          quantity: "1",
          unit: null,
          unit_price: "100",
          total_price: "100",
          category_id: null,
          canonical_product_id: cpB!.id,
          alias_normalized: "ROBADO",
        },
      ],
    });
    expect(error).not.toBeNull();
  });
});
