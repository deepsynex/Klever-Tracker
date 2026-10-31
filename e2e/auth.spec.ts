import { expect, test } from "@playwright/test";

// Mock API credentials (src/lib/graphql/mock.ts).
const EMAIL = "admin@demo.test";
const PASSWORD = "Demo@12345";

test("signed-out visitors are sent to login, keeping where they were going", async ({ page }) => {
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("shows field errors before calling the API", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This field is required.")).toHaveCount(2);
});

test("wrong password shows the generic message", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Filter by text: Next.js also renders an empty role="alert" route announcer.
  await expect(page.getByRole("alert").filter({ hasText: "The email or password is incorrect." })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/login$/);
});

test("signs in, keeps the token out of JavaScript, and signs out", async ({ page, context }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Mariam Al Hashimi" })).toBeVisible();

  const session = (await context.cookies()).find((c) => c.name === "kt_session");
  expect(session?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("kt_session");

  await page.getByRole("button", { name: "Mariam Al Hashimi" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
  expect((await context.cookies()).find((c) => c.name === "kt_session")).toBeUndefined();
});

test("Arabic renders right-to-left", async ({ page }) => {
  await page.goto("/ar/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
});

test("forgot password always confirms without revealing accounts", async ({ page }) => {
  await page.goto("/en/forgot-password");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
});

test("the GraphQL proxy rejects requests without a session or from another origin", async ({ request }) => {
  const noSession = await request.post("/api/graphql", {
    data: { query: "{ ping }" },
    headers: { Origin: "http://localhost:3100" },
  });
  expect(noSession.status()).toBe(401);

  const foreign = await request.post("/api/graphql", {
    data: { query: "{ ping }" },
    headers: { Origin: "https://evil.example" },
  });
  expect(foreign.status()).toBe(403);
});
