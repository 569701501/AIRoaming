import { Inject, Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { CandidateGenerationSpec } from "@airoaming/shared";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import type { CandidateImageReferenceInput } from "./image-provider.service.js";

export interface CandidateReferenceResolution {
  references: CandidateImageReferenceInput[];
  warnings: string[];
}

@Injectable()
export class CandidateReferenceResolver {
  constructor(@Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService) {}

  async resolve(
    project: { assets: Array<{ id: string; path: string }> },
    spec: CandidateGenerationSpec,
  ): Promise<CandidateReferenceResolution> {
    const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
    const references: CandidateImageReferenceInput[] = [];
    const warnings: string[] = [];

    for (const requested of spec.references) {
      const asset = assetsById.get(requested.assetId);
      if (!asset?.path) {
        warnings.push(`candidate_reference_asset_missing:${requested.assetId}`);
        continue;
      }
      try {
        const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${asset.path}`);
        references.push({
          assetId: requested.assetId,
          kind: requested.kind,
          label: requested.label,
          priority: Number.isFinite(requested.priority) ? requested.priority : 0,
          buffer: await readFile(absolutePath),
          mimeType: this.getMimeType(absolutePath),
          fileName: path.basename(absolutePath),
        });
      } catch {
        warnings.push(`candidate_reference_unreadable:${requested.assetId}`);
      }
    }

    return { references, warnings };
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    return "image/webp";
  }
}
