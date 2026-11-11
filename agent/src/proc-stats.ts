// CPU and memory per process, read from /proc (Linux and Android).
// Returns nulls where /proc doesn't exist, like on a Mac in tests.
import { readFileSync } from 'node:fs'

const CLOCK_TICKS = 100 // USER_HZ on Linux and Android
const PAGE_KB = 4

export interface Usage {
  cpuPercent: number | null
  memoryMb: number | null
}

interface Sample {
  ticks: number
  at: number
}

export class ProcStats {
  private last = new Map<number, Sample>()

  /** Call every few seconds; CPU % is measured between calls. */
  sample(pid: number | null): Usage {
    if (!pid) return { cpuPercent: null, memoryMb: null }
    let stat: string
    let statm: string
    try {
      stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
      statm = readFileSync(`/proc/${pid}/statm`, 'utf8')
    } catch {
      return { cpuPercent: null, memoryMb: null }
    }
    // Fields after the ")" that ends the process name; utime and stime are
    // fields 14 and 15 of the whole line.
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const ticks = Number(after[11]) + Number(after[12])
    const rssPages = Number(statm.split(' ')[1])
    const now = Date.now()
    const prev = this.last.get(pid)
    this.last.set(pid, { ticks, at: now })

    let cpuPercent: number | null = null
    if (prev && now > prev.at) {
      const usedSeconds = (ticks - prev.ticks) / CLOCK_TICKS
      cpuPercent = Math.max(0, Math.round((usedSeconds / ((now - prev.at) / 1000)) * 100))
    }
    return { cpuPercent, memoryMb: Math.round((rssPages * PAGE_KB) / 1024) }
  }

  forget(pid: number): void {
    this.last.delete(pid)
  }
}
