<script lang="ts">
import type { RequestDetail, RequestSummary } from '@dukoi/shared'
import { clearRequests, getRequestDetail, replayRequest } from '#lib/phone.remote.js'
import type { Problem } from '#lib/problem.js'
import { toast } from '#lib/toast.svelte.js'

let {
  appName,
  requests,
  problem,
  class: className = '',
}: {
  appName: string
  requests: RequestSummary[]
  problem: Problem | null
  class?: string
} = $props()

let selectedId = $state<string | null>(null)
let detail = $state<RequestDetail | null>(null)
let detailError = $state<string | null>(null)
let loadingDetail = $state(false)
let replaying = $state(false)
let clearing = $state(false)
let pane = $state<'request' | 'response'>('request')

// Newest first.
const ordered = $derived([...requests].reverse())

async function select(id: string) {
  selectedId = id
  detailError = null
  loadingDetail = true
  try {
    detail = await getRequestDetail({ name: appName, id })
  } catch (err) {
    detail = null
    const body = (err as { body?: { message?: string } }).body
    detailError = body?.message ?? 'Could not load that request.'
  } finally {
    loadingDetail = false
  }
}

async function replay() {
  if (!selectedId || replaying) return
  replaying = true
  toast.show(`Replaying ${selectedId}`)
  try {
    const { request } = await replayRequest({ name: appName, id: selectedId })
    selectedId = request.id
    detail = request
    detailError = null
    pane = 'response'
    toast.show(`Replayed as ${request.id} (${request.status}, ${request.durationMs}ms)`)
  } catch (err) {
    const body = (err as { body?: { message?: string } }).body
    toast.show(body?.message ?? 'Replay failed.', true)
  } finally {
    replaying = false
  }
}

async function clear() {
  if (clearing) return
  clearing = true
  try {
    await clearRequests(appName)
    selectedId = null
    detail = null
    detailError = null
    toast.show('Cleared requests')
  } catch (err) {
    const body = (err as { body?: { message?: string } }).body
    toast.show(body?.message ?? 'Could not clear requests.', true)
  } finally {
    clearing = false
  }
}

