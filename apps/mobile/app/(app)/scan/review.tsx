import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isAIError, type AIError, type ImageMimeType, type ParseResult, type ParseResultItem } from "@oraculo/core";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { ProductPicker, type ProductPickerValue } from "../../../components/ProductPicker";
import { getActiveHousehold } from "../../../services/household";
import { getCanonicalHints, resolveActiveProvider } from "../../../services/ai/provider";
import { createScannedReceipt, type ScannedReceiptItem } from "../../../services/receipts";

interface ItemDraft {
  rawName: string;
  quantity: string;
  totalPrice: string;
  unitPrice: string;
  regularPrice: string | null;
  isPromo: boolean;
  unit: "lt" | "kg" | "un" | null;
  categoryId: string | null;
  canonical: ProductPickerValue | null;
}

function toDraft(item: ParseResultItem, hints: Map<string, string>): ItemDraft {
  const canonical: ProductPickerValue | null = item.suggested_canonical_id
    ? {
        canonicalId: item.suggested_canonical_id,
        name: hints.get(item.suggested_canonical_id) ?? "Sugerido",
        aliasNormalized: item.raw_name.toUpperCase(),
        layer: "fuzzy_confirmed",
      }
    : null;
  return {
    rawName: item.raw_name,
    quantity: item.quantity,
    totalPrice: item.total_price,
    unitPrice: item.unit_price,
    regularPrice: item.regular_price,
    isPromo: item.is_promo,
    unit: item.unit,
    categoryId: null,
    canonical,
  };
}

function makeAIError(kind: AIError["kind"], message: string): AIError {
  const e = new Error(message) as AIError;
  e.kind = kind;
  return e;
}

function messageFor(e: AIError): string {
  switch (e.kind) {
    case "auth": return "Tu API key parece inválida. Probá cambiarla desde Perfil.";
    case "rate_limit": return "El proveedor IA alcanzó su límite. Cambiá de proveedor en Perfil o reintentá luego.";
    case "timeout": return "La IA tardó demasiado. Intentá de nuevo con mejor red.";
    case "network": return "Sin conexión a la IA. Verificá tu red.";
    case "parse": return "La IA devolvió un formato inesperado. Probá una foto más clara o capturá manual.";
    case "unreadable": return "No pude leer la factura. Probá una foto más nítida.";
    default: return e.message;
  }
}

const inputStyle = { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 } as const;

export default function ReviewParsed() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageBase64: string; mimeType: string }>();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<AIError | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dataUrl = useMemo(
    () => `data:${params.mimeType ?? "image/jpeg"};base64,${params.imageBase64 ?? ""}`,
    [params.imageBase64, params.mimeType],
  );

  useEffect(() => {
    (async () => {
      try {
        const h = await getActiveHousehold();
        if (!h) {
          setError(makeAIError("unknown", "No hay hogar activo"));
          setState("error");
          return;
        }
        setHouseholdId(h.id);
        const { provider, apiKey } = await resolveActiveProvider();
        const hints = await getCanonicalHints(h.id);
        const hintMap = new Map(hints.map((c) => [c.id, c.name]));
        const result = await provider.parseReceipt({
          imageBase64: params.imageBase64 ?? "",
          imageMimeType: (params.mimeType ?? "image/jpeg") as ImageMimeType,
          canonicalHints: hints,
          apiKey,
        });
        console.info("[ai_scan.success]", {
          provider: provider.name,
          items_count: result.items.length,
          suggested_matches: result.items.filter((i) => i.suggested_canonical_id).length,
        });
        setParsed(result);
        setItems(result.items.map((it) => toDraft(it, hintMap)));
        setState("ready");
      } catch (e) {
        if (isAIError(e)) {
          console.info("[ai_scan.error]", { provider: e.provider, kind: e.kind });
          setError(e);
        } else {
          setError(makeAIError("unknown", e instanceof Error ? e.message : "Error"));
        }
        setState("error");
      }
    })();
  }, [params.imageBase64, params.mimeType]);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        if (patch.rawName !== undefined && patch.rawName !== it.rawName) {
          return { ...it, ...patch, canonical: null };
        }
        return { ...it, ...patch };
      }),
    );
  }

  async function onSave() {
    setSaveError(null);
    if (!householdId || !parsed) return;
    setBusy(true);
    try {
      const scanned: ScannedReceiptItem[] = items.map((i) => ({
        rawName: i.rawName,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        regularPrice: i.regularPrice,
        isPromo: i.isPromo,
        totalPrice: i.totalPrice,
        categoryId: i.categoryId,
        canonicalProductId: i.canonical?.canonicalId ?? null,
        aliasNormalized: i.canonical?.aliasNormalized ?? null,
      }));
      await createScannedReceipt(householdId, {
        storeId: null,
        purchasedAt: parsed.purchased_at,
        currency: parsed.currency,
        items: scanned,
      });
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator size="large" />
        <Text>Leyendo factura con IA…</Text>
      </View>
    );
  }

  if (state === "error" && error) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>No pudimos procesar la foto</Text>
        <Text style={{ color: "#666" }}>{messageFor(error)}</Text>
        <Pressable onPress={() => router.back()} style={{ padding: 12, alignItems: "center", backgroundColor: "#111", borderRadius: 8 }}>
          <Text style={{ color: "#fff" }}>Volver</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!parsed || !householdId) return null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Revisar factura</Text>
      <Image source={{ uri: dataUrl }} style={{ width: 120, height: 120, borderRadius: 8 }} resizeMode="cover" />
      <View>
        <Text style={{ color: "#666" }}>Tienda: {parsed.store_name ?? "(sin detectar)"}</Text>
        <Text style={{ color: "#666" }}>Fecha: {parsed.purchased_at}</Text>
        <Text style={{ color: "#666" }}>Total IA: {parsed.total}</Text>
      </View>
      {items.map((item, index) => (
        <View key={index} style={{ borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, gap: 8 }}>
          <TextInput
            placeholder="Nombre"
            value={item.rawName}
            onChangeText={(t) => updateItem(index, { rawName: t })}
            style={inputStyle}
          />
          <ProductPicker
            householdId={householdId}
            rawName={item.rawName}
            defaultCategoryId={item.categoryId}
            value={item.canonical}
            onChange={(c) => updateItem(index, { canonical: c })}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              placeholder="Cantidad"
              keyboardType="numeric"
              value={item.quantity}
              onChangeText={(t) => updateItem(index, { quantity: t })}
              style={{ flex: 1, ...inputStyle }}
            />
            <TextInput
              placeholder="Total"
              keyboardType="numeric"
              value={item.totalPrice}
              onChangeText={(t) => updateItem(index, { totalPrice: t })}
              style={{ flex: 1, ...inputStyle }}
            />
          </View>
          {item.isPromo ? (
            <Text style={{ color: "#16a34a" }}>🏷️ Promo (regular: {item.regularPrice ?? "?"})</Text>
          ) : null}
          <CategoryPicker
            householdId={householdId}
            value={item.categoryId}
            onChange={(c) => updateItem(index, { categoryId: c })}
          />
        </View>
      ))}
      {saveError ? <Text style={{ color: "red" }}>{saveError}</Text> : null}
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
