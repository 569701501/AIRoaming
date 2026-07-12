import { digestCanonicalJson } from "./canonical-json.js";
import type { Digest, PreflightSourceSnapshotV1 } from "./document-contract.js";

export interface SourceRefV1 {
  role: string;
  entityType: string;
  entityId: string;
  digest: Digest;
}

export interface SourceSnapshotV1 {
  schemaVersion: 1;
  policyVersion: string;
  projectId: string;
  chapterId: string;
  consumerType: string;
  sources: SourceRefV1[];
}

function nonEmpty(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} must be non-empty`);
  return value;
}

function validDigest(value: string, field: string): Digest {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw new TypeError(`${field} must be sha256:<64 lowercase hex>`);
  return value as Digest;
}

function compareUtf8(a: string, b: string): number {
  const left = new TextEncoder().encode(a); const right = new TextEncoder().encode(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
}

function compareSource(a: SourceRefV1, b: SourceRefV1): number {
  return compareUtf8(a.role, b.role) || compareUtf8(a.entityType, b.entityType) || compareUtf8(a.entityId, b.entityId);
}

export function sortSourceRefs(sources: readonly SourceRefV1[]): SourceRefV1[] {
  const result = sources.map((source, index) => ({
    role: nonEmpty(source.role, `sources[${index}].role`), entityType: nonEmpty(source.entityType, `sources[${index}].entityType`),
    entityId: nonEmpty(source.entityId, `sources[${index}].entityId`), digest: validDigest(source.digest, `sources[${index}].digest`),
  }));
  const seen = new Set<string>();
  for (const source of result) {
    const key = `${source.role}\u0000${source.entityType}\u0000${source.entityId}`;
    if (seen.has(key)) throw new TypeError(`duplicate source ${key}`);
    seen.add(key);
  }
  return result.sort(compareSource);
}

export function buildSourceSnapshot(input: Omit<SourceSnapshotV1, "schemaVersion" | "sources"> & { sources: readonly SourceRefV1[] }): SourceSnapshotV1 {
  return {
    schemaVersion: 1,
    policyVersion: nonEmpty(input.policyVersion, "policyVersion"),
    projectId: nonEmpty(input.projectId, "projectId"), chapterId: nonEmpty(input.chapterId, "chapterId"),
    consumerType: nonEmpty(input.consumerType, "consumerType"), sources: sortSourceRefs(input.sources),
  };
}

export function sourceSnapshotDigest(snapshot: SourceSnapshotV1 | PreflightSourceSnapshotV1): Digest {
  return digestCanonicalJson(snapshot);
}

export interface PreflightSourceSnapshotInput extends Omit<PreflightSourceSnapshotV1, "schemaVersion" | "characters" | "scenes"> {
  characters: PreflightSourceSnapshotV1["characters"];
  scenes: PreflightSourceSnapshotV1["scenes"];
}

function validateAssetTriple(value: { visualId: string | null; assetId: string | null; assetSha256: Digest | null }, path: string): void {
  const filled = [value.visualId, value.assetId, value.assetSha256].filter((item) => item !== null).length;
  if (filled !== 0 && filled !== 3) throw new TypeError(`${path}: visualId, assetId and assetSha256 must be all null or all filled`);
  if (value.visualId !== null) nonEmpty(value.visualId, `${path}.visualId`);
  if (value.assetId !== null) nonEmpty(value.assetId, `${path}.assetId`);
  if (value.assetSha256 !== null) validDigest(value.assetSha256, `${path}.assetSha256`);
}

export function buildPreflightSourceSnapshot(input: PreflightSourceSnapshotInput): PreflightSourceSnapshotV1 {
  if (input.policyVersion !== "preflight-source-v1") throw new TypeError("unsupported preflight source policy");
  if (input.consumerType !== "preflight_revision") throw new TypeError("consumerType must be preflight_revision");
  const characters = input.characters.map((item, index) => {
    const character = { ...item, characterId: nonEmpty(item.characterId, `characters[${index}].characterId`), generationInputDigest: validDigest(item.generationInputDigest, `characters[${index}].generationInputDigest`) };
    validateAssetTriple(character, `characters[${index}]`); return character;
  }).sort((a, b) => compareUtf8(a.characterId, b.characterId));
  const scenes = input.scenes.map((item, index) => {
    const scene = { ...item, chapterSceneId: nonEmpty(item.chapterSceneId, `scenes[${index}].chapterSceneId`), sceneKey: nonEmpty(item.sceneKey, `scenes[${index}].sceneKey`) };
    validateAssetTriple(scene, `scenes[${index}]`); return scene;
  }).sort((a, b) => compareUtf8(a.chapterSceneId, b.chapterSceneId) || compareUtf8(a.sceneKey, b.sceneKey));
  return {
    schemaVersion: 1, policyVersion: "preflight-source-v1", projectId: nonEmpty(input.projectId, "projectId"), chapterId: nonEmpty(input.chapterId, "chapterId"), consumerType: "preflight_revision",
    storyboard: { id: nonEmpty(input.storyboard.id, "storyboard.id"), digest: validDigest(input.storyboard.digest, "storyboard.digest") },
    style: { comicFormat: input.style.comicFormat, artStyle: nonEmpty(input.style.artStyle, "style.artStyle"), styleDigest: validDigest(input.style.styleDigest, "style.styleDigest") },
    characters, scenes,
  };
}
