import { parse } from '@foldkit-mde/core'
import type { Representation } from '@foldkit-mde/core/plugins'
import { Schema } from 'effect'

const Span = Schema.Struct({ start: Schema.Int, end: Schema.Int })

const Children = Schema.Array(
  Schema.Struct({
    text: Schema.String,
    bold: Schema.Boolean,
    italic: Schema.Boolean,
    underline: Schema.Boolean,
    href: Schema.optionalKey(Schema.String),
  }),
)

const Node = Schema.TaggedUnion({
  Paragraph: {
    span: Span,
    children: Children,
  },
  Heading: {
    span: Span,
    level: Schema.Literals([1, 2, 3, 4, 5, 6]),
    children: Children,
  },
  Raw: { span: Span, source: Schema.String },
})

export const JsonDocument = Schema.Struct({
  version: Schema.Literal(3),
  source: Schema.String,
  nodes: Schema.Array(Node),
})

export type JsonDocument = typeof JsonDocument.Type

export const json: Representation<JsonDocument> = {
  id: 'json',
  project: (source) => ({
    version: 3,
    source,
    nodes: parse(source).map((block) => {
      const span = { start: block.start, end: block.end }

      if (!block.editable) return Node.cases.Raw.make({ span, source: block.source })

      const children = block.inlines.map((inline) => {
        const child = {
          text: inline.text,
          bold: inline.bold,
          italic: inline.italic,
          underline: inline.underline,
        }

        return inline.href === undefined ? child : { ...child, href: inline.href }
      })

      return block.heading
        ? Node.cases.Heading.make({ span, level: block.heading.level, children })
        : Node.cases.Paragraph.make({ span, children })
    }),
  }),
}
