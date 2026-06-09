import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Polyfill mínimo de WebSocket para Node < 22.
 *
 * supabase-js construye un RealtimeClient de forma "eager" dentro de createClient,
 * y su WebSocketFactory lanza si no encuentra un constructor global de WebSocket.
 * Estos tests NUNCA usan Realtime (solo auth + PostgREST), así que basta con
 * exponer un constructor global: jamás se instancia porque no abrimos canales.
 * Lanzar en el constructor garantiza que un uso accidental de Realtime falle ruidosamente.
 *
 * IMPORTANTE: esto muta `globalThis.WebSocket`. Se hace de forma EXPLÍCITA llamando
 * a esta función desde las fábricas de cliente (no como side-effect del import), y
 * solo si no existe ya un WebSocket nativo (Node 22+ queda intacto). En cuanto el
 * proyecto suba a Node 22+ o instale `ws`, esta función se vuelve un no-op.
 */
function ensureWebSocketPolyfill(): void {
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== "undefined") return;
  class UnsupportedWebSocket {
    constructor() {
      throw new Error(
        "Supabase Realtime no está soportado en estos tests de RLS (Node < 22 sin WebSocket nativo).",
      );
    }
  }
  (globalThis as { WebSocket?: unknown }).WebSocket = UnsupportedWebSocket;
}

interface LocalKeys {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

/**
 * Lee las URLs y keys del stack Supabase local mediante `supabase status -o json`.
 * Requiere que `supabase start` esté corriendo.
 */
export function getLocalKeys(): LocalKeys {
  const raw = execSync("pnpm exec supabase status -o json", {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
  const json = JSON.parse(raw) as Record<string, string | undefined>;
  const apiUrl = json.API_URL;
  const anonKey = json.ANON_KEY;
  const serviceRoleKey = json.SERVICE_ROLE_KEY;
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "No se pudieron leer API_URL/ANON_KEY/SERVICE_ROLE_KEY de `supabase status -o json`. " +
        "¿Está corriendo `supabase start`?",
    );
  }
  return { apiUrl, anonKey, serviceRoleKey };
}

/** Cliente con service_role: bypasea RLS. Úsalo solo para sembrar/limpiar. */
export function makeServiceClient(keys: LocalKeys): SupabaseClient {
  ensureWebSocketPolyfill();
  return createClient(keys.apiUrl, keys.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Crea un usuario confirmado y devuelve su id + un cliente autenticado como él. */
export async function makeUserClient(
  keys: LocalKeys,
  service: SupabaseClient,
  email: string,
  password: string,
): Promise<{ userId: string; client: SupabaseClient }> {
  ensureWebSocketPolyfill();
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`No se pudo crear usuario ${email}: ${createErr?.message}`);
  }

  const client = createClient(keys.apiUrl, keys.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) {
    throw new Error(`No se pudo autenticar ${email}: ${signInErr.message}`);
  }

  return { userId: created.user.id, client };
}

/**
 * Borra TODA la huella de un usuario y luego el usuario, con service_role.
 * Necesario porque las FK a auth.users no tienen ON DELETE CASCADE y el trigger
 * handle_new_user (0005) crea un hogar+membresía+settings por usuario; sin esta
 * limpieza, auth.admin.deleteUser falla en silencio y deja datos residuales.
 * Orden FK-seguro: por cada hogar creado por el usuario borra items→receipts→
 * manual_expenses→members; luego user_settings y membresías del usuario; luego
 * los hogares; finalmente el usuario (con el error surfaceado).
 */
export async function cleanupUser(service: SupabaseClient, userId: string): Promise<void> {
  const { data: households } = await service
    .from("households")
    .select("id")
    .eq("created_by", userId);
  const householdIds = (households ?? []).map((h) => h.id as string);

  for (const hid of householdIds) {
    const { data: receipts } = await service.from("receipts").select("id").eq("household_id", hid);
    for (const r of receipts ?? []) {
      await service.from("receipt_items").delete().eq("receipt_id", r.id as string);
    }
    await service.from("receipts").delete().eq("household_id", hid);
    await service.from("manual_expenses").delete().eq("household_id", hid);
    // Borrar product_aliases que pertenezcan a canonical_products del hogar antes de tocar receipts.
    const { data: canonicals } = await service
      .from("canonical_products")
      .select("id")
      .eq("household_id", hid);
    for (const cp of canonicals ?? []) {
      await service.from("product_aliases").delete().eq("canonical_product_id", cp.id as string);
    }
    await service.from("canonical_products").delete().eq("household_id", hid);
    await service.from("household_members").delete().eq("household_id", hid);
  }

  await service.from("user_settings").delete().eq("user_id", userId);
  await service.from("household_members").delete().eq("user_id", userId);
  if (householdIds.length > 0) {
    await service.from("households").delete().in("id", householdIds);
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`cleanupUser(${userId}): deleteUser falló: ${error.message}`);
  }
}
