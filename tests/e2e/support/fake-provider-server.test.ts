import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { createFakeProviderServer } from "./fake-provider-server.mjs";

describe("G0 loopback fake provider", () => {
  let runtimeDir: string;
  let fake: Awaited<ReturnType<typeof createFakeProviderServer>>;

  before(async () => {
    runtimeDir = await mkdtemp(path.join(tmpdir(), "airoaming-fake-provider-test-"));
    fake = await createFakeProviderServer({
      host: "127.0.0.1",
      port: 0,
      runId: "g0-fake-provider-test",
      runtimeDir,
    });
  });

  after(async () => {
    await fake.close();
    await rm(runtimeDir, { recursive: true, force: true });
  });

  test("serves deterministic OpenCode and image boundary responses", async () => {
    const health = await fetch(`${fake.url}/health`).then((response) => response.json());
    assert.equal(health.runId, "g0-fake-provider-test");

    const sessions = await fetch(`${fake.url}/opencode/session`).then((response) => response.json());
    assert.deepEqual(sessions, []);

    const config = await fetch(`${fake.url}/opencode/config`).then((response) => response.json());
    assert.equal(config.provider.e2e.models.deterministic.id, "deterministic");

    const imageResponse = await fetch(`${fake.url}/image/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: "Bearer never-log-this",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "never log this complete prompt" }),
    });
    assert.equal(imageResponse.status, 200);
    const image = await imageResponse.json();
    assert.match(image.data[0].b64_json, /^[A-Za-z0-9+/=]+$/);

    const requests = await fetch(`${fake.url}/__e2e__/requests`).then((response) => response.json());
    const serialized = JSON.stringify(requests);
    assert.match(serialized, /images\/generations/);
    assert.doesNotMatch(serialized, /never-log-this|complete prompt/);
  });

  test("returns a deterministic story structure for the real structure-story-parse prompt", async () => {
    const response = await fetch(`${fake.url}/opencode/session/e2e-session-1/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: { providerID: "e2e", modelID: "deterministic" },
        parts: [{
          type: "text",
          text: "你正在为 AI漫游执行剧情结构阶段 skill：structure-story-parse。\n当前章节剧本文档：\n雨夜站台。",
        }],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json() as { parts: Array<{ type: string; text: string }> };
    const text = payload.parts[0]?.text ?? "";
    assert.match(text, /^```json\s/);
    const structure = JSON.parse(text.replace(/^```json\s*/, "").replace(/\s*```$/, "")) as {
      synopsis?: string;
      direction?: { endingHook?: string };
      beats?: unknown[];
    };
    assert.equal(structure.synopsis, "林夏在雨夜站台等待末班车，异常广播后空车进站。");
    assert.equal(structure.direction?.endingHook, "无人驾驶的末班车在林夏面前打开车门。");
    assert.equal(structure.beats?.length, 3);
  });

  test("returns the story structure through OpenCode json_schema structured output", async () => {
    const response = await fetch(`${fake.url}/opencode/session/e2e-session-2/message?directory=%2Ftmp%2Fe2e-structured`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: { providerID: "e2e", modelID: "deterministic" },
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            required: ["synopsis"],
            properties: { synopsis: { type: "string" } },
          },
          retryCount: 0,
        },
        parts: [{
          type: "text",
          text: "你正在为 AI漫游执行剧情结构阶段 skill：structure-story-parse。\n当前章节剧本文档：\n雨夜站台。",
        }],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      info?: { structured?: { synopsis?: string; direction?: { endingHook?: string }; beats?: unknown[] } };
      parts?: unknown[];
    };
    assert.equal(payload.info?.structured?.synopsis, "林夏在雨夜站台等待末班车，异常广播后空车进站。");
    assert.equal(payload.info?.structured?.direction?.endingHook, "无人驾驶的末班车在林夏面前打开车门。");
    assert.equal(payload.info?.structured?.beats?.length, 3);
    assert.deepEqual(payload.parts, []);
  });

  test("supports local failure injection without exposing a production endpoint", async () => {
    const control = await fetch(`${fake.url}/__e2e__/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "429" }),
    });
    assert.equal(control.status, 204);

    const throttled = await fetch(`${fake.url}/image/v1/images/generations`, { method: "POST" });
    assert.equal(throttled.status, 429);

    await fetch(`${fake.url}/__e2e__/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "success" }),
    });
  });
});
