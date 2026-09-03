import seedrandom from 'seedrandom'

export class SeededRng {
  readonly seed: number
  step = 0
  private readonly nextFloat: () => number

  constructor(seed: number) {
    this.seed = seed
    this.nextFloat = seedrandom(String(seed))
  }

  next(): number {
    this.step += 1
    return this.nextFloat()
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      return 0
    }
    return Math.floor(this.next() * maxExclusive)
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('SeededRng.pick called with an empty list')
    }
    const item = items[this.int(items.length)]
    if (item === undefined) {
      throw new Error('SeededRng.pick missed an index')
    }
    return item
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647)
}
