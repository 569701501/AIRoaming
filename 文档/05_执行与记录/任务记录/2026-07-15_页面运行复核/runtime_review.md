---
doc_id: AIR-TASK-20260715-PAGE-RUNTIME-REVIEW
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: in-app browser, Playwright Chromium, loopback E2E runtime
---

# 运行与用户路径复核

## 结论

```text
review = passed_isolated
scope = G0_G5
excluded = G6, G7, lightweight_video, real_provider
```

## 手工可见页面路径

1. 打开空项目库，确认项目数量与空状态。
2. 打开“创建项目”，验证名称填写后仍因漫画版式未选而禁用；选择竖向条漫后创建成功。
3. 检查 7 步流程栏：剧本外的等待步骤保持禁用。
4. 输入章节剧本、保存、刷新恢复、完成本章并进入剧情结构。
5. 生成剧情结构预览，检查摘要、方向、角色、场景和 3 个剧情节拍。
6. 确认结构，检查 DB Working Copy=`current`、角色“林夏”入库、错误为空、分镜步骤解锁。

## 自动真实浏览器路径

| 范围 | 结果 |
| --- | --- |
| file 项目/API/环境/流程栏 | 4/4 |
| G2 DB Working Copy/CAS/页面确认 | 3/3 |
| G4 候选决策 | 1/1 |
| G5 M4～M8 | 5/5 |
| DB 合计 | 9/9 |

## 运行边界

- provider、server、web 全部只监听 loopback。
- 数据库、workspace、HOME、缓存和 secret store 均为本轮临时根。
- 运行结束后由带 runId 的 teardown 清理，不删除真实 backup/archive。

## 运行风险

- 未执行真实模型，所以不签收真实生成内容审美或供应商稳定性。
- 素材包、G7 与轻量视频按用户要求未测试。
