# Hito 3 — AIProvider + escaneo de facturas — Diseño

> Fecha: 2026-06-09
> Estado: Aprobado para planificación
> Sub-proyecto de: docs/superpowers/specs/2026-06-03-oraculo-de-compras-design.md

---

## 1. Alcance y promesa

Entregar el **momento mágico** del producto: el usuario toma o sube una foto de una factura, una IA la parsea (OCR + estructura + matching semántico Capa 3) y entrega un borrador editable que reusa el `ProductPicker` del Hito 2. Confirmar = factura guardada con sus ítems y aliases aprendidos.

### Alcance concreto

1. **Interfaz `AIProvider`** (TS puro, `@oraculo/core/ai`) con tres implementaciones: **Gemini** (default), **Claude**, **OpenAI**. Detrás de la misma interfaz; cambiar de provider es un switch en perfil.
2. **Key storage**: `expo-secure-store` con un key namespace por provider (`oraculo.ai.gemini`, `oraculo.ai.claude`, `oraculo.ai.openai`). El backend nunca ve la key.
3. **Selector de provider activo**: `user_settings.preferred_ai_provider` ya existe en el schema (Hito 0a). Hito 3 lo activa en el UI.
4. **Captura de imagen**: `expo-camera` (snapshot) **y** `expo-image-picker` (galería/upload). Imagen en memoria, jamás a disco persistente.
5. **Prompt de parseo** con matching semántico embebido (Capa 3): el llamado a IA incluye un subset de `canonical_products` del hogar y pide JSON estructurado con `suggested_canonical_match` por ítem.
6. **Detección de descuentos**: el prompt instruye a la IA a detectar `regular_price` / `unit_price` / `is_promo` cuando la factura los muestre.
7. **Pantalla `ReviewParsed`** nueva (Expo Router): header con tienda+fecha+total, preview pequeño de la imagen, lista de ítems editables con `ProductPicker` por línea (Hito 2). Guardar → mismo RPC v2 (`create_receipt_with_items`).
8. **Onboarding lazy de API key**: al primer "Escanear" sin key configurada, modal con instrucciones del provider activo + paste + botón "Probar" (llamada de prueba con factura demo bundled).
9. **Manejo de errores** end-to-end: key inválida (banner + cambiar provider), 429 (mensaje + cambiar), timeout (reintentar o manual), JSON malformado (reintentar 1× con prompt estricto, luego texto crudo + manual asistido), factura ilegible (foto nueva o manual).
10. **Botón "Escanear"** en la barra de captura del tab Gastos (junto a "+ Gasto" y "+ Factura").

### Lo que NO está en este hito (deliberado)

- **PaddleOCR on-device** → Hito 4. Si v1 quiere usuarios sin API key, depende de Hito 4. En Hito 3 sin key → no se puede escanear (pero captura manual sigue funcionando).
- **Tienda nueva inline en ReviewParsed**: si la IA detecta una tienda que no existe, se ofrece "crear" con el nombre sugerido (reusando el patrón del CategoryPicker). NO hay edición rica de tiendas en este hito.
- **Múltiples cuentas/keys por provider**: una key activa por provider, una preferred provider por usuario.
- **Histórico de escaneos / re-OCR**: la imagen se descarta tras confirmar. Si el usuario cancela sin guardar, también se descarta.
- **Streaming de respuesta**: provider devuelve la respuesta completa antes de mostrar la pantalla.
- **Análisis de PDF de factura electrónica**: DIAN llega en Hito 7.

---

## 2. Arquitectura

### Capas

```
┌─────────────────────────────────────────────────────────┐
│ apps/mobile                                             │
│                                                         │
│  Tab Gastos                                             │
│   └─ "Escanear" → expo-camera / expo-image-picker       │
│                                                         │
│  app/(app)/scan/review.tsx (ReviewParsed)               │
│   └─ ProductPicker (Hito 2) por línea                   │
│   └─ Guardar → services/receipts.createManualReceipt()  │
│                                                         │
│  services/ai/                                           │
│   ├─ keystore.ts   (expo-secure-store wrapper)          │
│   └─ provider.ts   (resolve activo: gemini|claude|openai)│
│                                                         │
│  components/                                            │
│   ├─ AIKeyModal.tsx (onboarding lazy)                   │
│   └─ ScanButton.tsx (camera + gallery)                  │
└────────────────────────┬────────────────────────────────┘
                         │ (HTTP directo a proveedor)
                         │ La key vive solo en mobile.
                         ▼
              Gemini / Claude / OpenAI APIs
                         │
                         │ (mismo response shape vía AIProvider)
                         ▼
                ParseResult { store, purchased_at, total,
                              currency, items[] }
```