function statusClass(status: number): string {
  if (status === 0 || status >= 500) return 'text-log-error'
  if (status >= 400) return 'text-restarting'
  if (status >= 300) return 'text-log-note'
  return 'text-log-live'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function prettyBody(body: string | null, contentType: string | undefined): string {
  if (!body) return ''
  const trimmed = body.trim()
  const looksJson =
    (contentType?.toLowerCase().includes('json') ?? false) ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  if (!looksJson) return body
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return body
  }
}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3 {className}">
	{#if problem}
		<p class="font-mono text-xs text-log-error">{problem.message} Trying again.</p>
	{/if}

	<div class="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
		<!-- Request list -->
		<div class="flex min-h-0 flex-col gap-1 overflow-y-auto md:w-[44%] md:shrink-0 {selectedId ? 'hidden md:flex' : 'flex-1'}">
			{#if ordered.length > 0}
				<div class="mb-1 flex items-center justify-between text-xs text-log-time">
					<span>Last {ordered.length} in memory</span>
					<button
						type="button"
						disabled={clearing}
						onclick={clear}
						class="text-log-note hover:underline disabled:opacity-50"
					>
						Clear
					</button>
				</div>
			{/if}

			{#each ordered as req (req.id)}
				<button
					type="button"
					onclick={() => select(req.id)}
					class="flex items-center gap-2.5 px-2.5 py-2 text-left font-mono text-xs transition-colors {selectedId === req.id
						? 'bg-white/10 text-white'
						: 'text-log-text hover:bg-white/5'}"
				>
					<span class="w-10 shrink-0 font-semibold {statusClass(req.status)}">
						{req.status || 'ERR'}
					</span>
					<span class="w-11 shrink-0 text-log-note">{req.method}</span>
					<span class="min-w-0 flex-1 truncate">{req.path}</span>
					{#if req.replayedFrom}
						<span class="shrink-0 text-[11px] text-log-time" title="Replayed from {req.replayedFrom}">↻</span>
					{/if}
					<span class="w-12 shrink-0 text-right text-log-time">{req.durationMs}ms</span>
				</button>
			{:else}
				<div class="flex flex-1 flex-col justify-center gap-1 text-sm text-log-time">
					<p class="text-log-text">No requests yet.</p>
					<p class="text-xs">Send a request to this app and it will show up here.</p>
				</div>
			{/each}
		</div>

		<!-- Request detail -->
		<div class="flex min-h-0 min-w-0 flex-1 flex-col border-white/10 md:border-l md:pl-4 {selectedId ? 'flex' : 'hidden md:flex'}">
			{#if !selectedId}
				<div class="flex flex-1 items-center justify-center text-xs text-log-time">
					Pick a request to see its headers, body and replay it.
				</div>
			{:else if loadingDetail && !detail}
				<div class="flex flex-1 items-center justify-center text-xs text-log-time">
					Loading {selectedId}…
				</div>
			{:else if detailError}
				<div class="flex flex-1 flex-col items-start justify-center gap-2 text-xs text-log-error">
					<p>{detailError}</p>
					<button type="button" onclick={() => (selectedId = null)} class="text-log-note md:hidden">
						← Back to list
					</button>
				</div>
			{:else if detail}
				<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
					<div class="flex min-w-0 flex-col gap-0.5">
						<div class="flex items-center gap-2 font-mono text-xs">
							<button
								type="button"
								onclick={() => (selectedId = null)}
								class="text-log-note md:hidden"
							>
								←
							</button>
							<span class="font-semibold {statusClass(detail.status)}">{detail.status || 'ERR'}</span>
							<span class="text-log-note">{detail.method}</span>
							<span class="truncate text-white">{detail.path}</span>
						</div>
						<span class="font-mono text-[11px] text-log-time">
							{detail.id} · {detail.at.slice(11, 19)} · {detail.durationMs}ms{detail.from ? ` · ${detail.from}` : ''}{detail.replayedFrom ? ` · replayed ${detail.replayedFrom}` : ''}
						</span>
					</div>
					<button
						type="button"
						disabled={replaying || detail.reqTruncated}
						onclick={replay}
						title={detail.reqTruncated ? 'Body exceeded 64 KB cap and cannot be replayed' : 'Send this request to the app again'}
						class="h-8 shrink-0 rounded bg-violet px-3 text-xs font-semibold text-white disabled:opacity-40"
					>
						{replaying ? 'Replaying…' : 'Replay'}
					</button>
				</div>

				<div class="mt-3 flex gap-4 border-b border-white/10 pb-2 text-xs font-medium">
					<button
						type="button"
						onclick={() => (pane = 'request')}
						class="{pane === 'request' ? 'text-white' : 'text-log-time hover:text-log-text'}"
					>
						Request ({formatBytes(detail.reqBytes)})
					</button>
					<button
						type="button"
						onclick={() => (pane = 'response')}
						class="{pane === 'response' ? 'text-white' : 'text-log-time hover:text-log-text'}"
					>
						Response ({formatBytes(detail.resBytes)})
					</button>
				</div>

				{@const headers = pane === 'request' ? detail.reqHeaders : detail.resHeaders}
				{@const body = pane === 'request' ? detail.reqBody : detail.resBody}
				{@const binary = pane === 'request' ? detail.reqBinary : detail.resBinary}
				{@const bytes = pane === 'request' ? detail.reqBytes : detail.resBytes}
				{@const truncated = pane === 'request' ? detail.reqTruncated : detail.resTruncated}

				<div class="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto font-mono text-xs">
					<div>
						<p class="mb-1.5 text-[11px] tracking-wide text-log-time uppercase">Headers</p>
						<div class="flex flex-col gap-1">
							{#each Object.entries(headers) as [k, v] (k)}
								<div class="flex gap-2 break-all">
									<span class="shrink-0 text-log-time">{k}:</span>
									<span class={v === '[redacted]' ? 'text-restarting' : 'text-log-text'}>{v}</span>
								</div>
							{:else}
								<p class="text-log-time">(none)</p>
							{/each}
						</div>
					</div>

					<div>
						<p class="mb-1.5 text-[11px] tracking-wide text-log-time uppercase">
							Body{truncated ? ' (first 64 KB shown)' : ''}
						</p>
						{#if bytes === 0}
							<p class="text-log-time">(empty)</p>
						{:else if binary || body === null}
							<p class="text-log-time">Binary body ({formatBytes(bytes)})</p>
						{:else}
							<pre class="overflow-x-auto whitespace-pre-wrap break-words text-log-text">{prettyBody(body, headers['content-type'])}</pre>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
