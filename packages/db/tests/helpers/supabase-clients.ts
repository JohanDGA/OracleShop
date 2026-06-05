import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Polyfill mínimo de WebSocket para Node < 22.
// supabase-js construye un RealtimeClient de forma "eager" dentro de createClient,
// y su WebSocketFactory lanza si no encuentra un constructor global de WebSocket.
// Estos tests NUNCA usan Realtime (solo auth + PostgREST), así que basta con
// exponer un constructor global: jamás se instancia porque no abrimos canales.
// Lanzar en el constructor garantiza que un uso accidental de Realtime falle ruidosamente.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
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
  const json = JSON.parse(raw) as Record<string, string>;
  return {
    apiUrl: json.API_URL,
    anonKey: json.ANON_KEY,
    serviceRoleKey: json.SERVICE_ROLE_KEY,
  };
}

/** Cliente con service_role: bypasea RLS. Úsalo solo para sembrar/limpiar. */
export function makeServiceClient(keys: LocalKeys): SupabaseClient {
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