### Módulos nuevos

| Módulo | Ubicación | Responsabilidad |
|---|---|---|
| `AIProvider` interfaz | `packages/core/src/ai/provider.ts` | Define `parseReceipt(input): Promise<ParseResult>`. Pure TS. |
| `ParseResult` + tipos | `packages/core/src/ai/types.ts` | Schema TS del resultado normalizado. |
| `parseReceiptPrompt` | `packages/core/src/ai/prompt.ts` | Función pura que construye el system prompt y el user prompt a partir de `canonical_products` del hogar. Mismo prompt para los 3 providers; lo que cambia es el wrapper de request/response de cada uno. |
| `GeminiProvider` | `packages/core/src/ai/gemini.ts` | Implementa `AIProvider` usando REST de Google AI Studio (no SDK; el SDK suma deps). |
| `ClaudeProvider` | `packages/core/src/ai/claude.ts` | Implementa `AIProvider` usando REST de Anthropic Messages API. |
| `OpenAIProvider` | `packages/core/src/ai/openai.ts` | Implementa `AIProvider` usando REST de OpenAI Chat Completions con `image_url` data URL. |
| `parseResultSchema` (Zod) | `packages/validations/src/parse-result.ts` | Valida la respuesta JSON de la IA antes de propagar al UI. |
| `services/ai/keystore.ts` | `apps/mobile/services/ai/keystore.ts` | Get/set/delete keys vía `expo-secure-store`. |
| `services/ai/provider.ts` | `apps/mobile/services/ai/provider.ts` | Resuelve el provider activo (lee `user_settings.preferred_ai_provider` + key del keystore) y devuelve una instancia `AIProvider`. |
| `services/ai/capture.ts` | `apps/mobile/services/ai/capture.ts` | Helper para obtener imagen vía camera o picker (devuelve base64). |

### Por qué REST y no SDK
- Cada SDK suma 1-2 MB al bundle. 3 SDKs = bundle inflado.
- Las 3 APIs tienen interfaces estables y simples para nuestro uso (1 endpoint cada una).
- REST permite testear con `vi.fn()` sobre `fetch` sin mocks gigantes.

---

## 3. Interfaz `AIProvider` y shape del `ParseResult`

```typescript
// packages/core/src/ai/types.ts

export interface CanonicalHint {
  id: string;            // canonical_products.id
  name: string;          // canonical_products.name
  aliases: string[];     // alias_normalized
}

export interface AIProviderInput {
  /** base64 sin prefijo data:image/... */
  imageBase64: string;
  /** MIME real de la imagen, ej. 'image/jpeg' */
  imageMimeType: "image/jpeg" | "image/png" | "image/webp";
  /** Subset de canonicals del hogar (top-50 por uso reciente). */
  canonicalHints: CanonicalHint[];
  apiKey: string;
}

export interface ParseResultItem {
  raw_name: string;
  quantity: string;             // NUMERIC(10,4) como string
  unit: "lt" | "kg" | "un" | null;
  unit_price: string;
  /** Solo si la factura muestra precio sin descuento. */
  regular_price: string | null;
  is_promo: boolean;
  total_price: string;
  /** Sugerencia de match con un canonical existente (id de canonicalHints), o null. */
  suggested_canonical_id: string | null;
  /** Confianza del match sugerido, 0..1. */
  match_confidence: number | null;
}

export interface ParseResult {
  store_name: string | null;
  purchased_at: string;         // YYYY-MM-DD
  total: string;                // NUMERIC(15,4) como string
  currency: "COP";              // v1 fijo a COP
  items: ParseResultItem[];
}

export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";
export type ProviderName = "gemini" | "claude" | "openai";

export interface AIProvider {
  readonly name: ProviderName;
  parseReceipt(input: AIProviderInput): Promise<ParseResult>;
}

/** Errores normalizados al ParseResult / mapeo desde fetch/Zod. */
export type AIErrorKind =
  | "auth"          // 401/403 → key inválida
  | "rate_limit"    // 429
  | "timeout"       // AbortController
  | "network"       // fetch reject
  | "parse"         // Zod fail post-prompt-estricto
  | "unreadable"    // total=null o items=[] tras parse válido
  | "unknown";

export interface AIError extends Error {
  kind: AIErrorKind;
  /** Si aplica, el provider que falló. */
  provider?: ProviderName;
  /** Si aplica, body crudo del response para diagnosticar. */
  rawResponse?: string;
}
```

