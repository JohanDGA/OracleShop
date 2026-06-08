import { manualExpenseSchema } from "@oraculo/validations";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { addManualExpense } from "../../../services/expenses";
import { getActiveHousehold } from "../../../services/household";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewExpense() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [occurredAt] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getActiveHousehold().then((h) => setHouseholdId(h?.id ?? null)).catch(() => setHouseholdId(null));
  }, []);

  async function onSave() {
    setError(null);
    const parsed = manualExpenseSchema.safeParse({ amount, categoryId, description: description || undefined, occurredAt });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    if (!householdId) {
      setError("No hay hogar activo");
      return;
    }
    setBusy(true);
    try {
      await addManualExpense({
        householdId,
        amount: parsed.data.amount,
        categoryId: parsed.data.categoryId,
        description: parsed.data.description,
        occurredAt: parsed.data.occurredAt,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Nuevo gasto</Text>
      <TextInput
        placeholder="Monto (COP)"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <Text>Categoría</Text>
      {householdId ? (
        <CategoryPicker householdId={householdId} value={categoryId} onChange={setCategoryId} />
      ) : (
        <ActivityIndicator />
      )}
      <TextInput
        placeholder="Descripción (opcional)"
        value={description}
        onChangeText={setDescription}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <Text style={{ color: "#666" }}>Fecha: {occurredAt}</Text>
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Pressable
        onPress={onSave}
        disabled={busy}
        style={{ backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Guardar</Text>}
      </Pressable>
    </View>
  );
}
