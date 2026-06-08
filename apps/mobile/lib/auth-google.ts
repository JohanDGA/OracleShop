import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

/**
 * Inicia sesión con Google vía Supabase (flujo PKCE). Funciona en Expo Web y
 * nativo: abre el navegador, captura el redirect y canjea el `code` por sesión.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("No se obtuvo URL de autorización de Google");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") {
    // El usuario canceló o cerró el navegador.
    return;
  }

  const url = new URL(result.url);
  const code = url.searchParams.get("code");
  if (!code) throw new Error("Redirect de Google sin 'code'");

  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) throw new Error(exchangeErr.message);
  // El gate redirige a (app) cuando onAuthStateChange detecta la sesión.
}