### Decisiones de tipos
- **`quantity` / precios como string**: consistente con el resto del sistema; Zod los regex-valida; `toMinorUnits` los parsea.
- **`unit` nullable**: la IA puede no inferirla. La UI ofrece elegirla al confirmar (vía `ProductPicker.CreateCanonicalForm` si se crea canonical en el momento).
- **`suggested_canonical_id`**: el id del `CanonicalHint` que la IA propone. La UI lo trata como Capa 2 (chip amarillo) hasta que el user confirme. Para Capa 1 (auto-resolución por alias exacto) se usa `match_product` RPC del Hito 2 cuando el user edite el `raw_name`.

---

## 4. Prompt y estrategia de contexto

### Subset de hints
Función `getCanonicalHints(householdId, limit=50)` en `services/ai/provider.ts`:
- Query a Supabase: top-N canonical_products del hogar ordenados por `created_at DESC` (proxy de "más recientes"). Para Hito 5/6 esto evoluciona a "más frecuentes" cuando exista uso real.
- Cada hint trae sus `alias_normalized` (LIMIT 3 por canonical) para que la IA pueda matchear variantes.
- Si el hogar tiene <50 canonicals → todos.
- Si >50 → top-50.

### Prompt único (compartido por los 3 providers)

```typescript
// packages/core/src/ai/prompt.ts

export function buildSystemPrompt(): string {
  return [
    "Eres un asistente que extrae datos estructurados de fotos de facturas de supermercado en Colombia.",
    "Responde SOLO con un objeto JSON válido, sin markdown ni texto adicional.",
    "Si un campo no es legible, usa null (no inventes).",
    "Detecta descuentos: si la factura muestra precio regular y precio pagado, llena regular_price y marca is_promo=true.",
    "Para cada ítem, intenta matchear con uno de los productos del hogar provistos en el contexto. Si hay match razonable (>0.6 de confianza), devuelve su id en suggested_canonical_id; si no, deja null.",
  ].join("\n");
}

export function buildUserPrompt(hints: CanonicalHint[]): string {
  const hintsBlock = hints.length === 0
    ? "(El hogar todavía no tiene productos en su diccionario.)"
    : hints
        .map((h) => `- id=${h.id} name="${h.name}" aliases=${JSON.stringify(h.aliases)}`)
        .join("\n");
  return [
    "Productos conocidos del hogar:",
    hintsBlock,
    "",
    "Estructura JSON esperada:",
    JSON.stringify(parseResultSchemaExample(), null, 2),
    "",
    "Extrae los datos de la factura en la imagen adjunta. SOLO devuelve el JSON.",
  ].join("\n");
}
```

`parseResultSchemaExample()` devuelve un ejemplo con todos los campos como guía para la IA.

### Modelos por provider
- **Gemini**: `gemini-2.0-flash` (free tier generoso, soporta visión). Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}`.
- **Claude**: `claude-sonnet-4-20250514` (visión nativa). Endpoint: `https://api.anthropic.com/v1/messages`.
- **OpenAI**: `gpt-4o-mini` (visión, más barato que 4o). Endpoint: `https://api.openai.com/v1/chat/completions`.

Cada provider envuelve el prompt en su formato request específico y normaliza la respuesta al `ParseResult`.

### Límite de tamaño de imagen
- Comprimir a max 1280px en el lado mayor antes de base64 (`expo-image-manipulator`). Sirve para:
  - Bajar el costo de tokens (vision pricing escala con megapíxeles).
  - Estar dentro del límite de payload (Gemini 20MB, otros varían).

---

## 5. Storage de API keys (mobile only)

```typescript
// apps/mobile/services/ai/keystore.ts
import * as SecureStore from "expo-secure-store";

type ProviderName = "gemini" | "claude" | "openai";
const KEY_PREFIX = "oraculo.ai.";

export async function getKey(p: ProviderName): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_PREFIX + p);
}
export async function setKey(p: ProviderName, key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_PREFIX + p, key);
}
export async function deleteKey(p: ProviderName): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PREFIX + p);
}
```

**Web fallback**: `expo-secure-store` en web usa `localStorage` por debajo. Eso es inseguro para production web, pero v1 mobile-first asume el browser solo se usa para E2E manual. La app es para iOS/Android.

**user_settings.preferred_ai_provider**: lectura/escritura via Supabase. Default a `gemini` si null. Si el provider activo no tiene key, el flujo de "Escanear" abre el modal de onboarding.

---

## 6. UX del escaneo

### Tab Gastos: nuevo botón
La barra de captura inferior pasa de 2 botones a 3:
```
[+ Gasto] [+ Factura] [📷 Escanear]
```

### Flujo

