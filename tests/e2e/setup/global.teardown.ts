import { lstat } from "node:fs/promises";
import {
  cleanupE2ERuntime,
  createE2ERuntime,
  terminateRecordedE2EProcesses,
} from "../support/e2e-env.ts";

export default async function globalTeardown(): Promise<void> {
  const runtime = createE2ERuntime();
  if (await exists(runtime.runtimeDir)) {
    await terminateRecordedE2EProcesses(runtime);
  }
  await cleanupE2ERuntime(runtime);
  console.log(`[e2e-teardown] cleaned run=${runtime.runId}`);
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
