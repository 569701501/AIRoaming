import { accessSync, constants, realpathSync, statSync } from "node:fs";
import path from "node:path";

const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/;

export interface ReanchorChromiumPathInput {
  readonly reportedPath: string;
  readonly runId: string;
  readonly home?: string;
  readonly xdgCacheHome?: string;
  readonly accountHome: string;
  readonly platform: NodeJS.Platform;
  readonly repoRoot: string;
  readonly testRoot: string;
  readonly playwrightCorePackageDir: string;
}

export interface ValidateChromiumExecutableInput {
  readonly candidatePath: string;
  readonly accountHome: string;
  readonly platform: NodeJS.Platform;
  readonly repoRoot: string;
  readonly playwrightCorePackageDir: string;
}

export function reanchorRunOwnedChromiumPath(input: ReanchorChromiumPathInput): string {
  const reportedPath = path.resolve(input.reportedPath);
  const accountRegistryRoot = defaultAccountRegistryRoot(input.accountHome, input.platform);
  if (strictSuffix(accountRegistryRoot, reportedPath, "E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT")) {
    return reportedPath;
  }

  const localBrowserRoot = trustedLocalBrowserRoot(input.repoRoot, input.playwrightCorePackageDir);
  if (
    localBrowserRoot
    && strictSuffix(localBrowserRoot, reportedPath, "E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT")
  ) {
    return reportedPath;
  }

  if (
    RUN_ID_PATTERN.test(input.runId)
    && path.basename(path.resolve(input.testRoot)) === `airoaming-e2e-${input.runId}`
  ) {
    const expectedHome = path.join(path.resolve(input.testRoot), "home");
    if (input.home && samePath(input.home, expectedHome)) {
      const suffix = strictSuffix(
        defaultRunHomeRegistryRoot(expectedHome, input.platform),
        reportedPath,
        "E2E_CHROMIUM_REANCHOR_SUFFIX_INVALID",
      );
      if (suffix) {
        return path.join(accountRegistryRoot, suffix);
      }
    }

    const expectedXdgCache = path.join(path.resolve(input.testRoot), "xdg-cache");
    if (input.xdgCacheHome && samePath(input.xdgCacheHome, expectedXdgCache)) {
      const suffix = strictSuffix(
        path.join(expectedXdgCache, "ms-playwright"),
        reportedPath,
        "E2E_CHROMIUM_REANCHOR_SUFFIX_INVALID",
      );
      if (suffix) {
        return path.join(accountRegistryRoot, suffix);
      }
    }
  }

  throw new Error("E2E_CHROMIUM_PATH_OUTSIDE_ALLOWED_ROOT");
}

