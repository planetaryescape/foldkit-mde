import { parse } from '@foldkit-mde/core'
import type { Representation } from '@foldkit-mde/core/plugins'
import { Schema } from 'effect'

const Span = Schema.Struct({ start: Schema.Int, end: Schema.Int })

const Node = Schema.TaggedUnion({
  Paragraph: {
    span: Span,
    children: Schema.Array(Schema.Struct({ text: Schema.String, bold: Schema.Boolean })),
  },
  Raw: { span: Span, source: Schema.String },
})

export const JsonDocument = Schema.Struct({
  version: Schema.Literal(1),
  source: Schema.String,
  nodes: Schema.Array(Node),
})

export type JsonDocument = typeof JsonDocument.Type

export const json: Representation<JsonDocument> = {
  id: 'json',
  project: (source) => ({
    version: 1,
    source,
    nodes: parse(source).map((block) =>
      block.editable
        ? Node.cases.Paragraph.make({
            span: { start: block.start, end: block.end },
            children: block.inlines.map((inline) => ({ text: inline.text, bold: inline.bold })),
          })
        : Node.cases.Raw.make({
            span: { start: block.start, end: block.end },
            source: block.source,
          }),
    ),
  }),
}
