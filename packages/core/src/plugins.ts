import type { Selection, Transaction } from './transaction'

export interface Representation<Output> {
  readonly id: string
  readonly project: (source: string) => Output
}

export interface FormattingPlugin<Input = void> {
  readonly id: string
  readonly apply: (source: string, selection: Selection, input: Input) => Transaction | undefined
}
