import type { LLMProvider, MinimalLLMClient } from "$lib/db";
import { OpenAI, type ClientOptions } from "openai";

const headerWhitelist = new Set(["content-type", "authorization"]);

/**
 * A fetch wrapper to strip certain custom headers. The custom headers caused
 * CORS issues with 3-rd party providers, despite being otherwise API compatible.
 * The issue was that the SDK would specifically request those custom headers
 * as cors headers and the server would not allow them (they are custom, after all).
 * Using the defaultHeaders option in the SDK does not allow overwriting those
 * custom headers. I feel safe assuming things will still work becuase openai
 * does not document those headers as required.
 */
const openAiFetchWrapper = (url: RequestInfo, options?: RequestInit) => {
  const hs: Record<string, any> = {};

  // Filter keys. Lots of CORS servers DO NOT like the custom headers that openai SDK sets.
  // NOTE: This could be conditional on the URL being some non-openai endpoint, but this is simpler.
  // NOTE: Safari also did not like the User-Agent header, so I've adopted as whitelist approach.
  for (const [k, v] of Object.entries(options?.headers || {})) {
    if (!headerWhitelist.has(k.toLowerCase())) {
      continue;
    }
    hs[k] = v;
  }

  console.debug("OpenAI Fetch ::", (options?.method || "get").toUpperCase(), url, {
    ...hs,
    Authorization: hs.Authorization ? hs.Authorization?.slice(0, 14) + "..." : undefined,
  });

  return fetch(url, {
    ...options,
    headers: hs,
  });
};

// NOTE The openai client is not currently cached because the opts change at
// runtime. namely the base url and api key.
export const initOpenAi = (opts: ClientOptions) => {
  return new OpenAI({
    // The app is currently all browser-based, and the key is stored locally and
    // only sent to openai.
    dangerouslyAllowBrowser: true,
    fetch: openAiFetchWrapper,
    ...opts,
  });
};

/**
 * Every provider speaks the OpenAI API, so there is exactly one client.
 * AIDEV-NOTE: There used to be a `createClient` escape hatch here for the
 * Anthropic shim. Anthropic is no longer a built-in provider (use OpenRouter
 * for Claude), so the hook and the shim are gone.
 */
export const getProviderClient = (provider: LLMProvider): MinimalLLMClient => {
  return initOpenAi({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
  });
};

/**
 * The only built-in provider. It is special solely because it can mint its own
 * key via OAuth; everything else is a user-added OpenAI-compatible endpoint.
 * Every provider requires an API key — there is no key-less option.
 */
export const defaultProviders: LLMProvider[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/",
    apiKey: "",
    enabled: false,
    createdAt: new Date(0),
  },
];
