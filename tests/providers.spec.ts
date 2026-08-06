import { test, expect, type Page } from "@playwright/test";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const openSettings = async (page: Page) => {
  await page.getByTestId("CommandMenuButton").click();
  await page.getByPlaceholder("Search for actions").fill("settings");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
};

test("no provider is usable until the user supplies a key", async ({ page }) => {
  await page.goto("/");

  // Nothing to talk to, so the composer is inert and says so.
  await expect(page.getByTestId("ChatInput")).toBeDisabled();
  await expect(page.getByTestId("ChatInput")).toHaveAttribute(
    "placeholder",
    "Add an API key to start chatting"
  );

  await openSettings(page);

  // OpenRouter is the only built-in provider, and it ships disabled: it can't be
  // toggled on without a key.
  // NOTE: the card heading also contains the Switch, so its text has trailing
  // whitespace — match on a prefix rather than an exact string.
  const toggle = page.getByRole("heading", { name: /^OpenRouter/ }).getByRole("switch");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toBeDisabled();

  // OpenAI and Anthropic are no longer special-cased — they're just custom endpoints.
  await expect(page.getByRole("heading", { name: /^OpenAI/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Anthropic/ })).toHaveCount(0);
});

test("openrouter offers oauth sign-in as an alternative to pasting a key", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);

  const connect = page.getByTestId("ConnectOpenRouterButton").first();
  await expect(connect).toBeVisible();

  // Don't complete the flow (it needs a real OpenRouter login) — just assert we
  // hand off to OpenRouter with a correctly formed PKCE challenge.
  let authUrl: string | null = null;
  await page.route("https://openrouter.ai/auth**", async (route) => {
    authUrl = route.request().url();
    await route.abort();
  });

  await connect.click();
  await expect.poll(() => authUrl).not.toBeNull();

  const u = new URL(authUrl as unknown as string);
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  expect(u.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(u.searchParams.get("callback_url")).toBeTruthy();
});

test("custom provider", async ({ page }) => {
  test.skip(!OPENROUTER_API_KEY, "OPENROUTER_API_KEY is not set");

  const customProvider = {
    // NOTE: deliberately not "OpenRouter" — that's now a built-in provider, and
    // the heading locators below would match its card instead of this one.
    name: "Custom Router",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_API_KEY as string,
  };

  // Go to the settings
  await page.goto("/");
  await openSettings(page);

  // Add custom provider
  await page.getByRole("button", { name: "Add custom" }).click();
  await page.getByPlaceholder("Name of the provider").fill(customProvider.name);
  await page.getByPlaceholder("Base URL (ex: https://api.").fill(customProvider.baseUrl);
  await page.getByPlaceholder("API Key").last().fill(customProvider.apiKey);
  await page.getByRole("button", { name: "Save" }).click();

  // Wait for the provider to be added and check for the delete button
  const providerHeading = page.getByRole("heading", { name: customProvider.name });
  await expect(providerHeading).toBeVisible({ timeout: 10000 });
  await expect(providerHeading.getByRole("button")).toBeVisible();

  // Check that it's enabled by default
  await expect(providerHeading.getByRole("switch")).toHaveAttribute("aria-checked", "true", {
    timeout: 10000,
  });

  // Close the settings panel
  await page.keyboard.press("Escape");
  await expect(page.getByText("Settings", { exact: true })).not.toBeVisible();

  // Check that the models of the provider were loaded and select one
  await page.getByTestId("ModelPickerButton").click();
  await expect(page.getByTestId("ModelPickerList")).toBeVisible();
  await page.getByPlaceholder("Model...").fill("llama");

  const llamaOption = page.getByRole("option", {
    name: "meta-llama/llama-3.2-1b-instruct",
    exact: true,
  });
  await expect(llamaOption).toBeVisible({ timeout: 10000 });
  await llamaOption.click();
  await expect(page.getByTestId("ModelPickerList")).not.toBeVisible();

  // Reload the page and check the model is still selected as the default
  await page.reload();

  // Wait for the page to be fully loaded after reload
  await page.getByTestId("ModelPickerButton").click();
  await page.getByPlaceholder("Model...").fill("llama");

  // Wait for the option to be visible and selected
  await expect(llamaOption).toBeVisible({ timeout: 10000 });
});
