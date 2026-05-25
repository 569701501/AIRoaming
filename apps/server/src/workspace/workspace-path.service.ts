import { Injectable } from "@nestjs/common";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWorkspacePath, WORKSPACE_VIRTUAL_ROOT } from "@airoaming/shared";

const DEFAULT_WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../workspace",
);

@Injectable()
export class WorkspacePathService {
  private readonly rootPath = path.resolve(process.env.AIROAMING_WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT);

  async ensureReady(): Promise<void> {
    await mkdir(path.join(this.rootPath, "projects"), { recursive: true });
  }

  getInfo() {
    return {
      virtualRoot: WORKSPACE_VIRTUAL_ROOT,
      projectsPath: "/workspace/projects" as const,
      ready: true,
    };
  }

  resolveVirtualPath(input: string): string {
    const virtualPath = normalizeWorkspacePath(input);
    const relative = virtualPath === WORKSPACE_VIRTUAL_ROOT
      ? ""
      : virtualPath.slice(`${WORKSPACE_VIRTUAL_ROOT}/`.length);
    const absolutePath = path.resolve(this.rootPath, relative);
    const rootWithSeparator = `${this.rootPath}${path.sep}`;

    if (absolutePath !== this.rootPath && !absolutePath.startsWith(rootWithSeparator)) {
      throw new Error("WORKSPACE_PATH_OUT_OF_WORKSPACE");
    }

    return absolutePath;
  }
}
