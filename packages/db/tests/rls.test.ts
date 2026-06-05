import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLocalKeys,
  makeServiceClient,
  makeUserClient,
} from "./helpers/supabase-clients";

const keys = getLocalKeys();
const service = makeServiceClient(keys);

let userA: { userId: string; client: SupabaseClient };
let userB: { userId: string; client: SupabaseClient };
let householdA: string;
let householdB: string;
let receiptA: string;

beforeAll(async () => {
  const stamp = Date.now();
  userA = await makeUserClient(keys, service, `a_${stamp}@test.local`, "password123");
  userB = await makeUserClient(keys, service, `b_${stamp}@test.local`, "password123");

  // Hogar A con su miembro y un recibo (sembrado con service_role)
  const { data: hA, error: hAErr } = await service
    .from("households")
    .insert({ name: "Hogar A", created_by: userA.userId })
    .select("id")
    .single();
  if (hAErr) throw hAErr;
  householdA = hA.id;
  await service.from("household_members").insert({
    household_id: householdA,
    user_id: userA.userId,
    role: "owner",
  });
  const { data: rA, error: rAErr } = await service
    .from("receipts")
    .insert({ household_id: householdA, created_by: userA.userId, source: "manual" })
    .select("id")
    .single();
  if (rAErr) throw rAErr;
  receiptA = rA.id;

  await service.from("receipt_items").insert({
    receipt_id: receiptA,
    raw_name: "LECHE DESLAC 1L",
    quantity: "1",
    unit_price: "5000",
    total_price: "5000",
  });

  // Hogar B con su miembro
  const { data: hB, error: hBErr } = await service
    .from("households")
    .insert({ name: "Hogar B", created_by: userB.userId })
    .select("id")
    .single();
  if (hBErr) throw hBErr;
  householdB = hB.id;
  await service.from("household_members").insert({
    household_id: householdB,
    user_id: userB.userId,
    role: "owner",
  });
});

afterAll(async () => {
  // Limpieza con service_role (orden respeta las FKs)
  await service.from("receipt_items").delete().eq("receipt_id", receiptA);
  await service.from("receipts").delete().eq("household_id", householdA);
  await service.from("household_members").delete().eq("household_id", householdA);
  await service.from("household_members").delete().eq("household_id", householdB);
  await service.from("households").delete().in("id", [householdA, householdB]);
  await service.auth.admin.deleteUser(userA.userId);
  await service.auth.admin.deleteUser(userB.userId);
});

describe("RLS: aislamiento entre hogares", () => {
  it("A ve su propio recibo", async () => {
    const { data, error } = await userA.client
      .from("receipts")
      .select("id")
      .eq("id", receiptA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("B NO ve el recibo de A", async () => {
    const { data, error } = await userB.client
      .from("receipts")
      .select("id")
      .eq("id", receiptA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS filtra: 0 filas, no error
  });

  it("B NO puede insertar un recibo en el hogar de A", async () => {
    const { error } = await userB.client
      .from("receipts")
      .insert({ household_id: householdA, created_by: userB.userId, source: "manual" });
    expect(error).not.toBeNull(); // viola la policy de INSERT
  });

  it("A NO ve el hogar de B", async () => {
    const { data, error } = await userA.client
      .from("households")
      .select("id")
      .eq("id", householdB);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe("RLS: scope heredado en receipt_items", () => {
  it("A ve los items de su recibo", async () => {
    const { data, error } = await userA.client
      .from("receipt_items")
      .select("id")
      .eq("receipt_id", receiptA);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("B NO ve los items del recibo de A", async () => {
    const { data, error } = await userB.client
      .from("receipt_items")
      .select("id")
      .eq("receipt_id", receiptA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe("RLS: seguridad de household_members (sin auto-join)", () => {
  it("B NO puede auto-unirse al hogar de A", async () => {
    const { error } = await userB.client.from("household_members").insert({
      household_id: householdA,
      user_id: userB.userId,
      role: "member",
    });
    expect(error).not.toBeNull(); // la policy bloquea el self-join a hogar ajeno

    // Y como consecuencia B sigue sin ver el recibo de A
    const { data } = await userB.client
      .from("receipts")
      .select("id")
      .eq("id", receiptA);
    expect(data).toHaveLength(0);
  });
});

describe("RLS: hogar compartido", () => {
  it("al unir B al hogar A, B ve el recibo de A", async () => {
    // Unir B al hogar A con service_role (simula invitación aceptada)
    const { error: joinErr } = await service.from("household_members").insert({
      household_id: householdA,
      user_id: userB.userId,
      role: "member",
    });
    expect(joinErr).toBeNull();

    // Ahora B sí ve el recibo de A
    const { data, error } = await userB.client
      .from("receipts")
      .select("id")
      .eq("id", receiptA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // Limpieza: sacar a B del hogar A para no afectar otros tests
    await service
      .from("household_members")
      .delete()
      .eq("household_id", householdA)
      .eq("user_id", userB.userId);
  });
});
