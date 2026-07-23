import { expect, test } from "../support/e2e-fixture.ts";

const EXPECTED_STAGE_LABELS = [
  "剧本",
  "剧情结构",
  "分镜工作台",
  "出图准备",
  "候选图工作台",
  "漫画成稿",
  "素材包",
] as const;

test("UI-01～UI-05：项目库进入剧本工作区后锁住等待阶段并可返回", async ({
  browserNetworkAudit,
  page,
  rainSmokeProject,
  runtime,
}) => {
  await test.step("UI-01：项目库显示 rain_smoke", async () => {
    await page.goto("/projects");
    await expect(page.getByRole("region", { name: "绘界漫画项目库" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的项目" })).toBeVisible();
    await expect(page.getByText(rainSmokeProject.name, { exact: true })).toBeVisible();
  });

  await test.step("UI-02：点击项目卡进入项目剧本 URL 和工作区", async () => {
    await page.getByText(rainSmokeProject.name, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${escapeRegExp(rainSmokeProject.id)}/script(?:/[^/?#]+)?$`));
    await expect(page.getByRole("region", { name: "剧本工作区" })).toBeVisible();
  });

  await test.step("UI-03：流程栏七个标签有序，只有当前剧本可用", async () => {
    const stageRail = page.getByRole("region", { name: "项目创作流程" });
    const stageButtons = stageRail.getByRole("button");
    await expect(stageRail).toBeVisible();
    await expect(stageButtons).toHaveCount(EXPECTED_STAGE_LABELS.length);

    for (const [index, label] of EXPECTED_STAGE_LABELS.entries()) {
      await expect(stageButtons.nth(index)).toContainText(label);
    }
    await expect(stageButtons.first()).toBeEnabled();
    for (let index = 1; index < EXPECTED_STAGE_LABELS.length; index += 1) {
      await expect(stageButtons.nth(index)).toBeDisabled();
    }
  });

  await test.step("UI-04：真实尝试点击 waiting 阶段不会离开剧本", async () => {
    const urlBeforeAttempt = page.url();
    const structureButton = page
      .getByRole("region", { name: "项目创作流程" })
      .getByRole("button", { name: /剧情结构/ });

    await expect(structureButton).toBeDisabled();
    await structureButton.click({ force: true });
    await expect(page).toHaveURL(urlBeforeAttempt);
    await expect(page.getByRole("region", { name: "剧本工作区" })).toBeVisible();
  });

  await test.step("UI-05：返回项目列表后项目仍存在", async () => {
    await page.getByRole("button", { name: "返回项目列表" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("region", { name: "绘界漫画项目库" })).toBeVisible();
    await expect(page.getByText(rainSmokeProject.name, { exact: true })).toBeVisible();
  });

  await test.step("浏览器网络审计：只继续当前运行的 loopback 请求", async () => {
    const audit = browserNetworkAudit.summary();
    const allowedOrigins = new Set([runtime.webUrl, runtime.serverUrl, runtime.providerUrl]);

    expect(audit.continuedLoopbackRequests).toBeGreaterThan(0);
    expect(audit.continuedExternalRequests).toBe(0);
    expect(audit.blockedInvalidRequests).toBe(0);
    expect(audit.continuedNetworkOrigins.every((origin) => allowedOrigins.has(origin))).toBe(true);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
