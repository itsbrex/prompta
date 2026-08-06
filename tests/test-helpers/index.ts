import { expect, type Page } from "@playwright/test";

/**
 * Seed a working provider before the app boots.
 *
 * There is no longer a key-less default provider, so any test that actually
 * talks to a model has to bring a key. Built-in provider credentials live in
 * localStorage, so we can set them up front rather than driving the UI.
 */
export const seedOpenRouterKey = async (page: Page, apiKey: string) => {
  await page.addInitScript((key) => {
    localStorage.setItem("llm-provider-openrouter-apiKey", key);
    localStorage.setItem("llm-provider-openrouter-enabled", "true");
  }, apiKey);
};

/**
 * Sends a message to the AI, does not wait for response
 */
export const sendMessage = async (page: Page, { content }: { content: string }) => {
  const chatBox = page.getByPlaceholder("Ask Prompta...");
  const submitButton = page.getByTestId("ChatInputSubmit");
  await chatBox.fill(content);
  await expect(submitButton).toBeVisible();
  await submitButton.click();
};

/**
 *  Sends a message to the AI, waits for response.
 */
export const sendMessageAndWaitForResponse = async (
  page: Page,
  { content }: { content: string }
) => {
  await sendMessage(page, { content });
  const n = await page.locator(".ChatMessage").count();
  await page
    .locator(".ChatMessage")
    .nth(n + 1)
    .waitFor();

  // Wait for the cursor to disappear. The cursor indicates a response is still completing
  await page.locator(".has-cursor").waitFor({ state: "detached" });
  await page.waitForTimeout(50); // A few frames to hopefully allow any cleanup / persistence to happen in the browser
};
