import type { Selection, Transaction } from './bold'

export interface Representation<Output> {
  readonly id: string
  readonly project: (source: string) => Output
}

export interface FormattingPlugin {
  readonly id: string
  readonly apply: (source: string, selection: Selection) => Transaction | undefined
}
