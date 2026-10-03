import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 60000,
  workers: 1,
  use: { baseURL: "http://localhost:3000", launchOptions: { executablePath: "/usr/bin/google-chrome" } },
});
