import { access } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("@infra keeps the effective Chromium path outside the run-owned HOME", async ({}, testInfo) => {
  const executablePath = testInfo.project.use.launchOptions?.executablePath;
  expect(executablePath).toEqual(expect.any(String));
  expect(path.isAbsolute(executablePath!)).toBe(true);
  expect(executablePath!.startsWith(process.env.HOME ?? "")).toBe(false);
  await expect(access(executablePath!)).resolves.toBeUndefined();
});
