# 发现记录：候选图工作台 MVP

## 设计阶段发现（2026-07-06）

- Prisma 在 `apps/server/src` 中 0 处引用，schema 6 表为脚手架遗产；决策：继续闲置，候选数据走文件态。
- `素材文件与版本契约.md` 内部路径冲突（96 行 vs 248 行），以 `chapters/{slug}/candidates/{shotId}/` 为正典，P4 修正。
- `ImageProviderService.editImage` 仅支持单参考图；多参考图列为非目标。
- 唯一真实图片串行队列在 `CharacterReferenceService`（Promise 链），P2 抽成通用 ImageTaskQueue。
