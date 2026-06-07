import { signUpSchema } from "@oraculo/validations";
import { Link } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { bootstrapHousehold } from "../../services/household";
import { supabase } from "../../lib/supabase";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    const parsed = signUpSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setBusy(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp(parsed.data);
      if (signErr || !data.user) {
        setError(signErr?.message ?? "No se pudo registrar");
        return;
      }
      // Con confirmación de email desactivada en local, hay sesión inmediata.
      const defaultName = `Hogar de ${parsed.data.email.split("@")[0]}`;
      await bootstrapHousehold(data.user.id, defaultName);
      // El onAuthStateChange + gate redirigen a (app).
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Crear cuenta</Text>
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={{ backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Registrarme</Text>}
      </Pressable>
      <Link href="/(auth)/sign-in" style={{ textAlign: "center", marginTop: 8 }}>
        ¿Ya tienes cuenta? Inicia sesión
      </Link>
    </View>
  );
}
