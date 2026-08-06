import { expect, test, type Page } from "@playwright/test";
import { sendMessageAndWaitForResponse, seedOpenRouterKey } from "./test-helpers";

const openRouterKey = process.env.OPENROUTER_API_KEY as string;

test("has chat input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("ChatInput")).toBeVisible();
});

test("can send a message and get a response", async ({ page }) => {
  test.skip(!openRouterKey, "OPENROUTER_API_KEY not set");

  await seedOpenRouterKey(page, openRouterKey);
  await page.goto("/");
  const testMessage = `this is a test message. Please respond with the text "pong" to verify we're connected.`;
  await sendMessageAndWaitForResponse(page, { content: testMessage });
  await expect(page.locator(".ChatMessage")).toHaveCount(2);
});

// This is a pseudo test, because I don't know how to trigger an actual
// migration failure. Rather, this test causes the db to fail to initialize,
// then asserts that in such a situation chats are preserved. Of course this
// does not test the case where the previous database was actually corrupted,
// which should still allow use of the app but will not recover data.
test("migration screen should preserve chats through a reset", async ({ page }) => {
  test.skip(!openRouterKey, "OPENROUTER_API_KEY not set");

  await seedOpenRouterKey(page, openRouterKey);
  await page.addInitScript(() => {
    (window as any).__locks = navigator.locks;
    localStorage.__mocked = localStorage.__mocked || "false";
    Object.defineProperty(navigator, "locks", {
      get() {
        if (localStorage.__mocked === "true") {
          return undefined;
        } else {
          return (window as any).__locks;
        }
      },
    });
  });
  await page.goto("/");
  await sendMessageAndWaitForResponse(page, { content: "this is a test message" });
  await expect(page.locator(".ChatMessage")).toHaveCount(2);

  const msgs = await page.evaluate(() => {
    return [...document.querySelectorAll(".ChatMessage")].map((x) => x.textContent?.trim());
  });

  // Add mock, cause db crash
  await page.evaluate(() => {
    localStorage.__mocked = "true";
  });
  await page.reload();

  const button = page.getByRole("button", { name: "begin migration" });
  await expect(button).toBeVisible();

  // Remove mock
  await page.evaluate(() => {
    localStorage.__mocked = "false";
  });

  // Try again
  await button.click();

  // We should be all good to go now
  await expect(page.getByTestId("ChatInput")).toBeVisible();

  // Select the last chat thread
  await page.getByRole("button", { name: "New Chat" }).click();
  await page.getByPlaceholder("Search Chats...").press("ArrowDown");
  await page.getByPlaceholder("Search Chats...").press("Enter");
  await page.locator(".ChatMessage").first().waitFor();

  const msgs2 = await page.evaluate(() => {
    return [...document.querySelectorAll(".ChatMessage")].map((x) => x.textContent?.trim());
  });

  // Ensure that the past database was preserved during migration
  expect(msgs).toEqual(msgs2);
});
