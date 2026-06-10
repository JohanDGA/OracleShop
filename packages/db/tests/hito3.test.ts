import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalKeys, makeServiceClient, makeUserClient, cleanupUser } from "./helpers/supabase-clients";

const keys = getLocalKeys();
const service = makeServiceClient(keys);

let userA: { userId: string; client: SupabaseClient };
let householdA: string;

beforeAll(async () => {
  const stamp = Date.now();
  userA = await makeUserClient(keys, service, `h3a_${stamp}@test.local`, "password123");
  const { data: hA } = await service.from("households").insert({ name: "H3 A", created_by: userA.userId }).select("id").single();
  householdA = hA!.id;
  await service.from("household_members").insert({ household_id: householdA, user_id: userA.userId, role: "owner" });
});

afterAll(async () => {
  await cleanupUser(service, userA.userId);
});

const baseItem = {
  raw_name: "Item",
  quantity: "1",
  unit: null,
  unit_price: "1000",
  total_price: "1000",
  category_id: null,
};

describe("create_receipt_with_items v3", () => {
  it("default p_source es 'manual'", async () => {
    const { data: id } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [baseItem],
    });
    const { data: r } = await userA.client.from("receipts").select("source").eq("id", id as string).single();
    expect(r?.source).toBe("manual");
  });

  it("acepta p_source='photo_ai' y lo persiste", async () => {
    const { data: id } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [baseItem],
      p_source: "photo_ai",
    });
    const { data: r } = await userA.client.from("receipts").select("source").eq("id", id as string).single();
    expect(r?.source).toBe("photo_ai");
  });

  it("rechaza p_source inválido", async () => {
    const { error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [baseItem],
      p_source: "spam",
    });
    expect(error).not.toBeNull();
  });

  it("persiste regular_price y is_promo en receipt_items", async () => {
    const { data: id } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [
        {
          ...baseItem,
          unit_price: "5800",
          total_price: "5800",
          regular_price: "6500",
          is_promo: true,
        },
      ],
      p_source: "photo_ai",
    });
    const { data: items } = await userA.client.from("receipt_items").select("regular_price, is_promo").eq("receipt_id", id as string);
    // PostgREST serializa numeric como número JSON (no string)
    expect(Number(items?.[0]?.regular_price)).toBe(6500);
    expect(items?.[0]?.is_promo).toBe(true);
  });

  it("ítem sin regular_price → null; sin is_promo → false", async () => {
    const { data: id } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [baseItem],
    });
    const { data: items } = await userA.client.from("receipt_items").select("regular_price, is_promo").eq("receipt_id", id as string);
    expect(items?.[0]?.regular_price).toBeNull();
    expect(items?.[0]?.is_promo).toBe(false);
  });
});
