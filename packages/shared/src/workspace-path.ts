export const WORKSPACE_VIRTUAL_ROOT = "/workspace" as const;

export class WorkspacePathError extends Error {
  constructor(readonly code: "WORKSPACE_PATH_REQUIRED" | "WORKSPACE_PATH_OUT_OF_WORKSPACE") {
    super(code);
    this.name = "WorkspacePathError";
  }
}

export function normalizeWorkspacePath(input: string): string {
  const raw = input.trim().replaceAll("\\", "/");
  if (!raw) {
    throw new WorkspacePathError("WORKSPACE_PATH_REQUIRED");
  }

  const withRoot = raw === WORKSPACE_VIRTUAL_ROOT || raw.startsWith(`${WORKSPACE_VIRTUAL_ROOT}/`)
    ? raw
    : `${WORKSPACE_VIRTUAL_ROOT}/${raw.replace(/^\/+/, "")}`;

  const parts: string[] = [];
  for (const part of withRoot.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length <= 1) {
        throw new WorkspacePathError("WORKSPACE_PATH_OUT_OF_WORKSPACE");
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  const normalized = `/${parts.join("/")}`;
  if (normalized !== WORKSPACE_VIRTUAL_ROOT && !normalized.startsWith(`${WORKSPACE_VIRTUAL_ROOT}/`)) {
    throw new WorkspacePathError("WORKSPACE_PATH_OUT_OF_WORKSPACE");
  }
  return normalized;
}

export function joinWorkspacePath(...segments: string[]): string {
  return normalizeWorkspacePath(segments.join("/"));
}

export function isWorkspacePath(input: string): boolean {
  try {
    normalizeWorkspacePath(input);
    return true;
  } catch {
    return false;
  }
}
