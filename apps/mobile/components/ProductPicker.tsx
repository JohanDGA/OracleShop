import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { createCanonicalSchema, type CreateCanonicalInput } from "@oraculo/validations";
import { matchProduct, type MatchCandidate, type MatchResult } from "../services/match";
import { createCanonical } from "../services/canonicals";
import { CategoryPicker } from "./CategoryPicker";

export interface ProductPickerValue {
  canonicalId: string;
  name: string;
  aliasNormalized: string;
  /** De qué capa salió la resolución (instrumentación spec §6). */
  layer: "exact" | "fuzzy_confirmed" | "created";
}

interface Props {
  householdId: string;
  rawName: string;
  defaultCategoryId: string | null;
  value: ProductPickerValue | null;
  onChange: (next: ProductPickerValue | null) => void;
}

const DEBOUNCE_MS = 400;

export function ProductPicker({ householdId, rawName, defaultCategoryId, value, onChange }: Props) {
  const [result, setResult] = useState<MatchResult>({ exact: null, fuzzy: [] });
  const [normalized, setNormalized] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!rawName.trim()) {
      setResult({ exact: null, fuzzy: [] });
      setNormalized("");
      return;
    }
    const queryAtDispatch = rawName;
    timer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { normalized: n, result: r } = await matchProduct(householdId, queryAtDispatch);
        // Si el usuario siguió tecleando, descartar este resultado (stale).
        if (queryAtDispatch !== rawName) return;
        setNormalized(n);
        setResult(r);
      } catch (e) {
        if (queryAtDispatch !== rawName) return;
        setError(e instanceof Error ? e.message : "Error en match");
      } finally {
        if (queryAtDispatch === rawName) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [rawName, householdId]);

  function pick(c: MatchCandidate, layer: "exact" | "fuzzy_confirmed") {
    onChange({ canonicalId: c.canonicalId, name: c.name, aliasNormalized: normalized, layer });
    // Instrumentación — Hito 7 lo conectará a Sentry/dashboard.
    console.info("[match_resolved]", { layer });
  }

  if (value) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: "#0a7f1a" }}>✓ {value.name}</Text>
        <Pressable onPress={() => onChange(null)}>
          <Text style={{ color: "#666" }}>cambiar</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) return <ActivityIndicator />;
  if (error) return <Text style={{ color: "red" }}>{error}</Text>;
  if (!rawName.trim()) return <Text style={{ color: "#999" }}>Escribe el nombre para sugerir un producto</Text>;

  const exact = result.exact;

  return (
    <View style={{ gap: 6 }}>
      {exact ? (
        <Pressable onPress={() => pick(exact, "exact")} style={chipStyle("#dcfce7")}>
          <Text style={{ color: "#166534" }}>✓ {exact.name}</Text>
        </Pressable>
      ) : result.fuzzy.length > 0 ? (
        result.fuzzy.map((c) => (
          <Pressable key={c.canonicalId} onPress={() => pick(c, "fuzzy_confirmed")} style={chipStyle("#fef9c3")}>
            <Text style={{ color: "#854d0e" }}>
              ≈ {c.name}
              {c.score ? `  (${Math.round(c.score * 100)}%)` : ""}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={{ color: "#999" }}>Sin coincidencias</Text>
      )}
      <Pressable onPress={() => setShowCreate(true)} style={chipStyle("#e5e7eb")}>
        <Text style={{ color: "#111" }}>+ Crear producto nuevo</Text>
      </Pressable>

      {showCreate ? (
        <CreateCanonicalForm
          householdId={householdId}
          defaultName={rawName}
          defaultCategoryId={defaultCategoryId}
          onCancel={() => setShowCreate(false)}
          onCreated={(canon) => {
            setShowCreate(false);
            onChange({ canonicalId: canon.id, name: canon.name, aliasNormalized: normalized, layer: "created" });
            console.info("[match_resolved]", { layer: "created" });
          }}
        />
      ) : null}
    </View>
  );
}

function chipStyle(bg: string) {
  return { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: bg, borderRadius: 8 };
}

interface CreateFormProps {
  householdId: string;
  defaultName: string;
  defaultCategoryId: string | null;
  onCancel: () => void;
  onCreated: (c: { id: string; name: string }) => void;
}

function CreateCanonicalForm({ householdId, defaultName, defaultCategoryId, onCancel, onCreated }: CreateFormProps) {
  const [name, setName] = useState(defaultName);
  const [brand, setBrand] = useState("");
  const [presentation, setPresentation] = useState("");
  const [unit, setUnit] = useState<"lt" | "kg" | "un">("un");
  const [unitQuantity, setUnitQuantity] = useState("1");
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const input: CreateCanonicalInput = {
      name,
      brand: brand.trim() || null,
      presentation: presentation.trim() || null,
      unit,
      unitQuantity,
      categoryId,
    };
    const parsed = createCanonicalSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setBusy(true);
    try {
      const canon = await createCanonical(householdId, parsed.data);
      onCreated(canon);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, gap: 8, marginTop: 6 }}>
      <Text style={{ fontWeight: "600" }}>Crear producto</Text>
      <TextInput placeholder="Nombre" value={name} onChangeText={setName} style={inputStyle} />
      <TextInput placeholder="Marca (opcional)" value={brand} onChangeText={setBrand} style={inputStyle} />
      <TextInput placeholder="Presentación (opcional)" value={presentation} onChangeText={setPresentation} style={inputStyle} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["lt", "kg", "un"] as const).map((u) => (
          <Pressable
            key={u}
            onPress={() => setUnit(u)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor: unit === u ? "#111" : "#eee",
            }}
          >
            <Text style={{ color: unit === u ? "#fff" : "#111" }}>{u}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        placeholder="Cantidad por unidad (ej. 1, 0.9, 0.5)"
        keyboardType="numeric"
        value={unitQuantity}
        onChangeText={(t) => setUnitQuantity(t.replace(/[^0-9.]/g, ""))}
        style={inputStyle}
      />
      <CategoryPicker householdId={householdId} value={categoryId} onChange={setCategoryId} />
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={onCancel} style={{ flex: 1, padding: 10, alignItems: "center" }}>
          <Text>Cancelar</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={busy}
          style={{ flex: 1, padding: 10, alignItems: "center", backgroundColor: "#111", borderRadius: 8 }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Crear</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const inputStyle = { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 } as const;
