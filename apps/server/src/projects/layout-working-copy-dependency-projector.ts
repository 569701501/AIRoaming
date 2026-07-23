import type { BindingSourceResolution, CandidateLockAction } from "@airoaming/shared";

export interface WorkingCopyCandidateBindingProjection {
  workingCopyId: string;
  documentDigest: string;
  elementId: string;
  shotId: string | null;
  candidateId: string | null;
  sourceCandidateLockRevisionId: string | null;
  resolution: BindingSourceResolution;
}

export interface ProjectLayoutWorkingCopyDependenciesInput {
  workingCopyId: string;
  documentKind: "legacy_chapter_layout_v1" | "layout_document_v1" | "layout_document_v2";
  documentDigest: string;
  documentJson: unknown;
  currentRevisionByShot: Readonly<Record<string, {
    id: string;
    action: CandidateLockAction;
  }>>;
}

export class LayoutWorkingCopyProjectionError extends Error {
  constructor(readonly code: "LAYOUT_WORKING_COPY_DOCUMENT_INVALID") {
    super(code);
    this.name = "LayoutWorkingCopyProjectionError";
  }
}

function fail(): never {
  throw new LayoutWorkingCopyProjectionError("LAYOUT_WORKING_COPY_DOCUMENT_INVALID");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : null;
}

function resolution(
  shotId: string | null,
  candidateId: string | null,
  revisionId: string | null,
  currentRevisionByShot: ProjectLayoutWorkingCopyDependenciesInput["currentRevisionByShot"],
): BindingSourceResolution {
  if (shotId === null || candidateId === null || revisionId === null) return "unresolved";
  const current = currentRevisionByShot[shotId];
  return current && current.action !== "clear" && current.id === revisionId
    ? "current"
    : "stale";
}

function projection(
  input: ProjectLayoutWorkingCopyDependenciesInput,
  elementId: string,
  source: Record<string, unknown>,
  forceUnresolved = false,
): WorkingCopyCandidateBindingProjection {
  const shotId = optionalId(source.shotId);
  const candidateId = optionalId(source.candidateId);
  const sourceCandidateLockRevisionId = optionalId(
    source.candidateLockRevisionId ?? source.sourceCandidateLockRevisionId,
  );
  return {
    workingCopyId: input.workingCopyId,
    documentDigest: input.documentDigest,
    elementId,
    shotId,
    candidateId,
    sourceCandidateLockRevisionId,
    resolution: forceUnresolved
      ? "unresolved"
      : resolution(
          shotId,
          candidateId,
          sourceCandidateLockRevisionId,
          input.currentRevisionByShot,
        ),
  };
}

function projectLegacy(
  input: ProjectLayoutWorkingCopyDependenciesInput,
  document: Record<string, unknown>,
): WorkingCopyCandidateBindingProjection[] {
  if (document.sourceResolution !== "complete" && document.sourceResolution !== "unresolved") {
    fail();
  }
  const forceUnresolved = document.sourceResolution === "unresolved";
  if (!Array.isArray(document.sourceBindings)) fail();
  const direct = document.sourceBindings.map((value) => {
    const row = record(value);
    const elementId = optionalId(row.elementId);
    if (elementId === null) fail();
    return projection(input, elementId, row, forceUnresolved);
  });
  if (direct.length > 0) return direct;

  const legacyDocument = record(document.legacyDocument);
  if (!Array.isArray(legacyDocument.pages)) fail();
  const fallback: WorkingCopyCandidateBindingProjection[] = [];
  for (const pageValue of legacyDocument.pages) {
    const page = record(pageValue);
    const pageId = optionalId(page.id);
    if (pageId === null || !Array.isArray(page.placements)) fail();
    for (const placementValue of page.placements) {
      const placement = record(placementValue);
      const order = Number(placement.order);
      if (!Number.isInteger(order) || order < 1) fail();
      fallback.push(projection(input, `legacy:${pageId}:${order}`, placement, forceUnresolved));
    }
  }
  return fallback;
}

function projectV1(
  input: ProjectLayoutWorkingCopyDependenciesInput,
  document: Record<string, unknown>,
): WorkingCopyCandidateBindingProjection[] {
  if (!Array.isArray(document.canvases)) fail();
  const result: WorkingCopyCandidateBindingProjection[] = [];
  for (const canvasValue of document.canvases) {
    const canvas = record(canvasValue);
    if (!Array.isArray(canvas.elements)) fail();
    for (const elementValue of canvas.elements) {
      const element = record(elementValue);
      const image = element.type === "panel_frame"
        ? element.contentImage === null || element.contentImage === undefined
          ? null
          : record(element.contentImage)
        : element.type === "free_image"
          ? element
          : null;
      if (image === null) continue;
      const elementId = optionalId(image.id);
      if (elementId === null) fail();
      const source = image.source && typeof image.source === "object" && !Array.isArray(image.source)
        ? image.source as Record<string, unknown>
        : {};
      result.push(projection(input, elementId, source));
    }
  }
  return result;
}

export function projectLayoutWorkingCopyDependencies(
  input: ProjectLayoutWorkingCopyDependenciesInput,
): WorkingCopyCandidateBindingProjection[] {
  const document = record(input.documentJson);
  const expectedSchemaVersion = input.documentKind === "layout_document_v2" ? 2 : 1;
  if (document.schemaVersion !== expectedSchemaVersion || document.kind !== input.documentKind) fail();
  return input.documentKind === "legacy_chapter_layout_v1"
    ? projectLegacy(input, document)
    : projectV1(input, document);
}
