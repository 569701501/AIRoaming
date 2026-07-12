---
doc_id: AIR-G3-M3-A14-PROGRESS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A14 实现与 SQLite 集成证据
---

# 进度

- [x] 新增 `ProviderShadowImporter` 与 `--slice providers`。
- [x] 导入脱敏 ProviderConfig、CredentialMetadata、AppPreference 元数据。
- [x] 旧 apiKey 不落库，凭据保持未配置状态。
- [x] 集成测试覆盖 provider 关联、secret 不落库与 replay。
- [x] typecheck、A14 定向测试通过；全量回归、G1 门禁和 diff check 待提交前完成。
- [ ] Dialogue runtime bundle、read-model/full orchestration、M4/M5/M6 仍后置。
