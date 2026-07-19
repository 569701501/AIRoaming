import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CandidateGenerationSpec } from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { CandidateReferenceResolver } from "./candidate-reference-resolver.js";

describe("CandidateReferenceResolver", () => {
  let root: string | null = null;

  afterEach(async () => {
    delete process.env.AIROAMING_WORKSPACE_ROOT;
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = null;
    }
  });

  it("只按 spec 顺序读取镜头级引用并标记单人预览与场景来源", async () => {
    root = await mkdtemp(path.join(tmpdir(), "airoaming-candidate-refs-"));
    process.env.AIROAMING_WORKSPACE_ROOT = root;
    const files = {
      character: "projects/project_001/characters/kurapika/preview.webp",
      scene: "projects/project_001/chapters/chapter-001/scenes/ward.png",
      unrelated: "projects/project_001/characters/killua/final-reference.webp",
    };
    for (const [name, relativePath] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, Buffer.from(name));
    }

    const spec: CandidateGenerationSpec = {
      schemaVersion: 2,
      sizePolicyVersion: "legacy_generation_default_v1",
      purpose: "shot_clean_plate",
      projectId: "project_001",
      chapterId: "chapter_001",
      shotId: "shot_015",
      positivePrompt: "one clean illustration",
      negativePrompt: "text, multiple panels",
      sections: [],
      systemConstraints: [],
      requestedSize: { width: 1024, height: 1536 },
      references: [
        { assetId: "asset_character", kind: "character_identity", entityId: "char_001", label: "酷拉皮卡", priority: 100 },
        { assetId: "asset_scene", kind: "scene_environment", entityId: "scene_001", label: "海边病房", priority: 90 },
      ],
      warnings: [],
      digest: "digest_001",
    };
    const resolver = new CandidateReferenceResolver(new WorkspacePathService());

    const result = await resolver.resolve({
      assets: [
        { id: "asset_unrelated", path: files.unrelated },
        { id: "asset_character", path: files.character },
        { id: "asset_scene", path: files.scene },
      ],
    }, spec);

    expect(result.references.map((reference) => reference.assetId)).toEqual(["asset_character", "asset_scene"]);
    expect(result.references.map((reference) => reference.buffer.toString())).toEqual(["character", "scene"]);
    expect(result.references.map((reference) => reference.mimeType)).toEqual(["image/webp", "image/png"]);
    expect(result.references.map((reference) => reference.sourceReferenceKind)).toEqual(["preview_front", "scene_background"]);
    expect(result.warnings).toEqual([]);
  });

  it("冻结的必需引用文件不可读时失败而不是静默降级", async () => {
    root = await mkdtemp(path.join(tmpdir(), "airoaming-candidate-refs-"));
    process.env.AIROAMING_WORKSPACE_ROOT = root;
    const resolver = new CandidateReferenceResolver(new WorkspacePathService());
    const spec = {
      schemaVersion: 2,
      sizePolicyVersion: "legacy_generation_default_v1",
      purpose: "shot_clean_plate",
      projectId: "project_001",
      chapterId: "chapter_001",
      shotId: "shot_015",
      positivePrompt: "one clean illustration",
      negativePrompt: "text",
      sections: [],
      systemConstraints: [],
      requestedSize: { width: 1024, height: 1536 },
      references: [{
        assetId: "asset_missing",
        kind: "character_identity",
        entityId: "char_404",
        label: "缺失角色",
        priority: 80,
      }],
      warnings: [],
      digest: "digest_missing",
    } satisfies CandidateGenerationSpec;

    await expect(resolver.resolve({
      assets: [{ id: "asset_missing", path: "projects/project_001/missing.webp" }],
    }, spec)).rejects.toThrow("CANDIDATE_REQUIRED_REFERENCE_UNREADABLE:asset_missing");
  });
});
