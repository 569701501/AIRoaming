import type { GenerationTaskItem, WorkbenchSnapshot } from "@airoaming/shared";
import { expect, test } from "../support/e2e-fixture.ts";
import { prepareG4CandidateFixture } from "../support/g4-candidate-fixture.ts";

test("候选图工作台展示自动整理说明、阻断硬伤，并可采用本镜头返修建议", async ({
  api,
  page,
  provider,
  rainSmokeProject,
}) => {
  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject, { generateCandidates: false });
  await page.goto(`/projects/${fixture.projectId}/candidates`);

  const visual = page.getByPlaceholder("写一个地点、一个时刻里肉眼能看见的主体与环境。");
  const action = page.getByPlaceholder("多人时逐一写清名字、动作对象、承受或视线关系。");
  const composition = page.getByPlaceholder("只写前中后景、左右位置、遮挡和视觉中心。");
  await expect(visual).toHaveValue("雨夜站台与缓缓进站的空车");
  await expect(action).toHaveValue("空车进站");
  await expect(composition).toHaveValue("站台中景");
  await expect(page.getByText("生成分镜时已自动整理，可继续微调")).toBeVisible();
  await expect(page.getByText("这里展示的是本镜头的详细单帧说明；手动修改只影响本次候选图，不会改正式分镜。")).toBeVisible();

  await visual.fill("林夏先站在雨夜站台，随后切到车厢显示字幕。");
  await expect(page.getByText("当前描述串联了多个先后动作或时间跨度；请只保留一个决定性瞬间。")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成候选图" })).toBeDisabled();

  const batchGenerate = page.getByRole("button", { name: "批量生成(1)" });
  await expect(batchGenerate).toBeEnabled();
  await batchGenerate.click();
  await expect(batchGenerate).toBeEnabled();
  await expect.poll(async () => {
    const tasks = (await api.get<{ items: GenerationTaskItem[] }>("/tasks")).data.items;
    return tasks.filter((task) => task.type === "image_generate" && task.target?.id === fixture.shotId).length;
  }).toBe(0);

  await visual.fill("雨夜站台上，空车停在刚刚抵达的瞬间，车门尚未开启。");
  await expect(page.getByRole("button", { name: "重新优化本镜头" })).toBeEnabled();
  await page.getByRole("button", { name: "重新优化本镜头" }).click();
  await expect(page.getByText("本镜头重新优化建议")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("这是可选返修稿，尚未采用，也不会改正式分镜。")).toBeVisible();
  await action.fill("空车停稳");
  await expect(page.getByText("本镜头重新优化建议")).not.toBeVisible();
  await action.fill("空车进站");
  await expect(page.getByText("本镜头重新优化建议")).toBeVisible();
  await page.getByRole("button", { name: "采用返修结果" }).click();
  await expect(visual).toHaveValue(/单帧可见/);
  await expect(page.getByText("已把返修建议放入本次候选图描述；正式分镜没有改动。")).toBeVisible();

  const current = await api.get<{ snapshot: WorkbenchSnapshot }>(
    `/projects/${fixture.projectId}/workbench?chapterId=${fixture.chapterId}`,
  );
  expect(current.data.snapshot.shots.find((shot) => shot.id === fixture.shotId)?.comic.panelDescription)
    .toBe("雨夜站台与缓缓进站的空车");
  const providerRequests = await provider.listRequests();
  expect(providerRequests.some((request) => request.path.startsWith("/image/v1/images/"))).toBe(false);
});
