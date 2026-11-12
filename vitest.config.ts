
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      testTimeout: 30000,
      hookTimeout: 30000,
      env,
    },
  };
});