```
1. Tap "Escanear"
2. resolveActiveProvider() → busca preferred_ai_provider en user_settings
                          → busca su key en keystore
   2a. key existe → continuar
   2b. key no existe → abrir AIKeyModal (modal-screen)
                      Usuario pega key + tap "Probar"
                      "Probar" hace un parseReceipt() con factura demo bundled
                      Si ok → setKey() + cerrar modal + continuar
                      Si error → mensaje + permitir cambiar provider o cancelar
3. Pedir fuente de imagen: ActionSheet "Tomar foto" / "Elegir de galería"
   3a. expo-camera (toma snapshot) → Blob/base64
   3b. expo-image-picker (selección) → Blob/base64
   3c. Pre-resize a max 1280px lado mayor con expo-image-manipulator
4. router.push("/(app)/scan/review", { imageBase64, mimeType })
5. ReviewParsed mounta:
   - useEffect: provider.parseReceipt({ imageBase64, mimeType, canonicalHints, apiKey })
   - Estado "loading" con spinner
   - Si éxito → render header + lista de items (ProductPicker por línea)
   - Si error → render banner + opciones (reintentar / cambiar provider / cancelar)
6. Usuario revisa/edita ítems (mismo patrón que receipt/new del Hito 2)
7. "Guardar" → createManualReceipt() con source='photo_ai' marcado vía el RPC v2
   (extender RPC para aceptar p_source — hoy hardcodea 'manual')
8. router.back() al tab Gastos
9. Imagen descartada de memoria (no se persiste en ningún momento)
```

### Pantalla `ReviewParsed` (esqueleto)

```typescript
// app/(app)/scan/review.tsx
export default function ReviewParsed() {
  const params = useLocalSearchParams<{ imageBase64: string; mimeType: string }>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [error, setError] = useState<AIError | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const provider = await resolveActiveProvider(householdId);
        const result = await provider.parseReceipt({
          imageBase64: params.imageBase64,
          imageMimeType: params.mimeType as ImageMimeType,
          canonicalHints: await getCanonicalHints(householdId),
          apiKey: provider.apiKey,
        });
        setParsed(result);
        setItems(result.items.map(toDraft));
        setState("ready");
      } catch (e) {
        setError(toAIError(e));
        setState("error");
      }
    })();
  }, [params.imageBase64]);
  // ... render
}
```

Reusa `ProductPicker` del Hito 2 por línea. Pre-llena `value` cuando `suggested_canonical_id` viene en el item (mapea a `ProductPickerValue` con `layer: "fuzzy_confirmed"`).

---

## 7. Detección de descuentos (parser-side)

El prompt instruye explícitamente:
> "Detecta descuentos: si la factura muestra precio regular y precio pagado, llena `regular_price` y marca `is_promo=true`."

El `ParseResultItem` ya tiene `regular_price` (nullable) y `is_promo` (boolean). El `RPC create_receipt_with_items` v2 ya acepta esos campos (los persiste en `receipt_items.regular_price` y `receipt_items.is_promo`). Por ahora el RPC los persiste y se pueden consultar; las alertas de cambio de precio que usan `regular_price` vs `regular_price` llegan en Hito 6.

**Limitación honesta**: la calidad de detección depende del modelo. En Hito 6 se mide la tasa de detección sobre facturas reales (Sentry custom event); si <60%, prompt se ajusta o se añade post-procesamiento.

---

## 8. Persistir el escaneo: extender RPC (migración 0013, v3)

`create_receipt_with_items` v2 (Hito 2) hardcodea `source='manual'` y no lee `regular_price` ni `is_promo` del jsonb de items. La v3 extiende ambos:

1. **Parámetro `p_source TEXT DEFAULT 'manual'`** con validación al entrar:
   ```sql
   if p_source not in ('manual','photo_ai','photo_paddleocr','dian_xml') then
     raise exception 'source invalido: %', p_source;
   end if;
   ```

2. **Persistir `regular_price` y `is_promo` por ítem** desde el jsonb del payload. Los campos ya existen en `receipt_items` (creados en 0001) — solo hay que leerlos en el INSERT:
   ```sql
   nullif(item->>'regular_price','')::numeric,
   coalesce((item->>'is_promo')::boolean, false),
   ```

Migración `packages/db/supabase/migrations/0013_create_receipt_with_items_v3.sql` (`CREATE OR REPLACE FUNCTION` con la firma extendida: `(uuid, uuid, date, text, jsonb, text DEFAULT 'manual')`).

