import { computeMonthlySummary, formatCOP, monthRange, shiftMonth, type MonthlySummary } from "@oraculo/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { currentYearMonth, monthLabel } from "../../../lib/dates";
import { getActiveHousehold } from "../../../services/household";
import { listCategories, type Category } from "../../../services/categories";
import { getMonthlySpending } from "../../../services/summary";

export default function Dashboard() {
  const initial = currentYearMonth();
  const [ym, setYm] = useState(initial);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [cats, setCats] = useState<Record<string, Category>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await getActiveHousehold();
      if (!h) {
        setSummary({ total: "0.0000", byCategory: [] });
        return;
      }
      const [lines, categories] = await Promise.all([
        getMonthlySpending(h.id, monthRange(ym.year, ym.month)),
        listCategories(),
      ]);
      const byId: Record<string, Category> = {};
      for (const c of categories) byId[c.id] = c;
      setCats(byId);
      setSummary(computeMonthlySummary(lines));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [ym]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function changeMonth(delta: number) {
    setYm((prev) => shiftMonth(prev.year, prev.month, delta));
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => changeMonth(-1)}><Text style={{ fontSize: 22 }}>‹</Text></Pressable>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>{monthLabel(ym.year, ym.month)}</Text>
        <Pressable onPress={() => changeMonth(1)}><Text style={{ fontSize: 22 }}>›</Text></Pressable>
      </View>

      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={{ color: "red" }}>{error}</Text>
      ) : summary ? (
        <View style={{ gap: 16 }}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: "#666" }}>Total del mes</Text>
            <Text style={{ fontSize: 30, fontWeight: "700" }}>{formatCOP(summary.total)}</Text>
          </View>
          {summary.byCategory.length === 0 ? (
            <Text style={{ color: "#666", textAlign: "center" }}>Sin gastos este mes.</Text>
          ) : (
            summary.byCategory.map((c) => {
              const cat = c.categoryId ? cats[c.categoryId] : undefined;
              const label = cat?.name ?? "Sin categoría";
              const color = cat?.color ?? "#9ca3af";
              return (
                <View key={c.categoryId ?? "none"} style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text>{label}</Text>
                    <Text style={{ color: "#444" }}>{formatCOP(c.total)} · {c.percent}%</Text>
                  </View>
                  <View style={{ height: 10, backgroundColor: "#eee", borderRadius: 5, overflow: "hidden" }}>
                    <View style={{ width: `${c.percent}%`, height: 10, backgroundColor: color }} />
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}
