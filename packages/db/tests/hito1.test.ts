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
  userA = await makeUserClient(keys, service, `h1a_${stamp}@test.local`, "password123");
  userB = await makeUserClient(keys, service, `h1b_${stamp}@test.local`, "password123");

  const { data: hA } = await service.from("households").insert({ name: "H A", created_by: userA.userId }).select("id").single();
  householdA = hA!.id;
  await service.from("household_members").insert({ household_id: householdA, user_id: userA.userId, role: "owner" });

  const { data: hB } = await service.from("households").insert({ name: "H B", created_by: userB.userId }).select("id").single();
  householdB = hB!.id;
  await service.from("household_members").insert({ household_id: householdB, user_id: userB.userId, role: "owner" });
});

afterAll(async () => {
  // cleanupUser borra toda la huella de cada usuario (incl. el hogar del trigger
  // 0005 y los receipts/items creados por la RPC) y luego el usuario.
  await cleanupUser(service, userA.userId);
  await cleanupUser(service, userB.userId);
});

describe("semilla de categorías de sistema", () => {
  it("hay 9 categorías de sistema (household_id null)", async () => {
    const { data, error } = await userA.client
      .from("categories")
      .select("id")
      .is("household_id", null);
    expect(error).toBeNull();
    expect(data?.length).toBe(9);
  });
});

describe("create_receipt_with_items RPC", () => {
  it("crea factura + ítems atómicamente para el hogar propio", async () => {
    const { data: receiptId, error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-07",
      p_currency: "COP",
      p_items: [
        { raw_name: "Leche", quantity: "1", unit: null, unit_price: "5000", total_price: "5000", category_id: null },
        { raw_name: "Pan", quantity: "2", unit: null, unit_price: "1500", total_price: "3000", category_id: null },
      ],
    });
    expect(error).toBeNull();
    expect(typeof receiptId).toBe("string");

    const { data: items } = await userA.client.from("receipt_items").select("id").eq("receipt_id", receiptId);
    expect(items?.length).toBe(2);
  });

  it("es atómica: un ítem con total_price inválido no deja receipt huérfano", async () => {
    const { count: before } = await userA.client
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdA);

    const { error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-07",
      p_currency: "COP",
      p_items: [{ raw_name: "X", quantity: "1", unit: null, unit_price: "1", total_price: "no-numero", category_id: null }],
    });
    expect(error).not.toBeNull();

    const { count: after } = await userA.client
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdA);
    expect(after).toBe(before);
  });

  it("RLS: A no puede crear factura en el hogar de B", async () => {
    const { error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdB,
      p_store_id: null,
      p_purchased_at: "2026-06-07",
      p_currency: "COP",
      p_items: [{ raw_name: "X", quantity: "1", unit: null, unit_price: "1", total_price: "1", category_id: null }],
    });
    expect(error).not.toBeNull();
  });
});

describe("soft_delete RPCs", () => {
  it("soft_delete_manual_expense marca deleted_at y oculta de la lista", async () => {
    const { data: ins } = await userA.client
      .from("manual_expenses")
      .insert({
        household_id: householdA,
        created_by: userA.userId,
        category_id: null,
        description: "Para borrar",
        amount: "1000",
        currency: "COP",
        occurred_at: "2026-06-07",
      })
      .select("id")
      .single();
    expect(ins?.id).toBeTruthy();

    const { error } = await userA.client.rpc("soft_delete_manual_expense", { p_id: ins!.id });
    expect(error).toBeNull();

    // SELECT como user A ya no devuelve la fila (la SELECT policy oculta deleted_at != null)
    const { data: visible } = await userA.client
      .from("manual_expenses")
      .select("id")
      .eq("id", ins!.id);
    expect(visible?.length).toBe(0);

    // pero la fila físicamente existe con deleted_at != null (verificado vía service)
    const { data: row } = await service
      .from("manual_expenses")
      .select("id, deleted_at")
      .eq("id", ins!.id)
      .single();
    expect(row?.deleted_at).not.toBeNull();
  });

  it("RLS: A no puede soft-delete un manual_expense del hogar de B", async () => {
    const { data: ins } = await service
      .from("manual_expenses")
      .insert({
        household_id: householdB,
        created_by: userB.userId,
        category_id: null,
        description: "De B",
        amount: "500",
        currency: "COP",
        occurred_at: "2026-06-07",
      })
      .select("id")
      .single();

    const { error } = await userA.client.rpc("soft_delete_manual_expense", { p_id: ins!.id });
    expect(error).not.toBeNull();

    // sigue sin deleted_at
    const { data: row } = await service
      .from("manual_expenses")
      .select("deleted_at")
      .eq("id", ins!.id)
      .single();
    expect(row?.deleted_at).toBeNull();
  });

  it("soft_delete_receipt oculta la factura de la lista de A", async () => {
    const { data: receiptId } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-07",
      p_currency: "COP",
      p_items: [{ raw_name: "X", quantity: "1", unit: null, unit_price: "100", total_price: "100", category_id: null }],
    });
    expect(typeof receiptId).toBe("string");

    const { error } = await userA.client.rpc("soft_delete_receipt", { p_id: receiptId as string });
    expect(error).toBeNull();

    const { data: visible } = await userA.client
      .from("receipts")
      .select("id")
      .eq("id", receiptId as string);
    expect(visible?.length).toBe(0);
  });
});
