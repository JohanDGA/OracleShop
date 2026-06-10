import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { resolveActiveProvider } from "../services/ai/provider";
import { captureFromCamera, captureFromGallery } from "../services/ai/capture";
import { AIKeyModal } from "./AIKeyModal";
import type { ProviderName } from "@oraculo/core";

export function ScanButton() {
  const router = useRouter();
  const [needsKeyFor, setNeedsKeyFor] = useState<ProviderName | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await resolveActiveProvider();
    } catch (e) {
      const err = e as Error & { code?: string; provider?: ProviderName };
      if (err.code === "NO_KEY" && err.provider) {
        setNeedsKeyFor(err.provider);
        setBusy(false);
        return;
      }
      Alert.alert("No se pudo iniciar el escaneo", err.message);
      setBusy(false);
      return;
    }
    askSource();
  }

  function askSource() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancelar", "Tomar foto", "Elegir de galería"], cancelButtonIndex: 0 },
        async (i) => {
          if (i === 1) await pickAndGo("camera");
          else if (i === 2) await pickAndGo("gallery");
          else setBusy(false);
        },
      );
    } else {
      Alert.alert(
        "Origen",
        "¿Cómo querés agregar la foto?",
        [
          { text: "Tomar foto", onPress: () => void pickAndGo("camera") },
          { text: "Galería", onPress: () => void pickAndGo("gallery") },
          { text: "Cancelar", style: "cancel", onPress: () => setBusy(false) },
        ],
        { onDismiss: () => setBusy(false) },
      );
    }
  }

  async function pickAndGo(src: "camera" | "gallery") {
    try {
      const img = src === "camera" ? await captureFromCamera() : await captureFromGallery();
      if (!img) {
        setBusy(false);
        return;
      }
      router.push({
        pathname: "/(app)/scan/review",
        params: { imageBase64: img.base64, mimeType: img.mimeType },
      });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Error al capturar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Pressable
        onPress={start}
        disabled={busy}
        style={{ flex: 1, backgroundColor: "#16a34a", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: "#fff" }}>{busy ? "..." : "📷 Escanear"}</Text>
      </Pressable>
      {needsKeyFor ? (
        <AIKeyModal
          visible
          provider={needsKeyFor}
          onClose={() => setNeedsKeyFor(null)}
          onSaved={() => {
            setNeedsKeyFor(null);
            askSource();
          }}
        />
      ) : null}
    </>
  );
}
