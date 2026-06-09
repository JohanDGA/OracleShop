import { categoryCreateSchema } from "@oraculo/validations";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { createCategory, listCategories, type Category } from "../services/categories";

const SWATCHES = ["#16a34a", "#2563eb", "#f97316", "#dc2626", "#7c3aed", "#db2777", "#ca8a04", "#6b7280"];

interface Props {
  householdId: string;
  value: string | null;
  onChange: (categoryId: string | null) => void;
}

/** Selector horizontal de categorías + "Nueva" (crea inline). */
export function CategoryPicker({ householdId, value, onChange }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0] ?? "#6b7280");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  async function onCreate() {
    const parsed = categoryCreateSchema.safeParse({ name, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    try {
      const created = await createCategory(householdId, parsed.data.name, parsed.data.color);
      setCategories((prev) => [...prev, created]);
      onChange(created.id);
      setModalOpen(false);
      setName("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: "row" }}>
        {categories.map((c) => {
          const selected = c.id === value;
          return (
            <Pressable
              key={c.id}
              onPress={() => onChange(selected ? null : c.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                marginRight: 8,
                backgroundColor: selected ? c.color : "#eee",
              }}
            >
              <Text style={{ color: selected ? "#fff" : "#333" }}>{c.name}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setModalOpen(true)}
          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: "#999" }}
        >
          <Text>+ Nueva</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "600" }}>Nueva categoría</Text>
            <TextInput
              placeholder="Nombre"
              value={name}
              onChangeText={setName}
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {SWATCHES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setColor(s)}
                  style={{
                    width: 32, height: 32, borderRadius: 16, backgroundColor: s,
                    borderWidth: color === s ? 3 : 0, borderColor: "#111",
                  }}
                />
              ))}
            </View>
            {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 12, justifyContent: "flex-end" }}>
              <Pressable onPress={() => setModalOpen(false)}><Text>Cancelar</Text></Pressable>
              <Pressable onPress={onCreate}><Text style={{ fontWeight: "600" }}>Crear</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
