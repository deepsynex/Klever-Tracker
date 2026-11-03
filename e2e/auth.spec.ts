import { expect, test, type Page } from "@playwright/test";

// Mock API credentials (src/lib/graphql/mock.ts).
const EMAIL = "admin@demo.test";
const PASSWORD = "Demo@12345";

/**
 * Opens a page with a form and waits until it has finished loading. A click that lands while React
 * is still attaching the form handlers is dropped, so typing and clicking before then is flaky.
 */
async function openForm(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test("signed-out visitors are sent to login, keeping where they were going", async ({ page }) => {
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
});

test("shows field errors before calling the API", async ({ page }) => {
  await openForm(page, "/en/login");
  // The form starts pre-filled (mock credentials), so empty both fields first.
  await page.getByLabel("Email").clear();
  await page.getByLabel("Password", { exact: true }).clear();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This field is required.")).toHaveCount(2);
});

test("wrong password shows the generic message", async ({ page }) => {
  await openForm(page, "/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  // exact: the show/hide button's "Show password" label also contains "Password".
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Filter by text: Next.js also renders an empty role="alert" route announcer.
  await expect(page.getByRole("alert").filter({ hasText: "The email or password is incorrect." })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/login$/);
});

test("signs in, keeps the token out of JavaScript, and signs out", async ({ page, context }) => {
  // On a cold dev server the first sign-in also compiles the dashboard, which can pass 30 s.
  test.slow();
  await openForm(page, "/en/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Generous wait: on a cold dev server the first sign-in also compiles the dashboard.
  await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Mariam Al Hashimi" })).toBeVisible();

  const session = (await context.cookies()).find((c) => c.name === "kt_session");
  expect(session?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("kt_session");

  await page.getByRole("button", { name: "Mariam Al Hashimi" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  // Sign-out first revokes the token on the backend (logout mutation), then clears the cookie.
  // A dashboard refresh that lands just after the cookie is gone sends the user to login with
  // `?next=`; either way they end up signed out on the login page.
  await expect(page).toHaveURL(/\/en\/login(\?next=[^&]*)?$/, { timeout: 15_000 });
  expect((await context.cookies()).find((c) => c.name === "kt_session")).toBeUndefined();
});

test("Arabic renders right-to-left", async ({ page }) => {
  await page.goto("/ar/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "مرحبًا بعودتك" })).toBeVisible();
});

test("forgot password always confirms without revealing accounts", async ({ page }) => {
  await openForm(page, "/en/forgot-password");
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
