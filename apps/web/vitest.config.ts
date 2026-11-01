import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // The default 5s can be too short for the first heavy-component test in a file when the
      // whole monorepo test suite runs in parallel under load (observed: BookingForm.test.tsx,
      // SignInPage.test.tsx). Later tests in the same file consistently finish in under 2s.
      testTimeout: 15_000,
    },
  }),
);
