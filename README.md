# AI漫游

AI漫游是一个内部生成式内容生产工作台，第一阶段采用 Web 工作台核心、本地 NestJS 服务和本地 workspace 文件系统。

正式事实源从这里进入：

- `文档/README.md`
- `文档/00_索引/AI上下文入口.md`
- `文档/01_愿景与产品/功能清单与页面链路.md`
- `文档/01_愿景与产品/当前UI信息架构.md`
- `文档/04_方案与决策/ADR-0003_Web优先与桌面壳后置.md`

## 开发命令

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm dev
```

`pnpm dev` 只连接已经完成迁移并激活的 DB-only 本地运行实例，默认运行根为 `~/.airoaming/`。数据库缺失、迁移账本不完整或尚未激活时，启动会直接停止，不会静默回退到旧文件模式。

需要覆盖运行目录时，启动前显式设置绝对路径形式的 `AIROAMING_DATA_ROOT`、`AIROAMING_WORKSPACE_ROOT` 和 `DATABASE_URL`。旧文件模式只用于受控迁移与故障恢复，不是日常开发入口。

默认端口：

- Web: `http://localhost:5173`
- Server: `http://localhost:4310/api`
