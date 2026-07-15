---
doc_id: AIR-G05-M8-SCRUTINY-001
status: active
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, luna, developer, qa
source: G5-M8 code diff、0016 migration、Shared/Server/Web tests、G5 验收清单
---

# G5-M8 静态复核

## 结论

```text
phase = G5-M8
commit = fc9ea47
result = passed
blocker = none
next = WAIT_G5_USER_ACCEPTANCE
```

## 复核范围

- Shared：严格 PendingEditorCommandSet、profile resize、图片预检 issue、复制对象新 ID。
- Server：DB-only pending 服务、0016 legacy cutover、legacy converter/rebuild、图片字节标准化、renderer 二次门禁。
- Web：手机 lazy GET-only route、AI preview/apply/discard、profile resize/段高一次 Undo、键盘/label/reduced-motion。
- 旧路径：旧 layout build/export DTO、Service、Store 和复制候选源图出口已删除；runtime scan 通过。

## 关键结论

1. AI pending 不接受 JSON Patch、HTML、脚本或来源注入；apply 前重算 rowVersion、document/source digest，并在事务内使用 Shared reducer。
2. 手机预览不导入编辑 store，公开路径只发 GET；写接口仍要求 Server 的 expected/CAS/source 门禁。
3. legacy 可解析数据转为 V1 Working Copy；unresolved 只显示重建选择，不伪造 CandidateLockRevision/current。
4. 0016 只向前追加 migration，不改写 G1 历史 migration，不提供 down migration，不恢复 file-only。
5. 图片格式以真实字节为准；EXIF 非 1、未支持色彩空间、动画 PNG/WebP、MIME 与字节不一致均阻止正式版本和出版。
6. backup/archive、G6、视频和删除操作均不在本提交中。

## 证据

- Shared：24 files，115 tests，全部通过。
- Server：93 files，568 tests，全部通过。
- `typecheck`、`typecheck:e2e`、生产 build、Prisma validate、`test:render`、`test:migration:g5`、diff check 全部通过。
- G5 DB-only Playwright：8/8，通过；截图为 `evidence/g5_m8_mobile_ai.png`。

## 残留边界

技术 blocker 为 0。G5 总体不能在本复核中自行签收；唯一未完成项是用户确认运行结果。
