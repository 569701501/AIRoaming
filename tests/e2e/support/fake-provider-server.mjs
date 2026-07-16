import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import {
  createE2ERuntime,
  prepareE2ERuntime,
  recoverE2EStartupFailure,
  writeE2EProcessState,
} from "./e2e-env.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
const IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const FAILURE_MODES = new Set(["success", "delay", "429", "500", "late_success"]);
const SCRIPT_OUTLINE_RESPONSE = `# 剧本大纲

## 一、基础信息
剧集名称：雨夜末班车
题材风格：都市悬疑、心理惊悚、冷色条漫
剧集篇幅：2 章短篇
剧集章数：2 章
剧情简介：林夏在雨夜错过末班车，但是一辆不存在于时刻表的空车进站，因此她不得不追查车辆与失踪姐姐之间的联系。

## 二、主要角色
林夏（主角）：寻找失踪姐姐的年轻记者，理性但无法放下愧疚。
林岚（关键关系角色）：林夏失踪的姐姐，只通过旧录音和车内痕迹出现。

## 三、情节概要
开端：林夏在雨夜站台等车，但是广播报出一班不存在的末班车，因此她登车寻找姐姐留下的线索。
发展：车内录音指向封闭总站，但是司机座始终无人，因此林夏必须在车辆驶入隧道前找到停车方法。
结局方向：林夏在总站救出被困的姐姐，并公开运营方掩盖事故的证据。

## 四、章节安排

### 第 1 章：雨夜站台
章节目标：让林夏登上异常末班车并发现姐姐留下的录音。
核心冲突：离开站台意味着错失线索，登上无人驾驶的车辆又可能无法返回。
关键转折：空车广播准确叫出林夏的名字。
结尾钩子：姐姐的旧录音要求林夏不要让车辆进入隧道。
下一章衔接：林夏必须在车辆驶入隧道前找到停车方法。

### 第 2 章：封闭总站
章节目标：让林夏阻止车辆并找到失踪的姐姐。
核心冲突：停车会触发运营方销毁证据，继续前进又会重演旧事故。
关键转折：林夏发现姐姐一直被困在封闭总站的控制室。
结尾钩子：总站监控直播出运营方负责人承认掩盖事故。
下一章衔接：故事在姐妹获救和证据公开后结束。
`;
const CHAPTER_SCRIPT_RESPONSE = `# 章节剧本

## 第 1 章：雨夜站台

### 一、基础方向
类型：都市悬疑
主题：面对愧疚才能接近真相
风格：紧凑、克制、视觉化
漫画形式：竖版条漫
目标篇幅：约 1200 字

### 二、本章方向
一句话梗概：林夏在雨夜登上一辆无人驾驶的末班车，并听见失踪姐姐留下的警告。
本章目标：让林夏登上异常末班车并发现姐姐留下的录音。
核心冲突：离开会错失线索，登车又可能无法返回。
情绪走向：疲惫等待转为警觉，随后因姐姐的声音变得坚决。
结尾钩子：姐姐警告她不要让车辆进入隧道。

### 三、剧本亮点
亮点 1：关闭的站台广播准确叫出林夏的名字。
亮点 2：空驾驶座与自行开启的车门形成强烈视觉反差。
亮点 3：姐姐的旧录音把私人失踪案与异常车辆连接起来。

### 四、视觉基调
画面氛围：雨幕、空站台和不断闪烁的冷白灯制造压迫感。
色调方向：冷蓝为主，录音播放时出现短暂暖色记忆。
视觉记忆点：空驾驶座前悬着一枚属于林岚的红色钥匙扣。

### 五、剧本正文

#### 场景 1：空站台
地点：城市末班公交站
时间：深夜
氛围：潮湿、冷清、灯光不稳
出场人物：林夏
剧情描写：末班车已经晚了二十分钟，林夏正准备离开，关闭的广播却突然叫出她的名字，并播报一班时刻表上不存在的车辆。
人物动作：林夏停下脚步，抬头确认广播灯已经熄灭，又把姐姐失踪前的短信攥在掌心。
对白：广播：林夏乘客，请在原地候车。
旁白：雨水沿站牌滑落，抹掉了最后一班车的到站时间。
场景结束点：两束车灯穿过雨幕，一辆没有司机的公交车停在林夏面前。

#### 场景 2：无人末班车
地点：异常公交车车厢
时间：深夜
氛围：安静、封闭、机械声清晰
出场人物：林夏、林岚的录音
剧情描写：林夏看见驾驶座空无一人，却在方向盘旁发现姐姐的红色钥匙扣。她刚踏入车厢，车门便在身后关闭，旧录音机自动播放。
人物动作：林夏扑向驾驶座寻找刹车，随后按住录音机，强迫自己听清姐姐的每一个字。
对白：林岚的录音：小夏，如果你听见我，别让这辆车进入隧道。
旁白：车辆无声起步，前方指示牌只剩一个目的地——封闭总站。
场景结束点：林夏抬头看见隧道入口逼近，握紧红色钥匙扣冲向控制面板。

### 六、本章结尾
结尾事件：林夏确认异常车辆与姐姐失踪有关，并开始寻找紧急停车方法。
悬念：无人驾驶的车辆为什么知道林夏的名字，姐姐又为何留下警告？
下一章引子：车辆正驶向隧道后的封闭总站，控制面板需要姐姐的钥匙扣才能解锁。
`;
const IMPORT_CHAPTER_ONE_RESPONSE = CHAPTER_SCRIPT_RESPONSE.replace(
  "目标篇幅：约 1200 字",
  "目标篇幅：按本章确认原稿范围完整整理",
);
const IMPORT_CHAPTER_TWO_RESPONSE = IMPORT_CHAPTER_ONE_RESPONSE
  .replace("## 第 1 章：雨夜站台", "## 第 2 章：封闭总站")
  .replace("一句话梗概：林夏在雨夜登上一辆无人驾驶的末班车，并听见失踪姐姐留下的警告。", "一句话梗概：林夏抵达封闭总站，找到姐姐并取得运营方掩盖事故的证据。")
  .replace("本章目标：让林夏登上异常末班车并发现姐姐留下的录音。", "本章目标：让林夏在封闭总站找到姐姐并公开事故证据。")
  .replace("核心冲突：离开会错失线索，登车又可能无法返回。", "核心冲突：救出姐姐会触发运营方销毁证据，保留证据又会延误救援。")
  .replace("结尾钩子：姐姐警告她不要让车辆进入隧道。", "结尾钩子：监控直播出运营方负责人承认掩盖事故。")
  .replace("#### 场景 1：空站台", "#### 场景 1：封闭总站入口")
  .replace("#### 场景 2：无人末班车", "#### 场景 2：总站控制室")
  .replace("下一章引子：车辆正驶向隧道后的封闭总站，控制面板需要姐姐的钥匙扣才能解锁。", "下一章引子：姐妹获救，事故证据已经公开。 ");
