export async function ddmin<T>(items: T[], pred: (subset: T[]) => Promise<boolean>): Promise<T[]> {
  if (items.length <= 1) {
    return items
  }
  if (!(await pred(items))) {
    return items
  }

  let work = items
  let n = 2
  while (work.length >= 2) {
    const subsets = split(work, n)
    let reduced = false
    for (const subset of subsets) {
      if (subset.length > 0 && (await pred(subset))) {
        work = subset
        n = 2
        reduced = true
        break
      }
    }
    if (reduced) {
      continue
    }
    for (let i = 0; i < subsets.length; i += 1) {
      const complement = work.filter((_, index) => {
        const start = offsetOf(subsets, i)
        return index < start || index >= start + (subsets[i]?.length ?? 0)
      })
      if (complement.length < work.length && complement.length > 0 && (await pred(complement))) {
        work = complement
        n = Math.max(n - 1, 2)
        reduced = true
        break
      }
    }
    if (reduced) {
      continue
    }
    if (n >= work.length) {
      break
    }
    n = Math.min(work.length, n * 2)
  }
  return work
}

function split<T>(items: T[], n: number): T[][] {
  const size = Math.max(1, Math.floor(items.length / n))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

function offsetOf<T>(subsets: T[][], index: number): number {
  let offset = 0
  for (let i = 0; i < index; i += 1) {
    offset += subsets[i]?.length ?? 0
  }
  return offset
}

export function cheapCuts<T>(items: T[]): T[][] {
  const cuts: T[][] = []
  if (items.length > 32) {
    cuts.push(items.slice(-32))
  }
  if (items.length > 8) {
    cuts.push(items.slice(-8))
  }
  return cuts
}
