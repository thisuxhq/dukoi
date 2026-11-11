// Finds DroidHost phones on the Wi-Fi with mDNS (_droidhost._tcp).

import { MDNS_SERVICE } from '@droidhost/shared'
import mdns from 'multicast-dns'

export interface Found {
  name: string
  host: string
  port: number
}

export async function discover(timeoutMs = 3000): Promise<Found[]> {
  const m = mdns()
  const found = new Map<string, Found>()

  m.on('response', (res, rinfo) => {
    // Record types vary by kind; read just the fields we need.
    const records = [...res.answers, ...res.additionals] as {
      type: string
      name: string
      data?: unknown
    }[]
    const ptrs = records.filter((r) => r.type === 'PTR' && r.name === MDNS_SERVICE)
    for (const ptr of ptrs) {
      const instance = String(ptr.data)
      const srv = records.find((r) => r.type === 'SRV' && r.name === instance)
      const port = Number((srv?.data as { port?: number } | undefined)?.port ?? 7070)
      // The address the answer came from is the phone's Wi-Fi address.
      found.set(rinfo.address, {
        name: instance.replace(`.${MDNS_SERVICE}`, ''),
        host: rinfo.address,
        port,
      })
    }
  })

  const ask = () => m.query({ questions: [{ name: MDNS_SERVICE, type: 'PTR' }] })
  ask()
  const again = setInterval(ask, 800)
  await new Promise((r) => setTimeout(r, timeoutMs))
  clearInterval(again)
  m.destroy()
  return [...found.values()]
}
