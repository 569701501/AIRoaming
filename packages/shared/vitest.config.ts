import { defineConfig } from "vitest/config";

/**
 * shared 包测试配置。
 * shared 是纯 TypeScript + ESM,无框架依赖,Vitest 零配置即可。
 */
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    isolate: true,
    globals: false,
  },
});
