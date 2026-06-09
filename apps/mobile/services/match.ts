import { normalizeName } from "@oraculo/core";
import { supabase } from "../lib/supabase";

export interface MatchCandidate {
  canonicalId: string;
  name: string;
  /** presente en exact */
  confidence?: number;
  /** presente en fuzzy */
  score?: number;
}

export interface MatchResult {
  exact: MatchCandidate | null;
  fuzzy: MatchCandidate[];
}

interface RawCandidate {
  canonical_id: string;
  name: string;
  confidence?: number;
  score?: number;
}

function toCandidate(r: RawCandidate): MatchCandidate {
  return { canonicalId: r.canonical_id, name: r.name, confidence: r.confidence, score: r.score };
}

/**
 * Normaliza el raw_name en cliente y llama a match_product. Retorna también
 * la cadena normalizada (el caller la persiste como alias_normalized si confirma).
 */
export async function matchProduct(
  householdId: string,
  rawName: string,
): Promise<{ normalized: string; result: MatchResult }> {
  const normalized = normalizeName(rawName);
  if (!normalized) {
    return { normalized, result: { exact: null, fuzzy: [] } };
  }
  const { data, error } = await supabase.rpc("match_product", {
    p_household_id: householdId,
    p_normalized: normalized,
  });
  if (error) throw new Error(error.message);
  const raw = data as { exact: RawCandidate | null; fuzzy: RawCandidate[] } | null;
  const result: MatchResult = {
    exact: raw?.exact ? toCandidate(raw.exact) : null,
    fuzzy: (raw?.fuzzy ?? []).map(toCandidate),
  };
  return { normalized, result };
}