const IMPORT_ANALYSIS_RESPONSE = Object.freeze({
  schemaVersion: "import-analysis/1.0",
  outlineRole: "observed",
  sourceProfile: { contentType: "script", explicitBoundaryLevel: "chapter" },
  observedOutline: {
    sourceTitle: { value: "雨夜末班车", basis: "source" },
    synopsis: "林夏登上异常末班车寻找失踪姐姐，最终在封闭总站救出姐姐并取得事故证据。",
    mainCharacters: [{
      name: "林夏",
      aliases: [],
      observedIdentity: "寻找失踪姐姐的记者",
      observedPursuit: "找到姐姐并查明异常车辆真相",
      relationships: ["林岚的妹妹"],
      sourceRanges: [{ sourceRef: "source-001", startBlockRef: "source-001:block-000001", endBlockRef: "source-001:block-000002" }],
    }],
    plotStages: [
      { order: 1, label: "登车", summary: "林夏在雨夜登上异常末班车。", sourceRanges: [{ sourceRef: "source-001", startBlockRef: "source-001:block-000001", endBlockRef: "source-001:block-000001" }] },
      { order: 2, label: "总站", summary: "林夏在封闭总站救出姐姐并取得证据。", sourceRanges: [{ sourceRef: "source-001", startBlockRef: "source-001:block-000002", endBlockRef: "source-001:block-000002" }] },
    ],
    endingObservation: { kind: "resolved", summary: "姐妹获救，事故证据公开。", sourceRanges: [{ sourceRef: "source-001", startBlockRef: "source-001:block-000002", endBlockRef: "source-001:block-000002" }] },
  },
  chapterCandidates: [
    {
      localRef: "chapter-001",
      order: 1,
      title: { value: "雨夜站台", basis: "source" },
      summary: "林夏登上异常末班车并听见姐姐的警告。",
      sourceRanges: [{ sourceRef: "source-001", startBlockRef: "source-001:block-000001", endBlockRef: "source-001:block-000001" }],
      boundaryMode: "preserved_source_unit",
      boundaryEvidence: {
        start: { type: "source_start", anchorBlockRef: "source-001:block-000001", description: "原稿第一章开始" },
        end: { type: "scene_sequence_end", anchorBlockRef: "source-001:block-000001", description: "异常车辆驶向隧道，第一章行动结束" },
      },
      confidence: "high",
      warnings: [],
    },
    {
      localRef: "chapter-002",
      order: 2,
      title: { value: "封闭总站", basis: "source" },
      summary: "林夏在封闭总站救出姐姐并公开事故证据。",
      sourceRanges: [{ sourceRef: "source-001", startBlockRef: "source-001:block-000002", endBlockRef: "source-001:block-000002" }],
      boundaryMode: "preserved_source_unit",
      boundaryEvidence: {
        start: { type: "explicit_heading", anchorBlockRef: "source-001:block-000002", description: "原稿第二章标题" },
        end: { type: "source_end", anchorBlockRef: "source-001:block-000002", description: "原稿结尾" },
      },
      confidence: "high",
      warnings: [],
    },
  ],
  excludedRanges: [],
  unresolvedItems: [],
  globalWarnings: [],
});
let importMaterializeFailureResponses = 0;
const STORY_STRUCTURE_RESPONSE = Object.freeze({
  synopsis: "林夏在雨夜站台等待末班车，异常广播后空车进站。",
  direction: {
    logline: "错过末班车的林夏等来一辆无人驾驶的空车。",
    chapterGoal: "建立雨夜站台的悬疑事件。",
    coreConflict: "林夏必须在离开和登上异常末班车之间做出选择。",
    emotionalArc: "疲惫等待转为警觉，再转为直面未知。",
    endingHook: "无人驾驶的末班车在林夏面前打开车门。",
  },
  characters: [{
    name: "林夏",
    role: "本章视角主角",
    level: "lead",
    entityType: "human",
    motivation: "赶上回家的末班车。",
    relationship: "独自在站台等待。",
    visualTraits: "被雨淋湿的深色外套，神情疲惫而警觉。",
    notes: "保持主角外观连续。",
  }],
  scenes: [{
    name: "雨夜站台",
    location: "城市末班公交站",
    timeOfDay: "深夜",
    atmosphere: "冷清、潮湿、灯光闪烁",
    purpose: "建立异常末班车出现前的悬疑氛围。",
  }],
  beats: [
    {
      order: 1,
      title: "独自等待",
      summary: "林夏在雨夜站台等待迟迟未到的末班车。",
      conflict: "末班车已经超过到站时间。",
      characters: ["林夏"],
      sceneName: "雨夜站台",
      visualFocus: "雨幕、空站台和反复查看时间的林夏。",
      outcome: "林夏开始怀疑今晚没有末班车。",
    },
    {
      order: 2,
      title: "异常广播",
      summary: "关闭的广播突然播报一班不存在的车辆。",
      conflict: "广播内容与站牌信息矛盾。",
      characters: ["林夏"],
      sceneName: "雨夜站台",
      visualFocus: "闪烁的广播灯和林夏警觉的神情。",
      outcome: "远处出现车辆灯光。",
    },
    {
      order: 3,
      title: "空车进站",
      summary: "无人驾驶的末班车停在林夏面前并打开车门。",
      conflict: "林夏必须决定是否登车。",
      characters: ["林夏"],
      sceneName: "雨夜站台",
      visualFocus: "空驾驶座、开启的车门和车内冷光。",
      outcome: "章节停在林夏迈向车门的瞬间。",
    },
  ],
  notes: "后续分镜保持雨夜冷色调，并突出空驾驶座。",
});

