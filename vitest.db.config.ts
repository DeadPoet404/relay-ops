import "./scripts/env";
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.ts"],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
