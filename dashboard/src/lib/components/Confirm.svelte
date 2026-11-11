<script lang="ts">
// Asks before anything hard to undo. A native <dialog>, so focus and Escape just work.
let {
  open = $bindable(false),
  title,
  body,
  action,
  busyLabel,
  onconfirm,
}: {
  open?: boolean
  title: string
  body: string
  action: string
  busyLabel: string
  onconfirm: () => Promise<void>
} = $props()

let dialog = $state<HTMLDialogElement>()
let busy = $state(false)

$effect(() => {
  if (open && !dialog?.open) dialog?.showModal()
  if (!open && dialog?.open) dialog?.close()
})

async function confirm() {
  busy = true
  try {
    await onconfirm()
    open = false
  } catch {
    // The page says what went wrong; stay open so it can be tried again.
  } finally {
    busy = false
  }
}
</script>

<dialog
  bind:this={dialog}
  onclose={() => (open = false)}
  class="m-auto w-[calc(100vw-32px)] max-w-[440px] rounded-xl bg-canvas p-7 text-ink backdrop:bg-ink/40"
>
  <h2 class="font-display text-[22px] leading-7 font-medium">{title}</h2>
  <p class="mt-2 text-[15px] leading-[22px] text-muted">{body}</p>
  <div class="mt-6 flex flex-col items-center gap-2">
    <button
      type="button"
      disabled={busy}
      onclick={confirm}
      class="h-12 w-full rounded bg-crashed text-base font-semibold text-white disabled:opacity-70"
    >
      {busy ? busyLabel : action}
    </button>
    <button type="button" disabled={busy} onclick={() => (open = false)} class="px-4 py-2 text-[15px] font-medium">
      Cancel
    </button>
  </div>
</dialog>