/**
 * @param {{ host: string, port: number, runId: string, runtimeDir: string, logRequests?: boolean }} options
 */
export async function createFakeProviderServer(options) {
  if (!LOOPBACK_HOSTS.has(options.host)) {
    throw new Error("E2E_PROVIDER_LOOPBACK_REQUIRED");
  }
  if (!options.runId) {
    throw new Error("E2E_PROVIDER_RUN_ID_REQUIRED");
  }

  let failureMode = "success";
  let sessionSequence = 0;
  /** @type {Array<{ at: string, method: string, path: string }>} */
  const requestAudit = [];

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${options.host}`);
    requestAudit.push({ at: new Date().toISOString(), method, path: url.pathname });
    response.once("finish", () => {
      if (options.logRequests) {
        console.log(`[e2e-fake-provider] ${method} ${url.pathname} ${response.statusCode}`);
      }
    });

    try {
      if (method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { status: "ok", runId: options.runId });
      }
      if (method === "GET" && url.pathname === "/__e2e__/requests") {
        return sendJson(response, 200, { items: requestAudit });
      }
      if (method === "POST" && url.pathname === "/__e2e__/control") {
        const payload = await readJsonBody(request);
        if (!FAILURE_MODES.has(payload.mode)) {
          return sendJson(response, 400, { code: "E2E_FAILURE_MODE_INVALID" });
        }
        failureMode = payload.mode;
        response.writeHead(204).end();
        return;
      }
      if (method === "GET" && url.pathname === "/opencode/session") {
        return sendJson(response, 200, []);
      }
      if (method === "GET" && url.pathname === "/opencode/config") {
        return sendJson(response, 200, {
          provider: {
            e2e: {
              id: "e2e",
              name: "E2E deterministic provider",
              models: {
                deterministic: { id: "deterministic", name: "Deterministic text" },
              },
            },
          },
        });
      }
      if (method === "POST" && url.pathname === "/opencode/session") {
        await drainBody(request);
        sessionSequence += 1;
        return sendJson(response, 200, { id: `e2e-session-${sessionSequence}` });
      }
      if (method === "PUT" && /^\/opencode\/auth\/[^/]+$/.test(url.pathname)) {
        await drainBody(request);
        return sendJson(response, 200, true);
      }
      if (method === "POST" && /^\/opencode\/session\/[^/]+\/message$/.test(url.pathname)) {
        const payload = await readJsonBody(request);
        return sendJson(response, 200, {
          parts: [{ type: "text", text: deterministicOpenCodeResponse(payload) }],
        });
      }
      if (method === "GET" && url.pathname === "/opencode/event") {
        response.writeHead(200, {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
        });
        response.end(": e2e-ready\n\n");
        return;
      }
      if (
        method === "POST"
        && ["/image/v1/images/generations", "/image/v1/images/edits"].includes(url.pathname)
      ) {
        await drainBody(request);
        const handledFailure = await respondForFailureMode(response, failureMode);
        if (handledFailure) {
          return;
        }
        return sendJson(response, 200, {
          created: 0,
          data: [{ b64_json: IMAGE_BASE64 }],
        });
      }

      await drainBody(request);
      return sendJson(response, 404, { code: "E2E_FAKE_ROUTE_NOT_FOUND" });
    } catch (error) {
      return sendJson(response, 400, {
        code: "E2E_FAKE_BAD_REQUEST",
        message: error instanceof Error ? error.message : "invalid request",
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: options.host, port: options.port, exclusive: true }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("E2E_PROVIDER_ADDRESS_UNAVAILABLE");
  }

  let closed = false;
  return {
    host: options.host,
    port: address.port,
    url: `http://${options.host}:${address.port}`,
    server,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}

