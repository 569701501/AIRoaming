import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  LayoutDocumentCodecV1,
  type ApplyPendingEditorCommandResponseV1,
  type LayoutWorkingCopyResponseV1,
  type PendingEditorCommandCurrentResponseV1,
  type PendingEditorCommandPreviewV1,
} from "@airoaming/shared";

import { expect, test } from "../support/e2e-fixture.ts";
import { lockCandidate, prepareG4CandidateFixture } from "../support/g4-candidate-fixture.ts";
import { initializeLegacyLayoutWorkingCopy } from "../support/g5-layout-fixture.ts";

test("G5-M8：手机只读与 Pending preview/discard/apply/expire 形成 DB-only 闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(90_000);
  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);
  await initializeLegacyLayoutWorkingCopy(
    api,
    rainSmokeProject,
    fixture.projectId,
    fixture.chapterId,
  );

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await expect(page.locator(".document-canvas")).toBeVisible({ timeout: 45_000 });
  await page.getByLabel("展开页面与素材栏").click();
  await expect(page.getByTestId("shot-tray")).toBeVisible();

  await test.step("画布尺寸调整先预览后应用，可再次应用改回", async () => {
    // 画布尺寸收进「画布设置」抽屉
    await page.getByLabel("画布设置").click();
    const resize = page.getByTestId("layout-profile-resize-preview");
    await expect(resize).toBeVisible();
    const workingCopyUrl = `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`;

    await resize.getByLabel("已有内容处理").selectOption("keep_coordinates");
    await resize.getByLabel("新段默认高").fill("2048");
    await expect(resize).toContainText("已有内容坐标不变");
    await resize.getByRole("button", { name: "应用尺寸调整" }).click();
    await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
    let current = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
    expect(current.document.profile).toMatchObject({ defaultSectionHeight: 2048 });

    await resize.getByLabel("已有内容处理").selectOption("scale_uniform");
    await resize.getByLabel("宽度").fill("1080");
    await expect(resize).toContainText("已有内容将等比缩放");
    await resize.getByLabel("新段默认高").fill("1920");
    await resize.getByRole("button", { name: "应用尺寸调整" }).click();
    await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
    current = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
    expect(current.document.profile).toMatchObject({ width: 1080, defaultSectionHeight: 1920 });

    await resize.getByLabel("当前段高度").fill("2000");
    await resize.getByRole("button", { name: "调整当前段高" }).click();
    await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
    current = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
    expect(current.document.canvases[0]?.height).toBe(2000);

    await resize.getByLabel("当前段高度").fill("1920");
    await resize.getByRole("button", { name: "调整当前段高" }).click();
    await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
  });

  await test.step("V1 旧格式成稿不能导出", async () => {
    await page.getByTestId("layout-simple-export").click();
    const dialog = page.getByTestId("layout-export-dialog");
    await expect(dialog).toContainText("当前成稿还是旧格式");
    await dialog.getByRole("button", { name: "返回修改" }).click();
    await expect(dialog).toBeHidden();
  });

  const before = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  const beforePanel = before.document.canvases[0]?.elements[0];
  if (beforePanel?.type !== "panel_frame" || !beforePanel.contentImage) throw new Error("G5_M8_PANEL_SOURCE_MISSING");

  await test.step("preview 和 discard 均不写 Working Copy", async () => {
    const preview = (await api.post<PendingEditorCommandPreviewV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/preview`,
      microPendingInput(before),
    )).data;
    expect(preview.payload.summary).toContain("横向微调 8 像素");
    expect(preview.payload.changedElementIds).toContain(beforePanel.id);
    const duringPreview = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect({ rowVersion: duringPreview.rowVersion, digest: duringPreview.documentDigest }).toEqual({
      rowVersion: before.rowVersion,
      digest: before.documentDigest,
    });
    await api.delete(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/${preview.id}`,
    );
    const afterDiscard = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect({ rowVersion: afterDiscard.rowVersion, digest: afterDiscard.documentDigest }).toEqual({
      rowVersion: before.rowVersion,
      digest: before.documentDigest,
    });
  });

  await test.step("apply 是一次原子写，恢复时仍走 Working Copy CAS", async () => {
    const preview = (await api.post<PendingEditorCommandPreviewV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/preview`,
      microPendingInput(before),
    )).data;
    const applyResult = (await api.post<ApplyPendingEditorCommandResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/${preview.id}/apply`,
    )).data;
    const applied = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    const appliedPanel = applied.document.canvases[0]?.elements[0];
    expect(applied.rowVersion).toBe(before.rowVersion + 1);
    expect(applied.documentDigest).not.toBe(before.documentDigest);
    expect(appliedPanel?.transform.x).not.toBe(beforePanel.transform.x);
    expect(applyResult.workingCopy.documentDigest).toBe(applied.documentDigest);
    const original = LayoutDocumentCodecV1.encode(before.document);
    await api.put(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`, {
      schemaVersion: 1,
      expectedRowVersion: applied.rowVersion,
      baseDocumentDigest: applied.documentDigest,
      documentDigest: original.digest,
      document: original.value,
    });
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

    await api.post<PendingEditorCommandPreviewV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/pending-commands/preview`,
      microPendingInput(current),
    );
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
    const evidenceRoot = path.resolve("文档/05_执行与记录/任务记录/2026-07-26_漫画成稿体验评估与P0修复/evidence");
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({ path: path.join(evidenceRoot, "g5_m8_mobile_ai.png"), fullPage: true });
  });
});

function microPendingInput(current: LayoutWorkingCopyResponseV1) {
  if (current.document.schemaVersion !== 1) {
    throw new Error("G5_M8_EXPECTED_LAYOUT_DOCUMENT_V1");
  }
  const canvas = current.document.canvases[0];
  const element = canvas?.elements[0];
  if (!canvas || !element) throw new Error("G5_M8_PENDING_TARGET_MISSING");
  return {
    schemaVersion: 1 as const,
    expectedWorkingCopyRowVersion: current.rowVersion,
    expectedDocumentDigest: current.documentDigest,
    selectionElementIds: [element.id],
    summary: `将「${element.name}」横向微调 8 像素`,
    warnings: [],
    commandBatch: {
      schemaVersion: 1 as const,
      batchId: `m8_pending_${current.rowVersion}`,
      label: "受控微调建议",
      commands: [{
        schemaVersion: 1 as const,
        commandId: `m8_pending_command_${current.rowVersion}`,
        type: "element.set_transform" as const,
        label: "横向微调 8 像素",
        payload: {
          canvasId: canvas.id,
          elementId: element.id,
          transform: {
            ...element.transform,
            x: element.transform.x + 8,
          },
        },
      }],
    },
  };
}
