<script lang="ts">
import Icon from '#lib/components/Icon.svelte'
import { href, pageAt, pages, sections } from '#lib/docs.js'
import { afterNavigate } from '$app/navigation'
import { page } from '$app/state'
import type { LayoutProps } from './$types'

let { children }: LayoutProps = $props()

const current = $derived(pageAt(page.url.pathname))
const index = $derived(current ? pages.indexOf(current) : -1)
const next = $derived(pages[index + 1])

// "On this page" lists the article's h2s, and marks the one you're reading.
let article: HTMLElement | undefined = $state()
let headings: { id: string; text: string }[] = $state([])
let active = $state('')
let menu: HTMLDetailsElement | undefined = $state()

afterNavigate(() => {
  if (menu) menu.open = false
  headings = [...(article?.querySelectorAll('h2[id]') ?? [])].map((h) => ({
    id: h.id,
    text: h.textContent?.replace(/^\d+\s*/, '').trim() ?? '',
  }))
  onScroll()
})

function onScroll() {
  let found = headings[0]?.id ?? ''
  for (const h of headings) {
    const el = document.getElementById(h.id)
    if (el && el.getBoundingClientRect().top < 120) found = h.id
  }
  active = found
}
</script>

<svelte:window onscroll={onScroll} />

<svelte:head>
  <title>{current ? `${current.title} · DroidHost docs` : 'DroidHost docs'}</title>
</svelte:head>

<div class="flex flex-col gap-6 px-5 pt-6 pb-16 lg:flex-row lg:gap-16 lg:px-16 lg:pt-12 lg:pb-24">
  <!-- Small screens: the sidebar folds into a menu -->
  <details bind:this={menu} class="group bg-card lg:hidden">
    <summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px] font-medium">
      {current?.title ?? 'Docs'}
      <Icon name="arrow-down-01" class="size-5 text-muted transition-transform group-open:rotate-180" />
    </summary>
    {@render nav()}
  </details>

  <aside class="hidden w-60 shrink-0 lg:block">
    <div class="sticky top-8">{@render nav()}</div>
  </aside>

  <article bind:this={article} class="doc flex min-w-0 flex-1 flex-col lg:max-w-[720px]">
    {@render children()}

    {#if next}
      <nav class="mt-8 flex justify-end border-t border-line pt-7" aria-label="Next page">
        <a href={href(next)} class="group flex w-full flex-col items-end gap-1 bg-card px-6 py-[18px] sm:w-[300px]">
          <span class="text-[13px] leading-[18px] text-muted">Next</span>
          <span class="font-display text-xl leading-[26px] font-medium group-hover:text-violet">{next.title} →</span>
        </a>
      </nav>
    {/if}
  </article>

  {#if headings.length > 1}
    <aside class="hidden w-[200px] shrink-0 pt-2 xl:block">
      <nav class="sticky top-8 flex flex-col gap-3" aria-label="On this page">
        <p class="text-[13px] leading-[18px] font-semibold">On this page</p>
        <ul class="flex flex-col gap-2.5 border-l border-line pl-3.5 text-sm leading-5">
          {#each headings as h (h.id)}
            <li>
              <a href="#{h.id}" class={h.id === active ? 'font-medium text-violet' : 'text-muted hover:text-ink'}>{h.text}</a>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>
  {/if}
</div>

{#snippet nav()}
  <nav class="flex flex-col gap-7 px-1 pb-4 lg:px-0 lg:pb-0" aria-label="Docs">
    {#each sections as section (section.title)}
      <div class="flex flex-col gap-0.5">
        <p class="px-3 pb-2 text-[13px] leading-[18px] font-semibold">{section.title}</p>
        {#each section.pages as p (p.slug)}
          <a
            href={href(p)}
            aria-current={p === current ? 'page' : undefined}
            class="px-3 py-2 text-[15px] leading-5 {p === current ? 'bg-lavender font-medium text-violet' : 'text-body hover:text-ink'}"
          >
            {p.title}
          </a>
        {/each}
      </div>
    {/each}
  </nav>
{/snippet}
