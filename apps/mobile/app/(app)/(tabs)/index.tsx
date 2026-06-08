import { formatCOP, monthRange } from "@oraculo/core";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { currentYearMonth, monthLabel } from "../../../lib/dates";
import {
  listMonthEntries,
  softDeleteManualExpense,
  softDeleteReceipt,
  type ExpenseEntry,
} from "../../../services/expenses";
import { getActiveHousehold } from "../../../services/household";

export default function Gastos() {
  const router = useRouter();
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { year, month } = currentYearMonth();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await getActiveHousehold();
      if (!h) {
        setEntries([]);
        return;
      }
      setEntries(await listMonthEntries(h.id, monthRange(year, month)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function confirmDelete(entry: ExpenseEntry) {
    Alert.alert("Eliminar", `¿Eliminar "${entry.title}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            if (entry.kind === "manual") await softDeleteManualExpense(entry.id);
            else await softDeleteReceipt(entry.id);
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error al eliminar");
          }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
        Gastos — {monthLabel(year, month)}
      </Text>
      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={{ color: "red" }}>{error}</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => `${e.kind}:${e.id}`}
          ListEmptyComponent={<Text style={{ color: "#666" }}>Sin gastos este mes.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => confirmDelete(item)}
              style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#eee" }}
            >
              <View>
                <Text style={{ fontWeight: "500" }}>{item.title}</Text>
                <Text style={{ color: "#888", fontSize: 12 }}>
                  {item.date} · {item.kind === "receipt" ? "Factura" : "Gasto"}
                </Text>
              </View>
              <Text style={{ fontWeight: "600" }}>{formatCOP(item.amount)}</Text>
            </Pressable>
          )}
        />
      )}

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <Pressable
          onPress={() => router.push("/(app)/expense/new")}
          style={{ flex: 1, backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
        >
          <Text style={{ color: "#fff" }}>+ Gasto</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(app)/receipt/new")}
          style={{ flex: 1, backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center" }}
        >
          <Text style={{ color: "#fff" }}>+ Factura</Text>
        </Pressable>
      </View>
    </View>
  );
}
