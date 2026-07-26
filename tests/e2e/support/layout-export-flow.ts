import type { Locator } from "@playwright/test";

export async function completeSimpleExportFlow(
  dialog: Locator,
  onReview?: () => Promise<void>,
): Promise<void> {
  const confirm = dialog.getByRole("button", { name: "按当前文字导出" });
  const done = dialog.getByText("导出完成").first();
  const failed = dialog.getByText("导出没有完成").first();
  const blocked = dialog.getByText("这不是可以忽略的提醒").first();
  const deadline = Date.now() + 60_000;
  let confirmed = false;
  while (Date.now() < deadline) {
    if (await done.isVisible().catch(() => false)) return;
    if (await failed.isVisible().catch(() => false)) {
      throw new Error(`LAYOUT_SIMPLE_EXPORT_FAILED:${await dialog.innerText()}`);
    }
    if (await blocked.isVisible().catch(() => false)) {
      throw new Error(`LAYOUT_SIMPLE_EXPORT_BLOCKED:${await dialog.innerText()}`);
    }
    if (!confirmed && await confirm.isVisible().catch(() => false)) {
      await onReview?.();
      await confirm.click();
      confirmed = true;
      continue;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }
  throw new Error(`LAYOUT_SIMPLE_EXPORT_TIMEOUT:${await dialog.innerText()}`);
}
