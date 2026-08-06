<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Switch } from "$lib/components/ui/switch";
  import { chatModels, isDefaultProvider, llmProviders } from "$lib/stores/stores/llmProvider";
  import classNames from "classnames";
  import { slide } from "svelte/transition";
  import type { LLMProvider } from "$lib/db";
  import { nanoid } from "nanoid";
  import { toast } from "$lib/toast";
  import { Trash } from "lucide-svelte";
  import { verifyOpenAICompatibileProvider } from "$lib/stores/stores/llmProfile";
  import SmallSpinner from "./SmallSpinner.svelte";
  import IconOpenRouter from "./IconOpenRouter.svelte";
  import { beginOpenRouterAuth, OPENROUTER_KEYS_URL } from "$lib/llm/openrouter";
  import { getSystem } from "$lib/gui";

  const sys = getSystem();

  let _class: string = "";
  export { _class as class };

  export let provider: LLMProvider;

  const descriptions: Record<string, string> = {
    openrouter:
      "Hundreds of models from every major lab behind one API. Sign in to create a key automatically, or paste one you already have.",
  };

  // NOTE: Don't extract `enabled` from the provider object, it causes a bug where the switch doesn't update
  //
  let name: string, baseUrl: string, apiKey: string;

  // AIDEV-NOTE: Resync the editable fields when — and only when — the provider
  // object itself is replaced.
  //
  // Why not a plain `let {name, baseUrl} = provider`: the component instance is
  // reused when the store swaps in a new provider object, so a one-time
  // destructure goes stale. After the OpenRouter OAuth callback wrote a key,
  // the form still held apiKey="" and pressing Save wrote that empty string
  // back, destroying the key that was just issued.
  //
  // Why not a plain `$: ({name, baseUrl} = provider)`: that re-runs on
  // unrelated update cycles and wipes whatever the user is currently typing.
  // Guarding on object identity gives us the resync without the clobber.
  let syncedFrom: LLMProvider | null = null;
  $: if (provider !== syncedFrom) {
    syncedFrom = provider;
    ({ name, baseUrl, apiKey } = provider);
  }

  const cancelEdit = () => {
    name = provider.name;
    baseUrl = provider.baseUrl;
    apiKey = provider.apiKey;

    if (isNewProvider(provider)) {
      llmProviders.removeProvider("new");
    }
  };

  const isNewProvider = (x: LLMProvider) => x.id === "new";

  let loading = false;
  let connecting = false;

  const handleConnectOpenRouter = async () => {
    try {
      connecting = true;
      if (sys.isTauri) {
        // AIDEV-NOTE: The desktop build has no HTTP origin for OpenRouter to
        // redirect back to, so OAuth is browser-only. Send the user to create a
        // key by hand instead. Proper desktop support needs a deep-link scheme.
        await sys.openExternal(OPENROUTER_KEYS_URL);
        toast({
          title: "Create a key in your browser",
          message: "Paste the key below once you've created it.",
          type: "info",
        });
        // Unlike the browser path we aren't navigating away, so the button has
        // to become clickable again.
        connecting = false;
        return;
      }
      await beginOpenRouterAuth();
    } catch (err: any) {
      connecting = false;
      toast({ title: "Could not start OpenRouter sign-in", message: err.message, type: "error" });
    }
  };

  $: isDirty =
    isNewProvider(provider) ||
    name !== provider.name ||
    baseUrl !== provider.baseUrl ||
    apiKey !== provider.apiKey;
</script>

