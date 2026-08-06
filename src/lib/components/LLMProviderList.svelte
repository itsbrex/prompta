<script lang="ts">
  import LlmProviderForm from "./LLMProviderForm.svelte";
  import { llmProviders, isDefaultProvider } from "$lib/stores/stores/llmProvider";
  import { Button } from "./ui/button";

  $: showNewProviderButton = $llmProviders.providers.at(-1)?.id !== "new";
  $: builtInProviders = $llmProviders.providers.filter(isDefaultProvider);
  // AIDEV-NOTE: Filter on isDefaultProvider, NOT getSpecialProviders(). The
  // latter only lists built-ins that still need a key, so once one is
  // configured it would fall through and render a second time as "custom".
  $: customProviders = $llmProviders.providers.filter((p) => !isDefaultProvider(p));
</script>

<div class="flex flex-col space-y-4">
  {#each builtInProviders as provider (provider.id)}
    <LlmProviderForm {provider} />
  {/each}

  <!-- Custom Providers Section -->
  {#if customProviders.length > 0}
    {#each customProviders as provider}
      <LlmProviderForm {provider} />
    {/each}
  {/if}

  {#if showNewProviderButton}
    <Button on:click={llmProviders.addNewProvider} variant="outline" class="border border-zinc-700"
      >Add custom LLM provider</Button
    >
    <p class="leading-tight">
      <small>
        Add any endpoint that speaks the OpenAI API — OpenAI itself (<code
          >https://api.openai.com/v1/</code
        >), a proxy like Helicone, or a local LLM served by
        <a
          href="https://github.com/mudler/LocalAI"
          class="text-blue-200 hover:underline"
          target="_blank"
          rel="noopener noreferrer">LocalAI</a
        >
        or
        <a
          href="https://github.com/BerriAI/litellm"
          class="text-blue-200 hover:underline"
          target="_blank"
          rel="noopener noreferrer">LiteLLM</a
        >.
      </small>
    </p>
  {/if}
</div>
