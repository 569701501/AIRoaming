# Runtime/User Review：视觉素材门禁前置

---
doc_id: AIR-TASK-20260719-VISUAL-PREFLIGHT-RUNTIME
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 本地真实页面、DB Web 门禁 E2E、自动回归
---

## 1. 运行复核结论

通过。复核过程没有点击任何生成图片、重新生成、定稿或确认素材动作，没有调用真实图片 Provider。

## 2. 真实页面证据

复核项目：`project_4f1daf289e9d1499cc8a3705b5f09654e04f48ec5cf70bb27f927f6f08bf9e17`，章节“杀令入棺”。

### 剧情结构页

| 主体 | 页面结果 | 结论 |
| --- | --- | --- |
| 哑巴，human/chapter | 显示人物定稿组合图区域 | 符合 final_reference |
| 商队众人 / 商队多人，group/extra | 只显示一张“商队众人”素材卡，标注“无需三视图 / 单张参考” | 旧群体别名已在素材投影合并，符合 preview_front |
| 红心棺，creature/chapter | 标注“无需三视图 / 单张参考” | 非人物主体未误用人物定稿 |
| 无主尸体，human/minor | 标注“无需三视图 / 单张参考” | minor 未因重复出镜升级 |

### 出图准备页

- 页面明确显示：“角色图生成/定稿在剧情结构页完成，这里只做检查。”
- 可见按钮只有 `查看角色库`、`确认出图准备`。
- 未发现含“生成 / 补图 / 定稿”的门禁页按钮。
- 当前项目所有必需素材齐全，因此 `确认出图准备` 可用。
- 页面重新加载后的新增浏览器错误：0。

当前真实项目已经是 ready 状态，未为了制造缺项而删除资产或改数据库；“缺项时确认按钮不可用、服务端拒绝确认”由固定单元/集成用例验证。

## 3. DB Web 门禁证据

- 使用 `AIROAMING_E2E_PERSISTENCE_MODE=db` 运行 Web gate：3/3 通过。
- 测试使用 fake OpenCode/provider 边界，没有图片服务调用。
- 首次未指定 DB 模式的失败属于测试环境默认值为 `legacy_file`，不是产品回归；显式使用项目正式 DB-only 模式后通过。

## 4. 用户路径结论

```text
确认剧情结构
→ 页面立即显示每种主体正确的素材动作
→ 分镜只引用当前结构主体
→ 出图准备检查同一规则
→ 缺项阻断 / 齐全放行
→ 候选图
```
