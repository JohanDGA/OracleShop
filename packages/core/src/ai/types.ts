export type ProviderName = "gemini" | "claude" | "openai";
export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface CanonicalHint {
  id: string;
  name: string;
  aliases: string[];
}

export interface AIProviderInput {
  /** base64 sin prefijo data:image/... */
  imageBase64: string;
  imageMimeType: ImageMimeType;
  /** Top-N canonicals del hogar; vacío si recién creado. */
  canonicalHints: CanonicalHint[];
  apiKey: string;
  /** Timeout total en ms. Default 60_000. */
  timeoutMs?: number;
}

export interface ParseResultItem {
  raw_name: string;
  quantity: string;
  unit: "lt" | "kg" | "un" | null;
  unit_price: string;
  regular_price: string | null;
  is_promo: boolean;
  total_price: string;
  suggested_canonical_id: string | null;
  match_confidence: number | null;
}

export interface ParseResult {
  store_name: string | null;
  purchased_at: string; // YYYY-MM-DD
  total: string;
  currency: "COP";
  items: ParseResultItem[];
}

export type AIErrorKind =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "parse"
  | "unreadable"
  | "unknown";

export interface AIError extends Error {
  kind: AIErrorKind;
  provider?: ProviderName;
  rawResponse?: string;
}

export interface AIProvider {
  readonly name: ProviderName;
  parseReceipt(input: AIProviderInput): Promise<ParseResult>;
}