export function validateAllowedChromiumExecutablePath(
  input: ValidateChromiumExecutableInput,
): string {
  const candidatePath = path.resolve(input.candidatePath);
  const accountRegistryRoot = defaultAccountRegistryRoot(input.accountHome, input.platform);
  const localBrowserRoot = trustedLocalBrowserRoot(input.repoRoot, input.playwrightCorePackageDir);
  const accountSuffix = strictSuffix(
    accountRegistryRoot,
    candidatePath,
    "E2E_CHROMIUM_EXECUTABLE_OUTSIDE_ALLOWED_ROOT",
  );
  const localSuffix = localBrowserRoot
    ? strictSuffix(
      localBrowserRoot,
      candidatePath,
      "E2E_CHROMIUM_EXECUTABLE_OUTSIDE_ALLOWED_ROOT",
    )
    : null;
  const allowedKind = accountSuffix ? "account" : localSuffix ? "local" : null;
  const allowedRoot = allowedKind === "account" ? accountRegistryRoot : localBrowserRoot;
  if (!allowedKind || !allowedRoot) {
    throw new Error("E2E_CHROMIUM_EXECUTABLE_OUTSIDE_ALLOWED_ROOT");
  }

  let canonicalCandidate: string;
  let canonicalAllowedRoot: string;
  try {
    canonicalCandidate = realpathSync(candidatePath);
    canonicalAllowedRoot = realpathSync(allowedRoot);
  } catch {
    throw new Error("E2E_CHROMIUM_EXECUTABLE_INVALID");
  }

  if (allowedKind === "account") {
    let canonicalDefaultCache: string;
    try {
      canonicalDefaultCache = realpathSync(defaultAccountCacheRoot(input.accountHome, input.platform));
    } catch {
      throw new Error("E2E_CHROMIUM_EXECUTABLE_INVALID");
    }
    if (
      path.basename(canonicalAllowedRoot) !== "ms-playwright"
      || !isStrictlyInside(canonicalDefaultCache, canonicalAllowedRoot)
    ) {
      throw new Error("E2E_CHROMIUM_EXECUTABLE_OUTSIDE_ALLOWED_ROOT");
    }
  } else {
    let canonicalNodeModules: string;
    let canonicalPackageDir: string;
    try {
      canonicalNodeModules = realpathSync(path.join(path.resolve(input.repoRoot), "node_modules"));
      canonicalPackageDir = realpathSync(input.playwrightCorePackageDir);
    } catch {
      throw new Error("E2E_CHROMIUM_EXECUTABLE_INVALID");
    }
    if (
      path.basename(canonicalPackageDir) !== "playwright-core"
      || path.basename(canonicalAllowedRoot) !== ".local-browsers"
      || !isStrictlyInside(canonicalNodeModules, canonicalPackageDir)
      || !isStrictlyInside(canonicalPackageDir, canonicalAllowedRoot)
    ) {
      throw new Error("E2E_CHROMIUM_EXECUTABLE_OUTSIDE_ALLOWED_ROOT");
    }
  }

  if (!isStrictlyInside(canonicalAllowedRoot, canonicalCandidate)) {
    throw new Error("E2E_CHROMIUM_EXECUTABLE_OUTSIDE_ALLOWED_ROOT");
  }
  try {
    if (!statSync(canonicalCandidate).isFile()) {
      throw new Error("E2E_CHROMIUM_EXECUTABLE_NOT_FILE");
    }
    accessSync(canonicalCandidate, constants.X_OK);
  } catch {
    throw new Error("E2E_CHROMIUM_EXECUTABLE_INVALID");
  }
  return canonicalCandidate;
}

function trustedLocalBrowserRoot(repoRoot: string, playwrightCorePackageDir: string): string | null {
  const nodeModulesRoot = path.join(path.resolve(repoRoot), "node_modules");
  const packageDir = path.resolve(playwrightCorePackageDir);
  if (!isStrictlyInside(nodeModulesRoot, packageDir) || path.basename(packageDir) !== "playwright-core") {
    return null;
  }
  return path.join(packageDir, ".local-browsers");
}

function strictSuffix(root: string, candidate: string, emptyError: string): string | null {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === "") {
    throw new Error(emptyError);
  }
  if (
    path.isAbsolute(relative)
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || relative.split(path.sep).includes("..")
  ) {
    return null;
  }
  return relative;
}

function defaultRunHomeRegistryRoot(home: string, platform: NodeJS.Platform): string {
  return path.join(
    path.resolve(home),
    ...(platform === "darwin" ? ["Library", "Caches", "ms-playwright"] : [".cache", "ms-playwright"]),
  );
}

function defaultAccountRegistryRoot(accountHome: string, platform: NodeJS.Platform): string {
  return path.join(defaultAccountCacheRoot(accountHome, platform), "ms-playwright");
}

function defaultAccountCacheRoot(accountHome: string, platform: NodeJS.Platform): string {
  return platform === "darwin"
    ? path.join(path.resolve(accountHome), "Library", "Caches")
    : path.join(path.resolve(accountHome), ".cache");
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

function isStrictlyInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
