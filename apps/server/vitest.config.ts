import { defineConfig } from "vitest/config";

/**
 * 后端测试配置。
 * 后端是 NestJS + ESM + tsx,无需额外编译:Vitest 通过 esbuild 原生处理 TS/ESM。
 * experimentalDecorators / emitDecoratorMetadata 由 esbuild 读取 tsconfig 自动启用。
 */
export default defineConfig({
  test: {
    // 测试文件约定:src 下 *.spec.ts
    include: ["src/**/*.spec.ts"],
    // 隔离:每个测试文件独立 module 状态,避免 projects Map 等单例污染
    isolate: true,
    // 不开 watch 默认(CI / 一次性运行)
    globals: false,
  },
  esbuild: {
    // 保留装饰器元数据(NestJS DI 依赖 emitDecoratorMetadata)
    target: "es2022",
  },
});
