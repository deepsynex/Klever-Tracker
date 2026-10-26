import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests run against the dev server with the mock API, so they don't depend on the
 * real backend. Locally they use the installed Chrome; CI installs Playwright's Chromium.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/en/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { KLEVER_MOCK: "true" },
  },
});
