import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { getActiveHousehold, type Household } from "../../services/household";

export default function Home() {
  const { session } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveHousehold()
      .then((h) => setHousehold(h))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Hola</Text>
      <Text>Sesión: {session?.user.email ?? "—"}</Text>
      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={{ color: "red" }}>{error}</Text>
      ) : (
        <Text>Hogar activo: {household?.name ?? "(sin hogar)"}</Text>
      )}
      <Pressable
        onPress={() => void supabase.auth.signOut()}
        style={{ backgroundColor: "#b00", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: "#fff" }}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}
