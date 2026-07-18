---
doc_id: AIR-TASK-IMAGE-PROMPT-PRO-EVIDENCE-001
status: active
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent
source: R3 专业图片 Prompt V2 离线编写与回归
---

# R3 离线证据

## 1. 实现范围

- 角色预览 V2；
- 角色四视图定稿 V2；
- 场景参考 V2；
- 无人、单人、双人、多人和条件式特效镜头合同；
- OpenAI、Doubao、Grok 三个独立 V2 Profile；
- V1 直通 Profile 与 V1 参考模板保留；
- 实际参考图职责说明；
- Doubao 无水印和候选图目标比例修复。

## 2. 样例编译检查

使用原 `image-prompt-s4-baseline-v1` 的同一组双人镜头离线编译 V2：

| Provider | Profile | 字符长度 | 主要结构 |
| --- | --- | ---: | --- |
| OpenAI | `openai-comic-clean-plate-v2` | 1621 | 标签化英文制作简报；场景→主体→瞬间→动作→构图→镜头合同→成图合同 |
| Doubao | `doubao-seedream-comic-clean-plate-v2` | 971 | 简洁中文自然语言；主体/动作/环境与中文硬合同 |
| Grok | `grok-comic-clean-plate-v2` | 1346 | 短直接英文任务头；准确人数、动作关系、站位和硬禁令 |

三份最终文本互不相同，均包含同一领域事实和双人动作主客体合同；均未追加通用 `Avoid:` 负向词串。

## 3. 自动验证

### 图片 Prompt 定向回归

```text
7 test files passed
28 tests passed
```

覆盖：参考模板、领域规格、三个 Profile、V1/V2、Provider 参考职责、水印参数、尺寸映射和旧基线。

### DB Prompt 冻结链与候选合同

```text
2 test files passed
40 tests passed
```

证明 DB 任务创建时冻结 V2 profile 和实际 provider Prompt，候选图任务合同保持可执行。

### 构建与类型

```text
@airoaming/shared build passed
@airoaming/server typecheck passed
@airoaming/server build passed
git diff --check passed
```

### Server 全量回归

```text
120 test files passed
720 tests passed
duration 196.41s
single fork
```

## 4. 没有执行的验证

- 没有调用 OpenAI、Doubao 或 Grok 真实图片服务；
- 没有产生新的付费图片；
- 没有把离线 Prompt 合同通过表述成真实视觉质量通过；
- Grok 单参考图和目标比例冲突仍等待 R4 决策与 R5 真实验证。
