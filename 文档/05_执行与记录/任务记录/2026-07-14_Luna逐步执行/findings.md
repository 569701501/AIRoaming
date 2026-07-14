---
doc_id: AIR-LUNA-STEP-EXEC-FINDINGS-001
status: completed
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, luna, ai-agent, reviewer
source: v5 production evidence、R2 真实观察与复核
---

# Findings

- v5 C0～C7 evidence 未漂移；C5/C6/C7、首写和 file guard 均按授权完成。
- OBS-06 的根因不是删除流程缺授权，而是 SQLite `ON DELETE SET NULL` 触发 G2 rowVersion guard；正确修复是先在三事实守卫下显式拆除 Chapter reverse pointers，再删除不可变子行。
- 已激活 `db_only` 的协调备份不能伪装成 shadow；manifest 必须同时保存当前 release schema identity 和历史 cutover lineage identity，恢复时分别校验。
- 迁移素材的展示路径与物理 `storageKey` 可能不同；DB 文件读取必须以 DB Asset 行为事实源，并把 `legacy-import/{projectId}/...` 纳入受限合法前缀。
- Workbench `GET` 携带 chapterId 是用户查看路径。DB 模式不得为了切换页面章节而写 `Project.currentChapterId`；当前实现已改成纯读取投影并有“不改 DB”回归。
- R2 最终目标库与恢复库 integrity=`ok`、foreignKeyViolations=0、0011 ledger 完成；1 项目、2 章节、67 ready Asset 全部可读。
- OBS-09/10 证明旧 metadata archive 只作隔离档案，不参与运行态；证据根未发现 secret sentinel 或宽泛凭据模式。
