import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import {
  LayoutDocumentCodecV1,
  type GenerationTaskItem,
  type LayoutPublicationHistoryResponseV1,
  type LayoutWorkingCopyResponseV1,
  type SaveLayoutWorkingCopyResponseV1,
} from "@airoaming/shared";

import { expect, test } from "../support/e2e-fixture.ts";
import { lockCandidate, prepareG4CandidateFixture } from "../support/g4-candidate-fixture.ts";

const { DatabaseSync } = createRequire(path.join(process.cwd(), "package.json"))("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

test("G5-M7：页面正式出版、持久任务和可读取产物形成 DB-only 闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await page.getByRole("button", { name: "创建数据库草稿" }).click();
  await expect(page.getByTestId("layout-m6-control-center")).toBeVisible();

  // E2E 图片服务返回真实 1×1 PNG；把画格同步成 1×1，避免伪造来源尺寸，仍由渲染器读取原始字节。
  const workingCopy = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  const document = structuredClone(workingCopy.document);
  const panel = document.canvases[0]?.elements[0];
  if (panel?.type !== "panel_frame" || !panel.contentImage) throw new Error("G5_M7_E2E_PANEL_MISSING");
  panel.transform = { ...panel.transform, x: 64, y: 64, width: 1, height: 1 };
  panel.shape.cornerRadius = 0;
  panel.contentImage.crop = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false };
  const encoded = LayoutDocumentCodecV1.encode(document);
  await api.put<SaveLayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    {
      schemaVersion: 1,
      expectedRowVersion: workingCopy.rowVersion,
      baseDocumentDigest: workingCopy.documentDigest,
      documentDigest: encoded.digest,
      document: encoded.value,
    },
  );
  await page.reload();

  await page.getByRole("button", { name: "保存版本", exact: true }).click();
  const revisionPreflight = page.getByTestId("layout-preflight-result");
  await expect(revisionPreflight).toBeVisible();
  const revisionAcknowledgements = revisionPreflight.locator('input[type="checkbox"]');
  for (let index = 0; index < await revisionAcknowledgements.count(); index += 1) {
    await revisionAcknowledgements.nth(index).check();
  }
  await revisionPreflight.getByRole("button", { name: "保存不可变版本" }).click();
  await expect(page.getByTestId("layout-revision-history")).toContainText("当前正式");

  const publicationCenter = page.getByTestId("layout-publication-center");
  await publicationCenter.getByRole("button", { name: "运行导出预检" }).click();
  const publicationPreflight = page.getByTestId("layout-publication-preflight");
  await expect(publicationPreflight).toBeVisible();
  const publicationAcknowledgements = publicationPreflight.locator('input[type="checkbox"]');
  for (let index = 0; index < await publicationAcknowledgements.count(); index += 1) {
    await publicationAcknowledgements.nth(index).check();
  }
  await publicationPreflight.getByRole("button", { name: "开始正式出版" }).click();

  const publicationHistory = page.getByTestId("layout-publication-history");
  await expect.poll(async () => {
    const publications = (await api.get<LayoutPublicationHistoryResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/exports/layout-publications`,
    )).data;
    const publication = publications.items[0];
    if (publication?.status === "failed") {
      const tasks = (await api.get<{ items: GenerationTaskItem[] }>("/tasks")).data.items;
      const task = tasks.find((item) => item.id === publication.taskId);
      throw new Error(`G5_M7_E2E_PUBLICATION_FAILED:${JSON.stringify(task?.error ?? null)}`);
    }
    return publication?.status;
  }, { timeout: 45_000 }).toBe("ready");
  await expect(publicationHistory).toContainText("出版 1 · 已完成");
  await expect(publicationHistory).toContainText("当前成品");
  const sliceLink = publicationHistory.getByRole("link", { name: "条漫切片 1" });
  await expect(sliceLink).toBeVisible();
  const sliceHref = await sliceLink.getAttribute("href");
  if (!sliceHref) throw new Error("G5_M7_E2E_SLICE_HREF_MISSING");
  const sliceResponse = await page.request.get(sliceHref);
  expect(sliceResponse.status()).toBe(200);
  expect(sliceResponse.headers()["content-type"]).toContain("image/png");
  expect((await sliceResponse.body()).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  const history = (await api.get<LayoutPublicationHistoryResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/exports/layout-publications`,
  )).data;
  expect(history.currentExportRevisionId).toBe(history.items[0]?.id);
  expect(history.items[0]).toMatchObject({
    status: "ready",
    completionApplicability: "current",
    revisionPosition: "current",
  });
  expect(history.items[0]?.artifacts.map((artifact) => artifact.role).sort()).toEqual([
    "long_png",
    "publication_manifest",
    "strip_slice_png",
  ]);

  const database = new DatabaseSync(runtime.databasePath);
  try {
    const exportRow = database.prepare("SELECT status, task_id, manifest_digest FROM export_revisions WHERE id = ?").get(history.items[0]!.id) as {
      status: string;
      task_id: string;
      manifest_digest: string;
    };
    expect(exportRow.status).toBe("ready");
    expect(exportRow.manifest_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const task = database.prepare("SELECT type, status, applicability FROM generation_tasks WHERE id = ?").get(exportRow.task_id) as {
      type: string;
      status: string;
      applicability: string;
    };
    expect(task).toEqual({ type: "layout_export", status: "succeeded", applicability: "current" });
    const artifactCount = database.prepare(`
      SELECT COUNT(*) AS count
      FROM export_artifacts artifact
      JOIN assets asset ON asset.id = artifact.asset_id
      WHERE artifact.export_revision_id = ? AND asset.status = 'ready'
    `).get(history.items[0]!.id) as { count: number };
    expect(artifactCount.count).toBe(3);
  } finally {
    database.close();
  }

  expect(pageErrors).toEqual([]);
  const evidenceRoot = path.resolve("文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence");
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({ path: path.join(evidenceRoot, "g5_m7_publication_ready.png"), fullPage: true });
});
