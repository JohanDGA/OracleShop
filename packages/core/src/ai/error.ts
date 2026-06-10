import type { AIError, AIErrorKind, ProviderName } from "./types";

const AI_ERROR_MARK = Symbol.for("@oraculo/core/ai-error");

function make(kind: AIErrorKind, message: string, provider?: ProviderName, rawResponse?: string): AIError {
  const e = new Error(message) as AIError;
  e.kind = kind;
  if (provider) e.provider = provider;
  if (rawResponse) e.rawResponse = rawResponse;
  (e as unknown as { [k: symbol]: true })[AI_ERROR_MARK] = true;
  return e;
}

export function isAIError(e: unknown): e is AIError {
  return typeof e === "object" && e !== null && (e as { [k: symbol]: unknown })[AI_ERROR_MARK] === true;
}

/**
 * Convierte un fetch Response (4xx/5xx) o un throwable (TypeError/DOMException) en AIError.
 */
export function toAIError(source: unknown, provider: ProviderName): AIError {
  if (source instanceof Response) {
    const status = source.status;
    let kind: AIErrorKind = "unknown";
    if (status === 401 || status === 403) kind = "auth";
    else if (status === 429) kind = "rate_limit";
    return make(kind, `HTTP ${status}`, provider);
  }
  if (source instanceof DOMException && source.name === "AbortError") {
    return make("timeout", "AI request timed out", provider);
  }
  if (source instanceof TypeError) {
    return make("network", source.message, provider);
  }
  if (source instanceof Error) {
    return make("unknown", source.message, provider);
  }
  return make("unknown", "Error desconocido", provider);
}

/** Helper async para enriquecer un AIError con el body del Response. */
export async function wrapWithText(err: AIError, response: Response): Promise<AIError> {
  try {
    err.rawResponse = await response.text();
  } catch {
    /* ignore */
  }
  return err;
}
