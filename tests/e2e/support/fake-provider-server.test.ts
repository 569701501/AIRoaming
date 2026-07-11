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
