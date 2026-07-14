import type { WorkbenchSnapshot } from "@airoaming/shared";
import { expect, test } from "../support/e2e-fixture.ts";
import {
  prepareG4CandidateFixture,
  replaceCandidate,
} from "../support/g4-candidate-fixture.ts";

test("G4-E：候选收藏、废弃恢复、两阶段定稿、冲突重预览、历史与排版来源提示", async ({
  api,
  page,
  rainSmokeProject,
}) => {
  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  const [candidateA, candidateB, candidateC] = fixture.candidateIds;
  await page.goto(`/projects/${fixture.projectId}/candidates`);
  await expect(page.getByRole("region", { name: "候选图工作台", exact: true })).toBeVisible();
  const cards = page.locator(".candidate-card");
  await expect(cards).toHaveCount(3);
  const cardA = cards.filter({ hasText: "候选 1" });
  const cardB = cards.filter({ hasText: "候选 2" });

  await test.step("收藏与废弃是独立偏好，不会静默改变当前定稿", async () => {
    await cardA.getByRole("button", { name: "收藏 候选 1" }).click();
    await expect(page.getByRole("status")).toContainText("已收藏");
    await expect(cardA.getByRole("button", { name: "取消收藏 候选 1" })).toBeVisible();

    await cardB.getByRole("button", { name: "废弃 候选 2" }).click();
    await expect(page.getByRole("status")).toContainText("已废弃");
    await expect(cardB.getByRole("button", { name: "恢复 候选 2" })).toBeVisible();
    await expect(cardB.getByRole("button", { name: "已废弃" })).toBeDisabled();
    await cardB.getByRole("button", { name: "恢复 候选 2" }).click();
    await expect(page.getByRole("status")).toContainText("已恢复");
  });

  await test.step("首次定稿必须先看影响再由用户确认", async () => {
    await cardA.getByRole("button", { name: "定稿此图" }).click();
    const dialog = page.getByRole("dialog", { name: "确认候选定稿影响" });
    await expect(dialog).toContainText("首次定稿");
    await expect(dialog).toContainText("将 候选 1 设为这个镜头的首次定稿");
    await dialog.getByRole("button", { name: "确认变更" }).click();
    await expect(page.getByRole("status")).toContainText("候选定稿已更新");
    await expect(cardA.getByRole("button", { name: "当前定稿" })).toBeDisabled();
  });

  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/build`);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/export`);
  await page.reload();
  await expect(page.getByRole("region", { name: "候选图工作台", exact: true })).toBeVisible();

  await test.step("409 后自动重算影响，但绝不自动提交", async () => {
    const currentCards = page.locator(".candidate-card");
    await currentCards.filter({ hasText: "候选 2" }).getByRole("button", { name: "更换为此图" }).click();
    const dialog = page.getByRole("dialog", { name: "确认候选定稿影响" });
    await expect(dialog).toContainText("旧排版和导出会保留为历史");

    await replaceCandidate(api, fixture, candidateC!);
    await dialog.getByRole("button", { name: "确认变更" }).click();
    await expect(dialog).toContainText("影响清单已重新计算");
    await expect(dialog).toContainText("本页面没有自动提交");
    expect(await currentCandidateId(api, fixture.projectId, fixture.chapterId, fixture.shotId)).toBe(candidateC);

    await dialog.getByRole("button", { name: "确认变更" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("status")).toContainText("候选定稿已更新");
    expect(await currentCandidateId(api, fixture.projectId, fixture.chapterId, fixture.shotId)).toBe(candidateB);
  });

  await test.step("历史可读，排版页明确显示来源已变化并阻止导出", async () => {
    await page.getByRole("button", { name: "定稿历史" }).click();
    const history = page.getByRole("region", { name: "定稿历史" });
    await expect(history).toContainText("第 3 版 · 更换定稿");
    await expect(history).toContainText("第 2 版 · 更换定稿");
    await expect(history).toContainText("第 1 版 · 首次定稿");

    await page.goto(`/projects/${fixture.projectId}/layout`);
    const sourceStatus = page.getByTestId("candidate-source-status");
    await expect(sourceStatus).toContainText("候选定稿已变化");
    await expect(sourceStatus).toContainText("实际换图与裁切将在成稿编辑阶段处理");
    await expect(page.getByRole("button", { name: "导出 PNG 序列" })).toBeDisabled();
  });

  await test.step("清空当前定稿同样走影响确认，排版页保持 fail-closed", async () => {
    await page.goto(`/projects/${fixture.projectId}/candidates`);
    await page.getByRole("button", { name: "清空当前定稿" }).click();
    const dialog = page.getByRole("dialog", { name: "确认候选定稿影响" });
    await expect(dialog).toContainText("该镜头将暂时没有当前定稿");
    await dialog.getByRole("button", { name: "确认变更" }).click();
    await expect(page.getByRole("status")).toContainText("已清空当前定稿");
    expect(await currentCandidateId(api, fixture.projectId, fixture.chapterId, fixture.shotId)).toBeNull();

    await page.goto(`/projects/${fixture.projectId}/layout`);
    await expect(page.getByTestId("candidate-source-status")).toContainText("候选定稿尚未完整");
    await expect(page.getByRole("button", { name: "生成排版" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "导出 PNG 序列" })).toBeDisabled();
  });
});

async function currentCandidateId(
  api: Parameters<typeof prepareG4CandidateFixture>[0],
  projectId: string,
  chapterId: string,
  shotId: string,
): Promise<string | null> {
  const workbench = await api.get<{ snapshot: WorkbenchSnapshot }>(`/projects/${projectId}/workbench?chapterId=${chapterId}`);
  const shot = workbench.data.snapshot.shots.find((item) => item.id === shotId);
  return shot?.currentCandidateDecision?.state === "finalized" ? shot.currentCandidateDecision.candidateId : null;
}
