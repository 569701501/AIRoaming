---
doc_id: AIR-D2-A2-1-HANDOFF-REVIEW-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-1 五份施工资料与当前代码静态复核
---

# D2-A2-1 Handoff 静态复核

## 复核对象

- `handoff.md`
- `implementation_contract.md`
- `test_matrix.md`
- `file_map.md`
- `review_checklist.md`
- G3-D2/M6 推进路线中的 A2 拆分

## 已核对事实

- 当前 blockedIds=6，A1-2 已完成，A2 代码尚未实现。
- G2 Script modern repository/API 已存在，Web 尚未切换，runtime pending create 缺失。
- WorkbenchSnapshot 尚缺 G2 已批准的 `VersioningCapability`。
- DB identity map 在直接 versioning mutation 后可能陈旧。
- Chapter 无 retirement 字段，delete/milestone/formal-history trigger 不允许旧 reset/import/clear 直接照搬。

## 复核修正

1. 增加 `legacy_file/g2_db` 双模式，避免 D2 阶段提前破坏 file-mode bridge。
2. 明确 CAS 必须来自“开始编辑时观察到的值”，禁止 click-time pre-read latest。
3. 明确 outline confirm 携带 expected outline ID，避免确认后来生成的新版本。
4. 明确 AI pending 创建不改 Working/current/title，adopt 不建 ScriptVersion。
5. 明确只更新 5 个 operation evidence，两个聚合项仍 partial，blockedIds 不降。
6. 把破坏性 clear/import/reset 独立为 A2-2，并设置 schema/删除/里程碑停止条件。

## 可执行性检查

- 五份主资料均存在且 frontmatter/doc_id 唯一。
- 每项范围都能映射到具体文件、函数、测试 ID 和退出门。
- file/db 行为、错误码、replacement、事务、重放、restart 和 isolation 均有明确预期。
- `git diff --check` 通过。
- 本复核只证明施工资料可执行，不证明 A2-1 功能已实现。

## 结论

```text
verdict: PASS
ready_for: Luna implementation of D2-A2-1 only
not_ready_for: D2-A2-2 / D2-A3 / final importer / M6
```
