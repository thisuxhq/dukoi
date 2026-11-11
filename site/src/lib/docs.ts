// The user guide's pages, in sidebar order. The pager follows this order too.
export interface DocPage {
  slug: string
  title: string
}

export const sections: { title: string; pages: DocPage[] }[] = [
  {
    title: 'Get started',
    pages: [
      { slug: '', title: 'Quick start' },
      { slug: 'phone-setup', title: 'Set up the phone' },
      { slug: 'pairing', title: 'Pair a computer' },
    ],
  },
  {
    title: 'Deploy',
    pages: [
      { slug: 'deploy', title: 'Deploy an app' },
      { slug: 'public-urls', title: 'Public URLs' },
      { slug: 'custom-domains', title: 'Custom domains' },
      { slug: 'releases', title: 'Releases and rollback' },
    ],
  },
  {
    title: 'Run',
    pages: [
      { slug: 'logs', title: 'Logs' },
      { slug: 'dashboard', title: 'Dashboard' },
      { slug: 'battery-care', title: 'Battery care' },
    ],
  },
  {
    title: 'Reference',
    pages: [
      { slug: 'cli', title: 'CLI commands' },
      { slug: 'troubleshooting', title: 'Troubleshooting' },
    ],
  },
]

export const pages = sections.flatMap((s) => s.pages)

export const href = (page: DocPage) => (page.slug ? `/docs/${page.slug}` : '/docs')

/** The page at a path like /docs/deploy, or undefined. */
export function pageAt(pathname: string): DocPage | undefined {
  const slug = pathname.replace(/^\/docs\/?/, '').replace(/\/$/, '')
  return pages.find((p) => p.slug === slug)
}
