import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildG1SchemaConstraintSource,
  type TaskIdempotencyKeyBindingSource,
  validateTaskIdempotencyKeyBindings,
} from "./g1-schema-constraint-source.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md",
);
const REGISTRY_PATH = path.join(
  REPO_ROOT,
  "文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md",
);

async function buildSource() {
  const [contract, registry] = await Promise.all([
    readFile(CONTRACT_PATH, "utf8"),
    readFile(REGISTRY_PATH, "utf8"),
  ]);
  return buildG1SchemaConstraintSource(contract, registry);
}

describe("G1 Pass 2 constraint and registry source", () => {
  it("keeps incomplete SQL fail-closed until template bindings cover it", async () => {
    const source = await buildSource();
    const checkIssues = source.completenessIssues.filter((issue) => issue.kind === "check");
    const triggerIssues = source.completenessIssues.filter((issue) => issue.kind === "trigger");

    expect(source.checks).toHaveLength(125);
    expect(source.triggers).toHaveLength(6);
    expect(checkIssues).toHaveLength(70);
    expect(triggerIssues).toHaveLength(188);
    expect(source.completenessIssues).toHaveLength(258);
    expect(source.completenessIssues.every((issue) => issue.missing.length > 0)).toBe(true);
  });

  it("contains the exact ten Task policies and five Outbox handlers", async () => {
    const source = await buildSource();

    expect(source.taskPolicyRegistryV1.map((policy) => policy.type)).toEqual([
      "character_reference_generate",
      "scene_reference_generate",
      "story_parse",
      "shot_generate",
      "shot_prompt_generate",
      "image_generate",
      "layout_export",
      "tts_generate",
      "video_export",
      "asset_package_export",
    ]);
    expect(source.outboxHandlerRegistryV1.map((handler) => handler.eventType)).toEqual([
      "asset.promote",
      "asset.delete",
      "project.delete_files",
      "secret.delete_old_ref",
      "legacy_metadata.archive",
    ]);
    expect(
      Object.fromEntries(
        source.taskPolicyRegistryV1.map((policy) => [policy.type, policy.target]),
      ),
    ).toEqual({
      character_reference_generate: {
        type: "character", idOwner: "Character.id", chapterRule: "nullable",
        routingTargetField: "characterId", writeTargetBinding: null,
      },
      scene_reference_generate: {
        type: "scene", idOwner: "ChapterScene.id", chapterRule: "required",
        routingTargetField: "chapterSceneId", writeTargetBinding: null,
      },
      story_parse: {
        type: "chapter", idOwner: "Chapter.id", chapterRule: "required",
        routingTargetField: "chapterId",
        writeTargetBinding: {
          kind: "active_pending_pointer", inputField: "expectedTargetId",
          idOwner: "StoryVersion.id", pointerOwner: "Chapter.pendingStoryVersionId",
          requiredLifecycle: "pending_confirmation",
          expectedRowVersionField: "expectedTargetRowVersion",
        },
      },
      shot_generate: {
        type: "chapter", idOwner: "Chapter.id", chapterRule: "required",
        routingTargetField: "chapterId",
        writeTargetBinding: {
          kind: "active_pending_pointer", inputField: "expectedTargetId",
          idOwner: "StoryboardVersion.id", pointerOwner: "Chapter.pendingStoryboardVersionId",
          requiredLifecycle: "pending_confirmation",
          expectedRowVersionField: "expectedTargetRowVersion",
        },
      },
      shot_prompt_generate: {
        type: "shot", idOwner: "Shot.id", chapterRule: "required",
        routingTargetField: "shotId", writeTargetBinding: null,
      },
      image_generate: {
        type: "shot", idOwner: "Shot.id", chapterRule: "required",
        routingTargetField: "shotId", writeTargetBinding: null,
      },
      layout_export: {
        type: "export", idOwner: "ExportRevision.id", chapterRule: "required",
        routingTargetField: "exportRevisionId",
        writeTargetBinding: {
          kind: "same_as_task_target", inputField: "exportRevisionId",
          idOwner: "ExportRevision.id",
        },
      },
      tts_generate: {
        type: "asset", idOwner: "Asset.id", chapterRule: "nullable",
        routingTargetField: "targetAssetId",
        writeTargetBinding: {
          kind: "same_as_task_target", inputField: "targetAssetId",
          idOwner: "Asset.id",
        },
      },
      video_export: {
        type: "export", idOwner: "ExportRevision.id", chapterRule: "nullable",
        routingTargetField: "exportRevisionId",
        writeTargetBinding: {
          kind: "same_as_task_target", inputField: "exportRevisionId",
          idOwner: "ExportRevision.id",
        },
      },
      asset_package_export: {
        type: "export", idOwner: "ExportRevision.id", chapterRule: "nullable",
        routingTargetField: "exportRevisionId",
        writeTargetBinding: {
          kind: "same_as_task_target", inputField: "exportRevisionId",
          idOwner: "ExportRevision.id",
        },
      },
    });

    const taskField = (
      placeholder: string,
      sourceField: string,
    ): TaskIdempotencyKeyBindingSource => ({
      placeholder,
      sourceKind: "task_field",
      sourceField,
      frozenAt: "task_creation",
    });
    const inputField = (
      placeholder: string,
      sourceField = placeholder,
    ): TaskIdempotencyKeyBindingSource => ({
      placeholder,
      sourceKind: "input_field",
      sourceField,
      frozenAt: "task_creation",
    });
    expect(
      Object.fromEntries(
        source.taskPolicyRegistryV1.map((policy) => [policy.type, {
          template: policy.idempotencyKeyTemplate,
          bindings: policy.idempotencyKeyBindings,
        }]),
      ),
    ).toEqual({
      character_reference_generate: {
        template: "character-reference:{projectId}:{characterId}:{referenceKind}:{inputDigest}",
        bindings: [
          taskField("projectId", "projectId"),
          inputField("characterId"),
          inputField("referenceKind"),
          taskField("inputDigest", "inputDigest"),
        ],
      },
      scene_reference_generate: {
        template: "scene-reference:{projectId}:{chapterId}:{chapterSceneId}:{inputDigest}",
        bindings: [
          taskField("projectId", "projectId"),
          taskField("chapterId", "chapterId"),
          inputField("chapterSceneId"),
          taskField("inputDigest", "inputDigest"),
        ],
      },
      story_parse: {
        template: "story-parse:{projectId}:{chapterId}:{expectedTargetId}:{sourceDigest}:{inputDigest}",
        bindings: [
          taskField("projectId", "projectId"),
          taskField("chapterId", "chapterId"),
          inputField("expectedTargetId"),
          taskField("sourceDigest", "sourceDigest"),
          taskField("inputDigest", "inputDigest"),
        ],
      },
      shot_generate: {
        template: "shot-generate:{projectId}:{chapterId}:{expectedTargetId}:{sourceDigest}:{inputDigest}",
        bindings: [
          taskField("projectId", "projectId"),
          taskField("chapterId", "chapterId"),
          inputField("expectedTargetId"),
          taskField("sourceDigest", "sourceDigest"),
          taskField("inputDigest", "inputDigest"),
        ],
      },
      shot_prompt_generate: {
        template: "shot-prompt:{projectId}:{chapterId}:{shotId}:{sourceDigest}:{inputDigest}",
        bindings: [
          taskField("projectId", "projectId"),
          taskField("chapterId", "chapterId"),
          inputField("shotId"),
          taskField("sourceDigest", "sourceDigest"),
          taskField("inputDigest", "inputDigest"),
        ],
      },
      image_generate: {
        template: "image-generate:{projectId}:{chapterId}:{shotId}:{generationSpecDigest}:{requestId}",
        bindings: [
          taskField("projectId", "projectId"),
          taskField("chapterId", "chapterId"),
          inputField("shotId"),
          inputField("generationSpecDigest"),
          inputField("requestId"),
        ],
      },
      layout_export: {
        template: "layout-publication:{projectId}:{chapterId}:{requestId}",
        bindings: [
          taskField("projectId", "projectId"),
          taskField("chapterId", "chapterId"),
          inputField("requestId"),
        ],
      },
      tts_generate: {
        template: "tts:{projectId}:{chapterId}:{targetAssetId}:{sourceDigest}:{inputDigest}",
        bindings: [
          taskField("projectId", "projectId"),
          taskField("chapterId", "chapterId"),
          inputField("targetAssetId"),
          taskField("sourceDigest", "sourceDigest"),
          taskField("inputDigest", "inputDigest"),
        ],
      },
      video_export: {
        template: "video-export:{projectId}:{scopeKey}:{requestId}",
        bindings: [
          taskField("projectId", "projectId"),
          inputField("scopeKey"),
          inputField("requestId"),
        ],
      },
      asset_package_export: {
        template: "asset-package:{projectId}:{scopeKey}:{requestId}",
        bindings: [
          taskField("projectId", "projectId"),
          inputField("scopeKey"),
          inputField("requestId"),
        ],
      },
    });
    for (const policy of source.taskPolicyRegistryV1) {
      expect(validateTaskIdempotencyKeyBindings(policy), policy.type).toEqual([]);
    }

    expect(source.purgeOwnershipRegistryV1).toHaveLength(44);
    expect(new Set(source.purgeOwnershipRegistryV1.map((entry) => entry.table)).size)
      .toBe(44);
    expect(
      source.purgeOwnershipRegistryV1
        .filter((entry) => entry.ownership === "project_history_or_cascade_root")
        .every((entry) => entry.deleteGuard !== null),
    ).toBe(true);
    expect(
      source.purgeOwnershipRegistryV1
        .filter((entry) => entry.activeDialogueAllStateDeleteGuard)
        .map((entry) => entry.table),
    ).toEqual([
      "conversation_messages",
      "dialogue_runtime_sessions",
      "pending_dialogue_artifacts",
    ]);
  });

  it("rejects unknown, missing, and multiply-bound idempotency placeholders", async () => {
    const source = await buildSource();
    const policy = source.taskPolicyRegistryV1.find(
      (candidate) => candidate.type === "story_parse",
    );
    expect(policy).toBeDefined();
    if (policy === undefined) return;

    const extraBinding: TaskIdempotencyKeyBindingSource = {
      placeholder: "currentPendingPointer",
      sourceKind: "input_field",
      sourceField: "currentPendingPointer",
      frozenAt: "task_creation",
    };
    expect(validateTaskIdempotencyKeyBindings({
      ...policy,
      idempotencyKeyBindings: [...policy.idempotencyKeyBindings, extraBinding],
    })).toContain("binding references unknown placeholder currentPendingPointer");
    expect(validateTaskIdempotencyKeyBindings({
      ...policy,
      idempotencyKeyBindings: policy.idempotencyKeyBindings.slice(0, -1),
    })).toContain("template placeholder inputDigest is unbound");
    expect(validateTaskIdempotencyKeyBindings({
      ...policy,
      idempotencyKeyBindings: [
        ...policy.idempotencyKeyBindings,
        {
          placeholder: "expectedTargetId",
          sourceKind: "input_field",
          sourceField: "mutablePendingPointer",
          frozenAt: "task_creation",
        },
      ],
    })).toContain("placeholder expectedTargetId has 2 bindings");
    expect(validateTaskIdempotencyKeyBindings({
      ...policy,
      idempotencyKeyTemplate:
        `${policy.idempotencyKeyTemplate}:{expectedTargetId}`,
    })).toContain("template placeholder expectedTargetId occurs 2 times");
  });

  it("freezes total-attempt backoff and non-permissive SQL fragments", async () => {
    const source = await buildSource();

    for (const policy of source.taskPolicyRegistryV1) {
      expect(policy.retry.backoffSeconds).toHaveLength(policy.retry.maxAttempts - 1);
    }
    expect(
      source.taskPolicyRegistryV1.find((policy) => policy.type === "image_generate")?.retry
        .backoffSeconds,
    ).toEqual([5, 30]);
    for (const policy of source.taskPolicyRegistryV1) {
      expect(policy.retry.backoffSeconds).not.toContain(120);
      const scheduledDelays = Array.from({ length: policy.retry.maxAttempts }, (_, index) =>
        index + 1 < policy.retry.maxAttempts
          ? policy.retry.backoffSeconds[index]
          : null,
      );
      expect(scheduledDelays.at(-1), policy.type).toBeNull();
      expect(scheduledDelays.filter((delay) => delay !== null), policy.type)
        .toEqual(policy.retry.backoffSeconds);
    }
    for (const check of source.checks) {
      expect(check.normalizedExpression.trim().length, check.name).toBeGreaterThan(0);
      expect(check.normalizedExpression, check.name).not.toMatch(/^1$|CHECK\s*\(\s*1\s*\)/i);
    }
    for (const trigger of source.triggers) {
      expect(trigger.normalizedWhen, trigger.name).not.toBe("0");
      expect(trigger.normalizedBody.trim().length, trigger.name).toBeGreaterThan(0);
      expect(trigger.errorCode, trigger.name).toBe(`AIR_G1:${trigger.name}`);
    }
  });
});
