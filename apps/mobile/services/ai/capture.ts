import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import type { ImageMimeType } from "@oraculo/core";

export interface CapturedImage {
  base64: string;
  mimeType: ImageMimeType;
}

/** Max 1280px en el lado mayor — reduce tokens vision + payload. */
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

async function compressAndEncode(uri: string): Promise<CapturedImage> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, base64: true, format: ImageManipulator.SaveFormat.JPEG },
  );
  if (!manipulated.base64) {
    throw new Error("No se pudo codificar la imagen");
  }
  return { base64: manipulated.base64, mimeType: "image/jpeg" };
}

/** Toma una foto con la cámara (vía expo-image-picker). Pide permisos si hace falta. */
export async function captureFromCamera(): Promise<CapturedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Permiso de cámara denegado");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return compressAndEncode(asset.uri);
}

/** Elige una imagen de galería. */
export async function captureFromGallery(): Promise<CapturedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Permiso de galería denegado");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return compressAndEncode(asset.uri);
}
