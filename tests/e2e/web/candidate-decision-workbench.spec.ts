import type {
  CreateLayoutRevisionResponseV1,
  InitializeLayoutWorkingCopyResponseV1,
  LayoutPublicationHistoryResponseV1,
  LayoutPreflightReportV1,
  SaveLayoutWorkingCopyResponseV1,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { LayoutDocumentCodecV1, LayoutPublicationProfileCodecV1 } from "@airoaming/shared";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../support/e2e-fixture.ts";
import {
  generateG4Candidates,
  prepareG4CandidateFixture,
  replaceCandidate,
} from "../support/g4-candidate-fixture.ts";

test("P23-P26：新项目候选图页面展示服务端统一的干净底图 Prompt", async ({
  api,
  page,
  provider,
  rainSmokeProject,
}) => {
  test.setTimeout(60_000);
  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);

  await page.goto(`/projects/${fixture.projectId}/candidates`);
  await expect(page.getByRole("region", { name: "候选图工作台", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /干净底图 Prompt/ }).click();

  const promptPanel = page.locator(".prompt-preview-panel");
  const finalPrompt = promptPanel.locator(".prompt-full pre");
  await expect(promptPanel).toContainText("单镜头 · 单幅 · 无文字/气泡 · 无分格/边框");
  await expect(promptPanel).toContainText("主体与静态瞬间");
  await expect(promptPanel).toContainText("环境、光线与氛围");
  await expect(finalPrompt).toContainText("OUTPUT CONTRACT");
  await expect(finalPrompt).toContainText("foreground/midground/background separation");
  await expect(finalPrompt).toContainText("Do not create page layouts");
  await expect(finalPrompt).not.toContainText("Avoid:");
  await expect(finalPrompt).not.toContainText("竖滑条漫");

  const providerRequests = await provider.listRequests();
  expect(providerRequests.some((request) => request.method === "POST")).toBe(true);

  const evidenceRoot = path.resolve(
    "文档/05_执行与记录/任务记录/2026-07-16_下游提示词优化/evidence",
  );
  await mkdir(evidenceRoot, { recursive: true });
  await promptPanel.screenshot({ path: path.join(evidenceRoot, "candidate_prompt_preview.png") });
});

test("G4-F：候选决策完整链、导出后新候选、双窗口冲突、历史与来源门禁", async ({
  api,
  page,
  rainSmokeProject,
}) => {
  // 该用例包含一次真实 LayoutRevision + Chromium publication worker，不能沿用旧同步复制导出的 60 秒上限。
  test.setTimeout(120_000);
  const evidenceRoot = path.resolve(
    "文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence",
  );
  await mkdir(evidenceRoot, { recursive: true });
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

  await test.step("A→B→clear→A 只追加线性历史，不复用旧 revision", async () => {
    await cardB.getByRole("button", { name: "更换为此图" }).click();
    let dialog = page.getByRole("dialog", { name: "确认候选定稿影响" });
    await expect(dialog).toContainText("更换定稿");
    await dialog.getByRole("button", { name: "确认变更" }).click();
    expect(await currentCandidateId(api, fixture.projectId, fixture.chapterId, fixture.shotId)).toBe(candidateB);

    await page.getByRole("button", { name: "清空当前定稿" }).click();
    dialog = page.getByRole("dialog", { name: "确认候选定稿影响" });
    await dialog.getByRole("button", { name: "确认变更" }).click();
    expect(await currentCandidateId(api, fixture.projectId, fixture.chapterId, fixture.shotId)).toBeNull();

    await cardA.getByRole("button", { name: "定稿此图" }).click();
    dialog = page.getByRole("dialog", { name: "确认候选定稿影响" });
    await dialog.getByRole("button", { name: "确认变更" }).click();
    expect(await currentCandidateId(api, fixture.projectId, fixture.chapterId, fixture.shotId)).toBe(candidateA);
  });

  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);
  const initialized = await api.post<InitializeLayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy/initialize`,
    {
      schemaVersion: 1,
      profile: { kind: "vertical_strip", presetId: "webtoon_1080", width: 1080, defaultSectionHeight: 1920, safeInsetX: 64 },
      initializationMode: "default_storyboard_layout",
      expectedCurrentLayoutRevisionId: null,
    },
  );
  const publicationDocument = structuredClone(initialized.data.value.document);
  const publicationPanel = publicationDocument.canvases[0]?.elements[0];
  if (publicationPanel?.type !== "panel_frame" || !publicationPanel.contentImage) throw new Error("G4_F_PUBLICATION_PANEL_MISSING");
  publicationPanel.transform = { ...publicationPanel.transform, x: 64, y: 64, width: 1, height: 1 };
  publicationPanel.shape.cornerRadius = 0;
  publicationPanel.contentImage.crop = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false };
  const publicationEncoded = LayoutDocumentCodecV1.encode(publicationDocument);
  const publicationWorkingCopy = await api.put<SaveLayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    {
      schemaVersion: 1,
      expectedRowVersion: initialized.data.value.rowVersion,
      baseDocumentDigest: initialized.data.value.documentDigest,
      documentDigest: publicationEncoded.digest,
      document: publicationEncoded.value,
    },
  );
  const preflight = await api.post<LayoutPreflightReportV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/preflight`,
    {
      schemaVersion: 1,
      target: {
        kind: "working_copy",
        expectedRowVersion: publicationWorkingCopy.data.value.rowVersion,
        expectedDocumentDigest: publicationWorkingCopy.data.value.documentDigest,
      },
      profile: null,
    },
  );
  const formalRevision = await api.post<CreateLayoutRevisionResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions`,
    {
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: publicationWorkingCopy.data.value.rowVersion,
      expectedDocumentDigest: publicationWorkingCopy.data.value.documentDigest,
      expectedCurrentRevisionId: null,
      saveReason: "user_checkpoint",
      acknowledgedIssueKeys: preflight.data.issues.filter((issue) => issue.requiresAcknowledgement).map((issue) => issue.issueKey),
    },
  );
  const publicationProfile = {
    schemaVersion: 1 as const,
    kind: "vertical_publication" as const,
    outputScale: 1 as const,
    maxSliceHeightPx: 2048,
    cutPolicy: "prefer_section_boundary_then_exact" as const,
    includeLongPng: true,
  };
  const exportPreflight = await api.post<LayoutPreflightReportV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/preflight`,
    {
      schemaVersion: 1,
      target: { kind: "layout_revision", layoutRevisionId: formalRevision.data.revision.id },
      profile: publicationProfile,
    },
  );
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/exports/layout-publications`, {
    schemaVersion: 1,
    requestId: `g4-f-publication-${Date.now()}`,
    layoutRevisionId: formalRevision.data.revision.id,
    expectedCurrentLayoutRevisionId: formalRevision.data.revision.id,
    profile: publicationProfile,
    profileDigest: LayoutPublicationProfileCodecV1.encode(publicationProfile).digest,
    preflightDigest: exportPreflight.data.preflightDigest,
    acknowledgedIssueKeys: exportPreflight.data.issues.filter((issue) => issue.requiresAcknowledgement).map((issue) => issue.issueKey),
  });
  await expect.poll(async () => (await api.get<LayoutPublicationHistoryResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/exports/layout-publications`,
  )).data.items[0]?.status, { timeout: 45_000 }).toBe("ready");

  await test.step("已导出后只生成新候选不会改变当前定稿或来源 freshness", async () => {
    const before = await api.get<{ snapshot: WorkbenchSnapshot }>(`/projects/${fixture.projectId}/workbench?chapterId=${fixture.chapterId}`);
    await generateG4Candidates(api, fixture, 1);
    const after = await api.get<{ snapshot: WorkbenchSnapshot }>(`/projects/${fixture.projectId}/workbench?chapterId=${fixture.chapterId}`);
    expect(after.data.snapshot.candidates).toHaveLength(before.data.snapshot.candidates.length + 1);
    expect(after.data.snapshot.shots.find((item) => item.id === fixture.shotId)?.currentCandidateDecision).toMatchObject({
      state: "finalized",
      candidateId: candidateA,
      revision: 4,
    });
    expect(after.data.snapshot.candidateSources).toMatchObject({
      currentLayout: { source: { sourceResolution: "current" } },
      currentExport: { source: { sourceResolution: "current" } },
      gates: {
        exportLayout: { allowed: true },
        exportPackage: { allowed: true },
      },
    });
  });

  await page.reload();
  await expect(page.getByRole("region", { name: "候选图工作台", exact: true })).toBeVisible();

  await test.step("409 后自动重算影响，但绝不自动提交", async () => {
    await page.getByRole("button", { name: "第 1 次生成 3 张" }).click();
    const currentCards = page.locator(".candidate-card");
    await currentCards.filter({ hasText: "候选 2" }).getByRole("button", { name: "更换为此图" }).click();
    const dialog = page.getByRole("dialog", { name: "确认候选定稿影响" });
    await expect(dialog).toContainText("旧排版和导出会保留为历史");

    await replaceCandidate(api, fixture, candidateC!);
    await dialog.getByRole("button", { name: "确认变更" }).click();
    await expect(dialog).toContainText("影响清单已重新计算");
    await expect(dialog).toContainText("本页面没有自动提交");
    expect(await currentCandidateId(api, fixture.projectId, fixture.chapterId, fixture.shotId)).toBe(candidateC);
    await page.screenshot({
      path: path.join(evidenceRoot, "g4_f_conflict_repreview.png"),
      fullPage: true,
    });

    await dialog.getByRole("button", { name: "确认变更" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("status")).toContainText("候选定稿已更新");
    expect(await currentCandidateId(api, fixture.projectId, fixture.chapterId, fixture.shotId)).toBe(candidateB);
  });

  await test.step("历史可读，排版页明确显示来源已变化并阻止导出", async () => {
    await page.getByRole("button", { name: "定稿历史" }).click();
    const history = page.getByRole("region", { name: "定稿历史" });
    await expect(history).toContainText("第 6 版 · 更换定稿");
    await expect(history).toContainText("第 5 版 · 更换定稿");
    await expect(history).toContainText("第 4 版 · 首次定稿");
    await expect(history).toContainText("第 1 版 · 首次定稿");
    await history.screenshot({
      path: path.join(evidenceRoot, "g4_f_candidate_history.png"),
    });

    await page.goto(`/projects/${fixture.projectId}/layout`);
    const sourceStatus = page.getByTestId("candidate-source-status");
    await expect(sourceStatus).toContainText("候选定稿已变化");
    await expect(sourceStatus).toContainText("可在下方先预览换图及裁切，再显式提交到当前草稿");
    await page.getByRole("button", { name: "版本与出版" }).click();
    await page.getByTestId("layout-publication-center").getByRole("button", { name: "运行导出预检" }).click();
    await expect(page.getByTestId("layout-publication-preflight")).toBeVisible();
    await expect(page.getByText("存在阻断", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "开始正式出版" })).toBeDisabled();
    await page.screenshot({
      path: path.join(evidenceRoot, "g4_f_layout_stale.png"),
      fullPage: true,
    });
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
    await expect(page.getByRole("button", { name: "按镜头排版" })).toBeDisabled();
    await page.getByRole("button", { name: "版本与出版" }).click();
    await page.getByTestId("layout-publication-center").getByRole("button", { name: "运行导出预检" }).click();
    await expect(page.getByTestId("layout-publication-preflight")).toBeVisible();
    await expect(page.getByRole("button", { name: "开始正式出版" })).toBeDisabled();
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
