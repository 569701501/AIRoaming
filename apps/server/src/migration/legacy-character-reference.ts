export interface LegacyCharacterCandidate {
  sourceId: string;
  exactName: string;
  targetId: string;
}

export interface LegacyCharacterResolution {
  token: string;
  targetId: string;
  matchedBy: "id" | "exact_name";
}

export class LegacyCharacterReferenceError extends Error {
  constructor(
    readonly kind: "unresolved" | "ambiguous",
    readonly token: string,
  ) {
    super(kind === "ambiguous" ? "LEGACY_CHARACTER_REFERENCE_AMBIGUOUS" : "LEGACY_CHARACTER_REFERENCE_UNRESOLVED");
  }
}

/**
 * Resolve legacy character references without guessing. IDs win over names;
 * names are accepted only when exactly one candidate matches byte-for-byte
 * after trimming the input token.
 */
export function resolveLegacyCharacterTokens(
  tokens: readonly string[],
  candidates: readonly LegacyCharacterCandidate[],
): LegacyCharacterResolution[] {
  const byId = new Map<string, LegacyCharacterCandidate[]>();
  const byTargetId = new Map<string, LegacyCharacterCandidate[]>();
  const byName = new Map<string, LegacyCharacterCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.sourceId || !candidate.targetId) continue;
    const idMatches = byId.get(candidate.sourceId) ?? [];
    idMatches.push(candidate);
    byId.set(candidate.sourceId, idMatches);
    const targetMatches = byTargetId.get(candidate.targetId) ?? [];
    targetMatches.push(candidate);
    byTargetId.set(candidate.targetId, targetMatches);
    if (candidate.exactName) {
      const matches = byName.get(candidate.exactName) ?? [];
      matches.push(candidate);
      byName.set(candidate.exactName, matches);
    }
  }

  return tokens.map((rawToken) => {
    const token = rawToken.trim();
    if (!token) throw new LegacyCharacterReferenceError("unresolved", rawToken);
    const idCandidates = byId.get(token) ?? [];
    if (idCandidates.length === 1) return { token, targetId: idCandidates[0]!.targetId, matchedBy: "id" };
    if (idCandidates.length > 1) throw new LegacyCharacterReferenceError("ambiguous", token);
    const targetCandidates = byTargetId.get(token) ?? [];
    if (targetCandidates.length === 1) return { token, targetId: targetCandidates[0]!.targetId, matchedBy: "id" };
    if (targetCandidates.length > 1) throw new LegacyCharacterReferenceError("ambiguous", token);
    const nameCandidates = byName.get(token) ?? [];
    if (nameCandidates.length === 1) return { token, targetId: nameCandidates[0]!.targetId, matchedBy: "exact_name" };
    throw new LegacyCharacterReferenceError(nameCandidates.length > 1 ? "ambiguous" : "unresolved", token);
  });
}
