<script lang="ts">
  import classNames from "classnames";
  let _class: string = "";
  export { _class as class };
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={classNames("w-5 h-5", _class)}
>
  <title>OpenRouter</title>
  <!-- A router/fan-out mark: one input branching to several model endpoints -->
  <circle cx="4" cy="12" r="2" />
  <circle cx="20" cy="5" r="2" />
  <circle cx="20" cy="12" r="2" />
  <circle cx="20" cy="19" r="2" />
  <path d="M6 12h4l4-7h4" />
  <path d="M6 12h12" />
  <path d="M6 12h4l4 7h4" />
</svg>