async function respondForFailureMode(response, mode) {
  if (mode === "delay") {
    await delay(100);
    return false;
  }
  if (mode === "late_success") {
    await delay(500);
    return false;
  }
  if (mode === "429") {
    sendJson(response, 429, { code: "E2E_FAKE_RATE_LIMITED" });
    return true;
  }
  if (mode === "500") {
    sendJson(response, 500, { code: "E2E_FAKE_PROVIDER_FAILED" });
    return true;
  }
  return false;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function deterministicOpenCodeResponse(payload) {
  const prompt = Array.isArray(payload.parts)
    ? payload.parts
      .filter((part) => part && typeof part === "object" && part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
    : "";
  if (prompt.includes("structure-story-parse")) {
    return `\`\`\`json\n${JSON.stringify(STORY_STRUCTURE_RESPONSE, null, 2)}\n\`\`\``;
  }
  if (prompt.includes("已有剧本路线 B2")) {
    return JSON.stringify(IMPORT_ANALYSIS_RESPONSE);
  }
  if (prompt.includes("已有剧本路线 B4：把一个已确认原稿范围忠实整理")) {
    if (prompt.includes("【本章首次整理失败】") && importMaterializeFailureResponses < 2) {
      importMaterializeFailureResponses += 1;
      return "这不是合法的章节 Markdown";
    }
    return prompt.includes("第 2 章：封闭总站") ? IMPORT_CHAPTER_TWO_RESPONSE : IMPORT_CHAPTER_ONE_RESPONSE;
  }
  if (prompt.includes("已有剧本路线 B4：忠实度验证")) {
    const secondChapter = prompt.includes("第 2 章：封闭总站");
    const blockRef = secondChapter ? "source-001:block-000002" : "source-001:block-000001";
    const outputLineRefs = [...prompt.matchAll(/"lineRef":\s*"(line-\d+)"/g)].map((match) => match[1]);
    const endLineRef = outputLineRefs.at(-1) ?? "line-000001";
    return JSON.stringify({
      schemaVersion: "import-fidelity/1.0",
      sourceCoverage: [{
        sourceRange: { sourceRef: "source-001", startBlockRef: blockRef, endBlockRef: blockRef },
        outputLineRanges: [{ startLineRef: "line-000001", endLineRef }],
        disposition: "reformatted_in_body",
        note: "原稿内容完整整理进章节正文",
      }],
      unsupportedAdditions: [],
      sequenceFindings: [],
      dialogueFindings: [],
      entityFindings: [],
      metadataFindings: [],
      uncertainties: [],
    });
  }
  if (prompt.includes("script-outline-drafting")) {
    return SCRIPT_OUTLINE_RESPONSE;
  }
  if (prompt.includes("script-chapter-drafting")) {
    return CHAPTER_SCRIPT_RESPONSE;
  }
  return "E2E deterministic response";
}

async function readJsonBody(request) {
  const body = await readBody(request, 64 * 1024);
  return body.length === 0 ? {} : JSON.parse(body.toString("utf8"));
}

async function drainBody(request) {
  await readBody(request, 20 * 1024 * 1024);
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw new Error("E2E_FAKE_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runCli() {
  const role = process.argv[2];
  const runIdFlag = process.argv.indexOf("--run-id");
  const cliRunId = runIdFlag >= 0 ? process.argv[runIdFlag + 1] : undefined;
  if (role !== "provider" || !cliRunId || cliRunId !== process.env.AIROAMING_E2E_RUN_ID) {
    throw new Error("E2E_PROVIDER_CLI_IDENTITY_MISMATCH");
  }

  const runtime = createE2ERuntime();
  await prepareE2ERuntime(runtime);
  await writeE2EProcessState(runtime, {
    role: "provider",
    pid: process.pid,
    port: runtime.providerPort,
    status: "starting",
  });
  const fake = await createFakeProviderServer({
    host: "127.0.0.1",
    port: runtime.providerPort,
    runId: runtime.runId,
    runtimeDir: runtime.runtimeDir,
    logRequests: true,
  });
  await writeE2EProcessState(runtime, {
    role: "provider",
    pid: process.pid,
    port: runtime.providerPort,
    status: "ready",
  });
  console.log(`[e2e-fake-provider] ready ${fake.url} run=${runtime.runId}`);

  let shutdownPromise;
  const shutdown = () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    shutdownPromise = (async () => {
      await writeE2EProcessState(runtime, {
        role: "provider",
        pid: process.pid,
        port: runtime.providerPort,
        status: "stopping",
      }).catch(() => undefined);
      await fake.close();
      await writeE2EProcessState(runtime, {
        role: "provider",
        pid: process.pid,
        port: runtime.providerPort,
        status: "stopped",
      }).catch(() => undefined);
    })();
    return shutdownPromise;
  };
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      shutdown().then(
        () => process.exit(0),
        (error) => {
          console.error(`[e2e-fake-provider] shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        },
      );
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(`[e2e-fake-provider] failed: ${error instanceof Error ? error.message : String(error)}`);
    Promise.resolve()
      .then(async () => {
        const runtime = createE2ERuntime();
        await writeE2EProcessState(runtime, {
          role: "provider",
          pid: process.pid,
          port: runtime.providerPort,
          status: "failed",
        }).catch(() => undefined);
        await recoverE2EStartupFailure(runtime, process.pid);
      })
      .catch((cleanupError) => {
        console.error(
          `[e2e-fake-provider] startup cleanup refused: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      })
      .finally(() => {
        process.exitCode = 1;
      });
  });
}
