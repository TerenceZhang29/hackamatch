import { expect, test } from "@playwright/test";
import { countMail, deleteUser, uniqueEmail } from "./helpers";

test("pages send security headers and a fresh script nonce each time", async ({ request }) => {
  const first = await request.get("/");
  const second = await request.get("/");
  const headers = first.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();

  const nonceOf = (csp: string | undefined) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
  const nonce = nonceOf(headers["content-security-policy"]);
  expect(nonce).toBeTruthy();
  expect(nonceOf(second.headers()["content-security-policy"])).not.toBe(nonce);
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  // Next.js puts the nonce on its own scripts.
  expect(await first.text()).toContain(`nonce="${nonce}"`);
});

test("scripts still run under the policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto("/login");
  await page.getByLabel("Cornell email").fill("not-cornell@gmail.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  // The error comes back through a server action, which needs client-side JavaScript.
  await expect(page.getByText("Use your @cornell.edu email")).toBeVisible();
  expect(violations).toEqual([]);
});

test("the 6th sign-in email to one address within an hour is refused", async ({ page }) => {
  test.setTimeout(60_000);
  const email = uniqueEmail();
  try {
    for (let attempt = 1; attempt <= 6; attempt++) {
      await page.goto("/login");
      await page.getByLabel("Cornell email").fill(email);
      await page.getByRole("button", { name: "Email me a sign-in link" }).click();
      if (attempt <= 5) {
        await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
        // Supabase sends at most one email per address per second.
        await page.waitForTimeout(1_100);
      } else {
        await expect(
          page.getByText("Too many sign-in emails. Wait a while and try again."),
        ).toBeVisible();
      }
    }
    expect(await countMail(email)).toBe(5);
  } finally {
    await deleteUser(email);
  }
});
