import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import { createProvider, type ProviderName } from "@oraculo/core";
import { setKey } from "../services/ai/keystore";

interface Props {
  visible: boolean;
  provider: ProviderName;
  onClose: () => void;
  onSaved: () => void;
}

const INSTRUCTIONS: Record<ProviderName, { label: string; url: string; help: string }> = {
  gemini: {
    label: "Gemini (Google AI Studio)",
    url: "https://aistudio.google.com/apikey",
    help: "Crea una API key gratis en Google AI Studio y pégala aquí.",
  },
  claude: {
    label: "Claude (Anthropic)",
    url: "https://console.anthropic.com/settings/keys",
    help: "Generala en console.anthropic.com → API Keys.",
  },
  openai: {
    label: "OpenAI (ChatGPT API)",
    url: "https://platform.openai.com/api-keys",
    help: "Generala en platform.openai.com → API keys.",
  },
};

export function AIKeyModal({ visible, provider, onClose, onSaved }: Props) {
  const [key, setKeyValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = INSTRUCTIONS[provider];

  async function onSave() {
    setError(null);
    if (!key.trim()) {
      setError("La key no puede estar vacía");
      return;
    }
    setBusy(true);
    try {
      // Smoke test: instanciar el provider confirma que la factory soporta el name.
      // La validación real de la key ocurre en el primer scan.
      createProvider(provider);
      await setKey(provider, key.trim());
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 20, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>API key — {info.label}</Text>
          <Text style={{ color: "#444" }}>{info.help}</Text>
          <Text style={{ color: "#2563eb" }} selectable>{info.url}</Text>
          <TextInput
            placeholder="Pegá tu API key"
            value={key}
            onChangeText={setKeyValue}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }}
          />
          {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onClose} style={{ flex: 1, padding: 12, alignItems: "center" }}>
              <Text>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={busy}
              style={{ flex: 1, padding: 12, alignItems: "center", backgroundColor: "#111", borderRadius: 8 }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Guardar</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