**Compatibilidad hacia atrás**: la firma agrega el 6º argumento con default, así que callers viejos (Hito 1b/2) siguen funcionando sin tocarlos. El servicio mobile `createManualReceipt` puede pasar `p_source='manual'` explícito o seguir omitiéndolo. El servicio nuevo `createScannedReceipt` pasa `p_source='photo_ai'`.

---

## 9. Manejo de errores (cobertura completa)

| Caso | Detección | Acción |
|---|---|---|
| Key inválida (401/403) | provider response | Banner "Tu API key parece inválida" + botón "Cambiar key" → abre AIKeyModal |
| Rate limit (429) | provider response | Banner "Límite alcanzado" + botón "Cambiar provider" + "Reintentar" |
| Timeout (>60s) | AbortController | "La IA tardó demasiado" + "Reintentar" + "Continuar manual" |
| Sin red | fetch reject | "Sin conexión" + "Reintentar" |
| JSON malformado | Zod parse fail | Reintentar 1× con prompt estricto + nota "Sé estricto: solo JSON, nada más". Si falla, mostrar texto crudo + sugerir manual. |
| Imagen ilegible | el JSON viene con items=[] o total=null | Banner "No pude leer la factura, probá una foto más nítida" |
| Total ≠ Σ items (>1% diferencia) | post-validación local | Warning amarillo, NO bloquear (puede ser descuento global) |

Helper `toAIError(e: unknown): AIError` clasifica el error en `{ kind: 'auth'|'rate_limit'|'timeout'|'network'|'parse'|'unreadable'|'unknown', message }`.

Test de cada caso con `fetch` mockeado.

---

## 10. Testing

| Capa | Tool | Foco | Cobertura |
|---|---|---|---|
| `AIProvider` interfaz | Vitest | shape de input/output, validación Zod del response | 100% |
| `parseReceiptPrompt` | Vitest | snapshot del prompt para hints vacíos / con hints | Smoke |
| `GeminiProvider` | Vitest + fetch mock | request shape correcto, parse de response, los 7 casos de error | Alto |
| `ClaudeProvider` | Vitest + fetch mock | idem | Alto |
| `OpenAIProvider` | Vitest + fetch mock | idem | Alto |
| `parseResultSchema` (Zod) | Vitest | acepta válido, rechaza inválido | Alto |
| `keystore` (mobile) | Manual / inspección | smoke (expo-secure-store difícil de testear sin device) | Smoke |
| `services/ai/provider.resolveActiveProvider` | Vitest + mocks de Supabase y keystore | retorna provider correcto, lanza si no hay key | Alto |
| `RPC v3` (0013) | Vitest + Supabase test | persiste con p_source='photo_ai' | Happy + invalid source |
| UI ReviewParsed | E2E manual | spec §6 paso a paso con factura real | Manual |

**Fixtures de respuestas reales**: capturar 3-4 respuestas reales de cada provider (sanitizadas, sin keys) y usarlas como golden files en los tests. Permite detectar drift sin llamar a la API en CI.

---

## 11. Telemetría (deferido salvo log estructurado)

Continuar el patrón del Hito 2: `console.info("[ai_scan]", { provider, layer, duration_ms })` por evento. Hito 7 enchufa a Sentry. Eventos clave:
- `ai_scan.started` (provider, hints_count)
- `ai_scan.success` (provider, items_count, suggested_matches_count, duration_ms)
- `ai_scan.error` (provider, kind)

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambios en el response shape de un provider | Zod valida; si rompe, el error 'parse' lleva al manual asistido sin crashear |
| Costo por foto demasiado alto (vision tokens) | Compresión 1280px max + hints limitados a 50 |
| Free tier de Gemini cambia | Multi-provider habilitado desde día 1; user cambia con un tap |
| Hogar grande supera 50 hints relevantes | Hito 5/6 evolucionará el ranking de hints (frecuencia, no solo recencia) |
| Demo factura no representativa | Incluir 1 fixture en `apps/mobile/assets/demo-receipt.jpg` (factura típica COP, ~50-100KB). Más fixtures se suman en hitos posteriores si la métrica de éxito lo justifica. |

---

## 13. Entregable

Usuario abre la app, va a Gastos, tap "Escanear". Sin key configurada → modal pide pegar key de Gemini, "Probar" valida con factura demo bundled → guarda. Luego ActionSheet "Tomar foto" / "Galería". El user elige una factura real, ve un spinner ~3-5s, y aterriza en ReviewParsed: header con tienda y total inferidos, lista de ítems con `ProductPicker` ya sugiriendo matches de su diccionario (chips amarillos). Edita lo que haga falta, tap "Guardar" → vuelve a Gastos con la factura en la lista del mes. La imagen jamás tocó disco.
