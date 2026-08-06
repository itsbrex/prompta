<script lang="ts">
  import { showInitScreen } from "$lib/stores/stores";
  import { chatModels, llmProviders } from "$lib/stores/stores/llmProvider";
  import { toast } from "$lib/toast";
  import classNames from "classnames";
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import IconOpenRouter from "./IconOpenRouter.svelte";
  import {
    beginOpenRouterAuth,
    OPENROUTER_KEYS_URL,
    OPENROUTER_PROVIDER_ID,
  } from "$lib/llm/openrouter";
  import { getSystem } from "$lib/gui";

  const sys = getSystem();

  let _class: string = "";
  export { _class as class };

  let input: HTMLInputElement;
  let apiKey = "";
  let error = "";

  onMount(() => {
    setTimeout(() => {
      input?.focus();
    }, 500);
  });

  let loading = false;
  let buttonText = "Start Chatting";

  const handleSubmit = async () => {
    try {
      error = "";
      loading = true;
      buttonText = "Loading...";
      if (!apiKey) {
        error = "No API key provided";
        console.log("API", apiKey, input.value);
        return;
      }

      await llmProviders.updateProvider(OPENROUTER_PROVIDER_ID, {
        apiKey,
        enabled: true,
      });
      buttonText = "Enabling OpenRouter...";
      // Let chatModels pick a valid default; OpenRouter's catalog is huge and
      // changes often, so hardcoding a model id here would go stale.
      await chatModels.refresh();

      $showInitScreen = { showing: false, provider: null };
    } catch (err: any) {
      error = err.message;
      console.warn("Error storing api key", err);
      toast({
        title: "Could not verify your API key",
        message: err.message,
        type: "error",
      });
    } finally {
      loading = false;
      buttonText = "Start Chatting";
    }
  };

  const skipInitScreen = () => {
    $showInitScreen = { showing: false, provider: null };
  };

  const handleConnectOpenRouter = async () => {
    try {
      error = "";
      connecting = true;
      if (sys.isTauri) {
        // AIDEV-NOTE: OAuth is browser-only. The desktop build has no HTTP
        // origin for OpenRouter to redirect back to. See llm/openrouter.ts.
        await sys.openExternal(OPENROUTER_KEYS_URL);
        toast({
          title: "Create a key in your browser",
          message: "Paste it below once you have it.",
          type: "info",
        });
        connecting = false;
        return;
      }
      await beginOpenRouterAuth();
    } catch (err: any) {
      connecting = false;
      error = err.message;
      toast({ title: "Could not start OpenRouter sign-in", message: err.message, type: "error" });
    }
  };

  let connecting = false;

  // AIDEV-NOTE: OpenRouter is the only provider with a setup screen. Everything
  // else is a user-added OpenAI-compatible endpoint, configured in settings.
  const providerName = "OpenRouter";
  const apiKeyLink = OPENROUTER_KEYS_URL;
  const keyPlaceholder = "sk-or-...";
</script>

<div
  on:keydown={($event) => {
    if ($event.key === "Escape") {
      skipInitScreen();
    }
  }}
  class={classNames(
    "InitScreen bg-gradient-to-b from-[#1B1B1B] to-transparent flex flex-col items-center p-12 pt-20",
    _class
  )}
>
  <div
    in:fly|global={{ duration: 500, delay: 150, y: -100, opacity: 0 }}
    out:fly|global={{ duration: 500, y: 30, opacity: 0 }}
    class="mb-4"
  >
    <IconOpenRouter class="!w-12 !h-12" />
  </div>
  <h1
    in:fly|global={{ duration: 300, delay: 200, y: 50, opacity: 0 }}
    out:fly|global={{ duration: 300, delay: 0, y: 50, opacity: 0 }}
    class="text-transparent bg-clip-text bg-gradient-to-br via-sky-400 to-indigo-500 from-blue-100 text-3xl font-extrabold tracking-wider"
  >
    {providerName} Setup
  </h1>
  <form
    on:submit|preventDefault={handleSubmit}
    in:fly|global={{ duration: 300, delay: 200, y: 50, opacity: 0 }}
    out:fly|global={{ duration: 300, delay: 0, y: 50, opacity: 0 }}
    class="mt-8 max-w-[400px] flex flex-col space-y-4"
  >
    <button
        type="button"
        data-testid="ConnectOpenRouterButton"
        disabled={connecting}
        on:click={handleConnectOpenRouter}
        class="w-full flex items-center justify-center px-2 py-[6px] rounded bg-gradient-to-r to-indigo-800 from-blue-500 text-white font-semibold tracking-wide disabled:opacity-60"
      >
        <IconOpenRouter class="w-4 h-4 mr-2" />
        {connecting ? "Redirecting to OpenRouter..." : "Sign in with OpenRouter"}
      </button>
      <p class="text-center text-xs opacity-60 leading-tight">
        Creates an API key on your OpenRouter account. Nothing is sent to us.
      </p>
    <div class="flex items-center gap-3 opacity-50">
      <span class="h-px flex-1 bg-white/30" />
      <small>or paste a key</small>
      <span class="h-px flex-1 bg-white/30" />
    </div>
    <div
      class={classNames("rounded p-px gradient-border", {
        error: error,
        "gradient-animate-once": !loading,
        "gradient-animate-infinite": loading,
      })}
    >
      <input
        id="sk"
        class="input rounded w-full focus:ring-0 focus:outline-none"
        type="password"
        placeholder={keyPlaceholder}
        data-testid="APIKeyInput"
        bind:value={apiKey}
        bind:this={input}
      />
    </div>
    <button
      type="submit"
      data-testid="SaveAPIKeyButton"
      class="w-full text-center px-2 py-[6px] rounded bg-gradient-to-r to-indigo-800 from-blue-500 text-white font-semibold tracking-wide"
    >
      {buttonText}
    </button>
    <p class="leading-light">
      <small>
        See:
        <a
          class="text-blue-200 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
          href={apiKeyLink}
        >
          {apiKeyLink}
        </a>
      </small>
    </p>
    <p class="leading-tight">
      <small>
        Your API key is stored locally on your computer. It is not sent to any server. If you ever
        wish to remove it from local storage simply delete it from the settings screen.
      </small>
    </p>
    <button
      type="button"
      data-testid="SkipAPIKeyButton"
      class="w-full text-center px-2 py-[6px] rounded text-white font-semibold tracking-wide border border-white/30 hover:bg-white/10"
      on:click={skipInitScreen}
    >
      Cancel
    </button>
  </form>
</div>

<style>
  .gradient-border {
    position: relative;
  }

  .gradient-border:before {
    content: "";
    position: absolute;
    pointer-events: none;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    border: 2px solid transparent;
    background-image: linear-gradient(45deg, #13e6dd, #5e5eb5, #13e6dd);
    background-size: 200% 200%;
    z-index: 0;
    border-radius: inherit;
  }

  .gradient-border.error:before {
    @apply bg-gradient-to-br from-red-500 to-yellow-500;
  }

  .gradient-animate-once:before {
    animation: gradient 1s linear;
    animation-delay: 500ms;
  }
  .gradient-animate-infinite:before {
    animation: gradient 1s linear infinite;
  }

  .gradient-border:after {
    content: "";
    position: absolute;
    z-index: 1;
    top: 3px;
    right: 3px;
    bottom: 3px;
    left: 3px;
    border-radius: inherit;
  }

  .gradient-border > * {
    position: relative;
    z-index: 2;
  }

  @keyframes gradient {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: 0 200%;
    }
  }
</style>
