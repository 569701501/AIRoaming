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

默认端口：

- Web: `http://localhost:5173`
- Server: `http://localhost:4310/api`
