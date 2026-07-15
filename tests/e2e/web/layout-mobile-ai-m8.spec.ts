import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  LayoutDocumentCodecV1,
  type LayoutWorkingCopyResponseV1,
  type PendingEditorCommandCurrentResponseV1,
} from "@airoaming/shared";

import { expect, test } from "../support/e2e-fixture.ts";
import { lockCandidate, prepareG4CandidateFixture } from "../support/g4-candidate-fixture.ts";

test("G5-M8：手机只读与 AI Pending preview/discard/apply/expire/Undo 形成 DB-only 闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(90_000);
  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await page.getByRole("button", { name: "创建数据库草稿" }).click();
  await expect(page.getByTestId("layout-m6-control-center")).toBeVisible();

  await test.step("画布尺寸两种模式均先预览，并可由一次 Undo 完整恢复", async () => {
    const resize = page.getByTestId("layout-profile-resize-preview");
    await expect(resize).toBeVisible();
    await resize.getByLabel("已有内容处理").selectOption("keep_coordinates");
    await resize.getByLabel("新段默认高").fill("2048");
    await expect(resize).toContainText("已有内容坐标不变");
    await resize.getByRole("button", { name: "应用尺寸调整（可撤销）" }).click();
    await page.getByRole("button", { name: "撤销", exact: true }).click();

    await resize.getByLabel("已有内容处理").selectOption("scale_uniform");
    await resize.getByLabel("宽度").fill("1200");
    await expect(resize).toContainText("已有内容将等比缩放");
    await resize.getByRole("button", { name: "应用尺寸调整（可撤销）" }).click();
    await page.getByRole("button", { name: "撤销", exact: true }).click();

    await resize.getByLabel("当前段高度").fill("2000");
    await resize.getByRole("button", { name: "调整当前段高（可撤销）" }).click();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await page.getByRole("button", { name: "立即保存" }).click();
    await expect(page.locator(".editor-status")).toContainText("已保存到数据库", { timeout: 8_000 });
  });

  const before = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  const beforePanel = before.document.canvases[0]?.elements[0];
  if (beforePanel?.type !== "panel_frame" || !beforePanel.contentImage) throw new Error("G5_M8_PANEL_SOURCE_MISSING");

  await page.locator(".canvas-element").first().click();
  await page.getByRole("button", { name: "AI 建议" }).click();
  const drawer = page.getByTestId("layout-ai-drawer");
  await expect(drawer).toBeVisible();

  await test.step("preview 和 discard 均不写 Working Copy", async () => {
    await drawer.getByRole("button", { name: "预览构图微调建议" }).click();
    const preview = page.getByTestId("layout-ai-command-preview");
    await expect(preview).toContainText("横向微调 8 像素");
    await expect(preview).toContainText(beforePanel.id);
    const duringPreview = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect({ rowVersion: duringPreview.rowVersion, digest: duringPreview.documentDigest }).toEqual({
      rowVersion: before.rowVersion,
      digest: before.documentDigest,
    });
    await preview.getByRole("button", { name: "放弃建议" }).click();
    await expect(page.getByTestId("layout-ai-command-preview")).not.toBeVisible();
    const afterDiscard = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect({ rowVersion: afterDiscard.rowVersion, digest: afterDiscard.documentDigest }).toEqual({
      rowVersion: before.rowVersion,
      digest: before.documentDigest,
    });
  });

  await test.step("apply 是一次原子写，随后一次 Undo 恢复原文档", async () => {
    await drawer.getByRole("button", { name: "预览构图微调建议" }).click();
    await page.getByTestId("layout-ai-command-preview").getByRole("button", { name: "应用为一次可撤销操作" }).click();
    const applied = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    const appliedPanel = applied.document.canvases[0]?.elements[0];
    expect(applied.rowVersion).toBe(before.rowVersion + 1);
    expect(applied.documentDigest).not.toBe(before.documentDigest);
    expect(appliedPanel?.transform.x).not.toBe(beforePanel.transform.x);
    await expect(page.getByTitle("撤销")).toBeEnabled();
    await page.getByTitle("撤销").click();
    const saveNow = page.getByRole("button", { name: "立即保存" });
    await expect(saveNow).toBeEnabled();
    await saveNow.click();
    await expect(page.locator(".editor-status")).toContainText("已保存到数据库", { timeout: 8_000 });
    const undone = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect(undone.document).toEqual(before.document);
  });

  await test.step("来源命令被拒绝，草稿变化会让旧 Pending 自动过期", async () => {
    const current = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    const currentCanvas = current.document.canvases[0]!;
    const currentPanel = currentCanvas.elements[0];
    if (currentPanel?.type !== "panel_frame" || !currentPanel.contentImage) throw new Error("G5_M8_SOURCE_COMMAND_PANEL_MISSING");
    const sourceCommandResponse = await page.request.post(
      `${runtime.apiBaseUrl}/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/preview`,
      {
        data: {
          schemaVersion: 1,
          expectedWorkingCopyRowVersion: current.rowVersion,
          expectedDocumentDigest: current.documentDigest,
          selectionElementIds: [currentPanel.id],
          summary: "不允许由 AI 直接换图",
          warnings: [],
          commandBatch: {
            schemaVersion: 1,
            batchId: "m8_forbidden_source_batch",
            label: "不允许的来源替换",
            commands: [{
              schemaVersion: 1,
              commandId: "m8_forbidden_source_command",
              type: "image.replace_source",
              label: "不允许的来源替换",
              payload: {
                canvasId: currentCanvas.id,
                elementId: currentPanel.id,
                source: currentPanel.contentImage.source,
                crop: currentPanel.contentImage.crop,
              },
            }],
          },
        },
        failOnStatusCode: false,
      },
    );
    expect(sourceCommandResponse.status()).toBe(409);
    expect(await sourceCommandResponse.json()).toMatchObject({
      error: { code: "LAYOUT_PENDING_SOURCE_REPLACEMENT_REQUIRED" },
    });

    await page.locator(".canvas-element").first().click();
    await drawer.getByRole("button", { name: "预览构图微调建议" }).click();
    const pending = (await api.get<PendingEditorCommandCurrentResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/current`,
    )).data.item;
    expect(pending?.status).toBe("pending");
    const changedDocument = structuredClone(current.document);
    changedDocument.canvases[0]!.name = `${changedDocument.canvases[0]!.name} · Pending 过期见证`;
    const changed = LayoutDocumentCodecV1.encode(changedDocument);
    await api.put(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`, {
      schemaVersion: 1,
      expectedRowVersion: current.rowVersion,
      baseDocumentDigest: current.documentDigest,
      documentDigest: changed.digest,
      document: changed.value,
    });
    const expiredResponse = await page.request.post(
      `${runtime.apiBaseUrl}/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/${pending!.id}/apply`,
      { failOnStatusCode: false },
    );
    expect(expiredResponse.status()).toBe(409);
    expect(await expiredResponse.json()).toMatchObject({ error: { code: "LAYOUT_PENDING_COMMAND_EXPIRED" } });
    expect((await api.get<PendingEditorCommandCurrentResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/current`,
    )).data.item).toBeNull();
  });

  await test.step("手机 route 只发 GET/HEAD，且没有任何编辑写入口", async () => {
    const previewRequests: Array<{ method: string; url: string }> = [];
    page.on("request", (request) => previewRequests.push({ method: request.method(), url: request.url() }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${fixture.projectId}/layout/preview?chapterId=${fixture.chapterId}&source=working_copy`);
    const mobile = page.getByTestId("layout-mobile-preview");
    await expect(mobile).toBeVisible();
    await expect(mobile).toContainText("本页面没有初始化、保存版本、出版或 AI 应用入口");
    await expect(mobile.getByRole("button")).toHaveCount(0);
    const apiRequests = previewRequests.filter((request) => request.url.startsWith(runtime.apiBaseUrl));
    expect(apiRequests.length).toBeGreaterThan(0);
    expect(apiRequests.filter((request) => !["GET", "HEAD"].includes(request.method))).toEqual([]);
    const evidenceRoot = path.resolve("文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence");
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({ path: path.join(evidenceRoot, "g5_m8_mobile_ai.png"), fullPage: true });
  });
});
