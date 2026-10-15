import { Schema } from 'effect'

export const Selection = Schema.Struct({ start: Schema.Int, end: Schema.Int })

export type Selection = typeof Selection.Type

export const Transaction = Schema.Struct({
  start: Schema.Int,
  end: Schema.Int,
  text: Schema.String,
  selection: Selection,
})

export type Transaction = typeof Transaction.Type
