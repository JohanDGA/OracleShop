import { sumAmounts } from "@oraculo/core";
import { manualReceiptSchema } from "@oraculo/validations";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { ProductPicker, type ProductPickerValue } from "../../../components/ProductPicker";
import { getActiveHousehold } from "../../../services/household";
import { createManualReceipt } from "../../../services/receipts";

interface ItemDraft {
  rawName: string;
  quantity: string;
  totalPrice: string;
  categoryId: string | null;
  canonical: ProductPickerValue | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyItem: ItemDraft = { rawName: "", quantity: "1", totalPrice: "", categoryId: null, canonical: null };

export default function NewReceipt() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [purchasedAt] = useState(todayIso());
  const [items, setItems] = useState<ItemDraft[]>([{ ...emptyItem }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getActiveHousehold().then((h) => setHouseholdId(h?.id ?? null)).catch(() => setHouseholdId(null));
  }, []);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        // Si el rawName cambia, invalidar canonical (el alias no aplica al nuevo texto).
        if (patch.rawName !== undefined && patch.rawName !== it.rawName) {
          return { ...it, ...patch, canonical: null };
        }
        return { ...it, ...patch };
      }),
    );
  }
  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }
  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const total = sumAmounts(items.map((i) => (i.totalPrice.trim() === "" ? "0" : i.totalPrice)));

  async function onSave() {
    setError(null);
    if (!householdId) {
      setError("No hay hogar activo");
      return;
    }
    const payload = {
      storeId: null,
      purchasedAt,
      currency: "COP",
      items: items.map((i) => ({
        rawName: i.rawName,
        quantity: i.quantity,
        unitPrice: i.totalPrice,
        totalPrice: i.totalPrice,
        categoryId: i.categoryId,
        canonicalProductId: i.canonical?.canonicalId ?? null,
        aliasNormalized: i.canonical?.aliasNormalized ?? null,
      })),
    };
    const parsed = manualReceiptSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setBusy(true);
    try {
      await createManualReceipt(householdId, parsed.data);
      // Instrumentación: emitir match_resolved 'manual' por items que se guardaron sin canonical (spec §6).
      for (const it of items) {
        if (!it.canonical) console.info("[match_resolved]", { layer: "manual" });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar la factura");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Nueva factura</Text>
      <Text style={{ color: "#666" }}>Fecha: {purchasedAt}</Text>

      {items.map((item, index) => (
        <View key={index} style={{ borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "500" }}>Ítem {index + 1}</Text>
            {items.length > 1 ? (
              <Pressable onPress={() => removeItem(index)}>
                <Text style={{ color: "#b00" }}>Quitar</Text>
              </Pressable>
            ) : null}
          </View>
          <TextInput
            placeholder="Nombre"
            value={item.rawName}
            onChangeText={(t) => updateItem(index, { rawName: t })}
            style={inputStyle}
          />
          {householdId ? (
            <ProductPicker
              householdId={householdId}
              rawName={item.rawName}
              defaultCategoryId={item.categoryId}
              value={item.canonical}
              onChange={(c) => updateItem(index, { canonical: c })}
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              placeholder="Cantidad"
              keyboardType="numeric"
              value={item.quantity}
              onChangeText={(t) => updateItem(index, { quantity: t })}
              style={{ flex: 1, ...inputStyle }}
            />
            <TextInput
              placeholder="Total (COP)"
              keyboardType="numeric"
              value={item.totalPrice}
              onChangeText={(t) => updateItem(index, { totalPrice: t })}
              style={{ flex: 1, ...inputStyle }}
            />
          </View>
          {householdId ? (
            <CategoryPicker householdId={householdId} value={item.categoryId} onChange={(c) => updateItem(index, { categoryId: c })} />
          ) : null}
        </View>
      ))}

      <Pressable onPress={addItem} style={{ borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 12, alignItems: "center" }}>
        <Text>+ Agregar ítem</Text>
      </Pressable>

      <Text style={{ fontSize: 16, fontWeight: "600" }}>Total: {total}</Text>
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Pressable
        onPress={onSave}
        disabled={busy}
        style={{ backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Guardar factura</Text>}
      </Pressable>
    </ScrollView>
  );
}

const inputStyle = { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 } as const;
