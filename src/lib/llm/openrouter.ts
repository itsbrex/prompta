import { base } from "$app/paths";

/**
 * OpenRouter OAuth PKCE.
 *
 * AIDEV-NOTE: Despite the OAuth framing, this flow does not produce an access
 * token. The exchange returns a durable, user-owned API key which we store in
 * exactly the same place as a hand-pasted one. There is no refresh token, no
 * expiry, and therefore no session to maintain. Treat the result as a key.
 *
 * See: https://openrouter.ai/docs/guides/overview/auth/oauth
 */

const AUTH_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

/**
 * The verifier has to survive a full-page navigation to openrouter.ai and back,
 * so it lives in localStorage rather than memory.
 */
const VERIFIER_KEY = "openrouter-pkce-verifier";

export const OPENROUTER_PROVIDER_ID = "openrouter";
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";

const base64UrlEncode = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** 32 random bytes -> 43 base64url chars, within the RFC 7636 43-128 range. */
const createCodeVerifier = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
};

const createCodeChallenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
};

/**
 * Where OpenRouter sends the user back to. This is the app root: the app is a
 * single-route SPA, so `+layout.svelte` picks the code up on mount. OpenRouter
 * accepts localhost callbacks on any port, so this works in dev unchanged.
 */
export const getCallbackUrl = () => {
  return new URL(`${base || ""}/`, window.location.origin).href;
};

/**
 * Kick off the flow. Navigates away from the app, so nothing after this
 * resolves in practice.
 */
export const beginOpenRouterAuth = async () => {
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);

  // Store only after the challenge is computed, so a crypto failure doesn't
  // leave a stale verifier behind.
  localStorage.setItem(VERIFIER_KEY, verifier);

  const u = new URL(AUTH_URL);
  u.searchParams.set("callback_url", getCallbackUrl());
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");

  console.debug("[openrouter] begin auth", u.href);
  window.location.href = u.href;
};

/** Pull the `code` param, if this page load is an OAuth callback. */
export const readAuthCodeFromUrl = () => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("code");
};

/**
 * Remove the code from the URL so a refresh can't attempt to replay a spent
 * code, and so the value isn't left sitting in the address bar.
 */
export const clearAuthCodeFromUrl = () => {
  const u = new URL(window.location.href);
  u.searchParams.delete("code");
  window.history.replaceState({}, "", u.pathname + u.search + u.hash);
};

/**
 * Exchange the one-time code for a real API key.
 */
export const exchangeCodeForKey = async (code: string) => {
  const codeVerifier = localStorage.getItem(VERIFIER_KEY);

  if (!codeVerifier) {
    throw new Error(
      "No PKCE verifier found. Start the OpenRouter sign-in from this browser and try again."
    );
  }

  const res = await fetch(EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      code_challenge_method: "S256",
    }),
  });

  // The verifier is single-use regardless of outcome. Retrying with a spent
  // code will not succeed, so don't leave it lying around.
  localStorage.removeItem(VERIFIER_KEY);

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message || body?.message || "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(
      `OpenRouter rejected the sign-in (${res.status})${detail ? `: ${detail}` : ""}`
    );
  }

  const data = await res.json();

  if (!data?.key) {
    throw new Error("OpenRouter returned no API key.");
  }

  return data.key as string;
};