<Card.Root class={classNames("", _class)}>
  <Card.Header>
    <Card.Title class="flex items-center space-x-4">
      {#if provider.id === "openrouter"}
        <IconOpenRouter class="w-6 h-6 text-[#30CEC0]" />
      {/if}
      <span>
        {provider.name}
      </span>
      {#if !isDefaultProvider(provider) && !isNewProvider(provider)}
        <button
          class="hover:text-red-500"
          on:click={() => {
            llmProviders.removeProvider(provider.id);
          }}
        >
          <Trash class="w-5 h-5" />
        </button>
      {/if}
      {#if !isNewProvider(provider)}
        <Switch
          class="!ml-auto"
          disabled={!provider.apiKey}
          checked={Boolean(provider.apiKey && provider.enabled)}
          onCheckedChange={async (checked) => {
            if (!provider.apiKey) {
              toast({
                title: "API Key required",
                message: "Please enter an API key to enable.",
                type: "error",
              });
              return;
            }

            await llmProviders.updateProvider(provider.id, { enabled: checked });
            await chatModels.refresh();
            toast({
              title: "Provider updated",
              message: `${provider.name} ${checked ? "enabled" : "disabled"}`,
              type: "success",
            });
          }}
        />
      {/if}
    </Card.Title>
    {#if descriptions[provider.id]}
      <Card.Description>{descriptions[provider.id]}</Card.Description>
    {/if}
  </Card.Header>
  <Card.Content>
      <form>
        <div class="grid w-full items-center gap-4">
          {#if provider.id === "openrouter" && !provider.apiKey}
            <Button
              data-testid="ConnectOpenRouterButton"
              class="w-full"
              disabled={connecting}
              on:click={(e) => {
                e.preventDefault();
                handleConnectOpenRouter();
              }}
            >
              {#if connecting}
                <SmallSpinner class="w-5 h-5 mr-2 border-black" />
              {:else}
                <IconOpenRouter class="w-4 h-4 mr-2" />
                Sign in with OpenRouter
              {/if}
            </Button>
            <p class="text-center text-xs opacity-60 leading-tight">or paste a key manually</p>
          {/if}

          {#if !isDefaultProvider(provider)}
            <div class="flex flex-col space-y-1.5">
              <Input bind:value={name} placeholder="Name of the provider" />
            </div>
            <div class="flex flex-col space-y-1.5">
              <Input bind:value={baseUrl} placeholder="Base URL (ex: https://api.openai.com/v1/)" />
            </div>
          {/if}

          <div class="flex flex-col space-y-1.5">
            <Input bind:value={apiKey} placeholder="API Key" type="password" />
          </div>

          {#if provider.id === "openrouter"}
            <p class="leading-tight">
              <small> You can also find or revoke keys in the OpenRouter dashboard. </small>
              <small>
                See:
                <a
                  class="text-blue-200 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={OPENROUTER_KEYS_URL}
                >
                  {OPENROUTER_KEYS_URL}
                </a>
              </small>
            </p>
          {/if}

          <p class="leading-tight">
            <small>
              Your API key is stored locally on your computer. If you ever wish to remove it from
              local storage simply delete the value above.
            </small>
          </p>
        </div>
      </form>
    </Card.Content>
    {#if isDirty}
      <div transition:slide={{ duration: 150 }}>
        <Card.Footer class="flex justify-between">
          <Button on:click={cancelEdit} variant="outline">Cancel</Button>
          <Button
            on:click={async (e) => {
              e.preventDefault();
              if (!isDefaultProvider(provider)) {
                if (!name) {
                  toast({
                    title: "Name is required",
                    message: "Please enter a name.",
                    type: "error",
                  });
                  return;
                }
                if (!baseUrl) {
                  toast({
                    title: "Base URL is required",
                    message: "Please enter a base URL.",
                    type: "error",
                  });
                  return;
                }
                try {
                  new URL(baseUrl);
                } catch (e) {
                  toast({
                    title: "Invalid URL",
                    message: "Please enter a valid URL.",
                    type: "error",
                  });
                  return;
                }

                if (!baseUrl.endsWith("/")) {
                  baseUrl += "/"; // Should probably handle this at the calling code, but the trailing slash is required
                }

                try {
                  loading = true;
                  const isCompatible = await verifyOpenAICompatibileProvider({
                    baseUrl,
                    apiKey,
                  });
                  if (!isCompatible) {
                    toast({
                      title: "Incompatible API",
                      message:
                        "The provided API key is not compatible with the selected provider. Prompta requires the OpenAI API format.",
                      type: "error",
                    });
                    return;
                  }
                } catch (e) {
                  toast({
                    title: "Error",
                    message: e.message,
                    type: "error",
                  });
                  return;
                }
              }

              if (isNewProvider(provider)) {
                await llmProviders.createProvider({
                  id: nanoid(),
                  name,
                  baseUrl,
                  apiKey,
                  enabled: true,
                });
                loading = false;
              } else {
                await llmProviders.updateProvider(provider.id, {
                  name,
                  baseUrl,
                  apiKey,
                  enabled: Boolean(apiKey),
                });
              }

              chatModels.refresh();
            }}
          >
            {#if loading}
              <SmallSpinner class="w-5 h-5 mr-2 border-black" />
            {:else}
              Save
            {/if}
          </Button>
        </Card.Footer>
      </div>
    {/if}
</Card.Root>
