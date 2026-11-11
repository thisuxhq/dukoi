// Runs after `vite build`. Gives every page a Markdown twin for AI agents
// (/docs/deploy.html → /docs/deploy.md), then writes llms.txt and
// llms-full.txt (https://llmstxt.org). The Markdown comes from the built HTML,
// so it can't drift from the pages.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import TurndownService from 'turndown'
import { href, markdownPath as mdPath, sections } from '../src/lib/docs.ts'
import { REPO } from '../src/lib/links.ts'

const BUILD = join(import.meta.dirname, '..', 'build')

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
turndown.remove(['button', 'nav', 'script', 'style'])

// A command and what it prints, as one shell block.
turndown.addRule('terminal', {
  filter: (node) => node.hasAttribute('data-terminal'),
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const output = el.querySelector('pre')?.textContent?.trim()
    const command = `$ ${el.getAttribute('data-terminal')}`
    return `\n\n\`\`\`sh\n${output ? `${command}\n${output}` : command}\n\`\`\`\n\n`
  },
})

turndown.addRule('pre', {
  filter: (node) => node.nodeName === 'PRE' && node.firstChild?.nodeName !== 'CODE',
  replacement: (_content, node) => `\n\n\`\`\`\n${node.textContent?.trim()}\n\`\`\`\n\n`,
})

// Notes become blockquotes.
turndown.addRule('aside', {
  filter: 'aside',
  replacement: (content) => `\n\n${content.trim().replace(/^/gm, '> ')}\n\n`,
})

// Label and value rows become "- **Label**: value".
turndown.addRule('dl', {
  filter: 'dl',
  replacement: (_content, node) => {
    const rows = Array.from((node as HTMLElement).querySelectorAll('dl > div')).map((row) => {
      const [dt, ...dds] = Array.from(row.children)
      // Commands and flags are monospace labels: show them as code.
      const label = dt?.classList.contains('font-mono')
        ? `\`${dt.textContent?.trim()}\``
        : `**${dt?.textContent?.trim()}**`
      return `- ${label}: ${dds.map((dd) => turndown.turndown(dd.innerHTML).trim()).join(', ')}`
    })
    return `\n\n${rows.join('\n')}\n\n`
  },
})

turndown.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = Array.from((node as HTMLElement).querySelectorAll('tr')).map((tr) =>
      Array.from(tr.children).map((cell) => cell.textContent?.trim() ?? ''),
    )
    const [head = [], ...body] = rows
    const line = (cells: string[]) => `| ${cells.join(' | ')} |`
    return `\n\n${[line(head), line(head.map(() => '---')), ...body.map(line)].join('\n')}\n\n`
  },
})

// Internal links point at the Markdown pages too.
turndown.addRule('link', {
  filter: (node) => node.nodeName === 'A' && Boolean(node.getAttribute('href')),
  replacement: (content, node) => {
    const target = (node as HTMLElement).getAttribute('href') as string
    return `[${content.trim()}](${target.startsWith('/') ? mdPath(target) : target})`
  },
})

// Added last, because Turndown checks the newest rule first.
// Decoration, screen-reader-only text, page controls and mobile-only copies of desktop links.
turndown.addRule('skip', {
  filter: (node) =>
    node.nodeName === 'IMG' ||
    node.getAttribute('aria-hidden') === 'true' ||
    node.hasAttribute('data-md-skip') ||
    node.classList.contains('sr-only') ||
    node.classList.contains('lg:hidden'),
  replacement: () => '',
})

/** The page's own content: the article on docs pages, <main> elsewhere. */
function toMarkdown(html: string): string {
  const body =
    html.match(/<article[^>]*>([\s\S]*)<\/article>/)?.[1] ??
    html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1]
  if (!body) throw new Error('No <article> or <main> to convert')
  return `${turndown.turndown(body).trim()}\n`
}

const htmlFiles = readdirSync(BUILD, { recursive: true, encoding: 'utf8' }).filter((f) =>
  f.endsWith('.html'),
)
const pages = new Map<string, string>()
for (const file of htmlFiles) {
  const path =
    `/${relative(BUILD, join(BUILD, file)).replace(/(index)?\.html$/, '')}`.replace(/\/$/, '') ||
    '/'
  const markdown = toMarkdown(readFileSync(join(BUILD, file), 'utf8'))
  writeFileSync(join(BUILD, mdPath(path)), markdown)
  pages.set(path, markdown)
}

/** The sentence under a page's title. */
const lead = (markdown: string) => markdown.split('\n\n')[1]?.trim() ?? ''

const docs = sections.flatMap((s) =>
  s.pages.map((p) => ({ section: s.title, ...p, path: href(p) })),
)
const home = pages.get('/') ?? ''

writeFileSync(
  join(BUILD, 'llms.txt'),
  [
    '# Dukoi',
    '',
    '> Deploy real apps to an old Android phone and get a live URL. No root, no Termux, no cloud bill.',
    '',
    'Install the Dukoi app on the phone, run `npx dukoi pair` on a computer on the same Wi-Fi, then `npx dukoi deploy` in an app folder. Every command takes `--json` for output an agent can parse. Every page below is Markdown; llms-full.txt has them all in one file.',
    '',
    ...sections.flatMap((s) => [
      `## ${s.title}`,
      '',
      ...docs
        .filter((d) => d.section === s.title)
        .map((d) => `- [${d.title}](${mdPath(d.path)}): ${lead(pages.get(d.path) ?? '')}`),
      '',
    ]),
    '## Optional',
    '',
    `- [Home](/index.md): ${lead(home) || 'What Dukoi is'}`,
    `- [Source code](${REPO}): the phone app, agent, CLI and dashboard`,
    '',
  ].join('\n'),
)

writeFileSync(
  join(BUILD, 'llms-full.txt'),
  `# Dukoi docs\n\n${docs.map((d) => pages.get(d.path) ?? '').join('\n---\n\n')}`,
)

console.log(`Wrote ${pages.size} Markdown pages, llms.txt and llms-full.txt`)
