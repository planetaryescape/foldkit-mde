import { Message as CoreMessage, type Model } from '@foldkit-mde/core'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Formatted, type Message, update, type FormattingTool } from './formatting'
import { inputView } from './formatting-input'
import { observe } from './surface'

export { Synchronize } from './surface'

export { Message, Formatted, type FormattingTool } from './formatting'

export { Model } from '@foldkit-mde/core'

export const make = (tools: ReadonlyArray<FormattingTool> = []) => {
  const Observe = observe(tools)
  const inputs = tools.flatMap((tool) => (tool.kind === 'Input' ? [inputView(tool)] : []))

  const view = (model: Model, h: HtmlBuilder<Message>): Html => {
    const formatButton = (tool: Extract<FormattingTool, { kind: 'Button' }>) =>
      h.button(
        [
          h.Type('button'),
          h.AriaLabel(tool.label),
          h.Title(
            tool.shortcut ? `${tool.label} (Ctrl/⌘+${tool.shortcut.toUpperCase()})` : tool.label,
          ),
          h.Disabled(tool.plugin.apply(model.source, model.selection) === undefined),
          ...(tool.group
            ? [
                h.Popovertarget(`mde-group-${encodeURIComponent(tool.group)}`),
                h.Popovertargetaction('hide'),
              ]
            : []),
          h.OnClick(
            Formatted.make({
              id: tool.plugin.id,
              input: '',
              source: model.source,
              selection: model.selection,
            }),
          ),
        ],
        [tool.shortLabel ?? tool.label],
      )

    return h.section(
      [h.Class('mde'), h.AriaLabel('Markdown editor')],
      [
        h.div(
          [h.Class('mde-toolbar')],
          [
            h.div(
              [h.Class('mde-modes'), h.AriaLabel('Editing mode')],
              [
                ...['Visual', 'Markdown'].map((mode) =>
                  h.button(
                    [
                      h.Type('button'),
                      h.Class(model.mode === mode ? 'is-active' : ''),
                      h.AriaPressed(String(model.mode === mode)),
                      h.OnClick(
                        CoreMessage.cases.ChangedMode.make({
                          mode: mode === 'Visual' ? 'Visual' : 'Markdown',
                        }),
                      ),
                    ],
                    [mode],
                  ),
                ),
                h.span(
                  [h.Class('mde-mode-shortcut'), h.Title('Switch between Visual and Markdown')],
                  ['Ctrl/⌘+Shift+M'],
                ),
              ],
            ),
            h.div(
              [h.Class('mde-actions')],
              [
                ...tools.flatMap((tool, index) => {
                  if (tool.kind === 'Input')
                    return [
                      h.span([h.Class('mde-toolbar-divider'), h.AriaHidden(true)], []),
                      h.button(
                        [h.Type('button'), h.Popovertarget(`mde-input-${tool.plugin.id}`)],
                        [tool.triggerLabel ?? tool.inputLabel],
                      ),
                    ]

                  if (!tool.group) return [formatButton(tool)]

                  const group = tool.group

                  if (
                    tools
                      .slice(0, index)
                      .some((item) => item.kind === 'Button' && item.group === group)
                  )
                    return []

                  const id = `mde-group-${encodeURIComponent(group)}`

                  return [
                    h.button(
                      [h.Type('button'), h.Class('mde-group-trigger'), h.Popovertarget(id)],
                      [group, h.span([h.Class('mde-chevron'), h.AriaHidden(true)], [])],
                    ),
                    h.div(
                      [h.Id(id), h.Popover('auto'), h.Class('mde-format-menu'), h.AriaLabel(group)],
                      tools.flatMap((item) =>
                        item.kind === 'Button' && item.group === group ? [formatButton(item)] : [],
                      ),
                    ),
                    h.span([h.Class('mde-toolbar-divider'), h.AriaHidden(true)], []),
                  ]
                }),
                h.span([h.Class('mde-toolbar-divider'), h.AriaHidden(true)], []),
                h.button(
                  [
                    h.Type('button'),
                    h.AriaLabel('Undo'),
                    h.Title('Undo (Ctrl/⌘+Z)'),
                    h.Class('mde-history-tool'),
                    h.Disabled(model.past.length === 0),
                    h.OnClick(CoreMessage.cases.Undo.make({})),
                  ],
                  ['↶'],
                ),
                h.button(
                  [
                    h.Type('button'),
                    h.AriaLabel('Redo'),
                    h.Title('Redo (Ctrl/⌘+Shift+Z)'),
                    h.Class('mde-history-tool'),
                    h.Disabled(model.future.length === 0),
                    h.OnClick(CoreMessage.cases.Redo.make({})),
                  ],
                  ['↷'],
                ),
              ],
            ),
          ],
        ),
        ...inputs.map((input) => input(model.source, model.selection, h)),
        h.div(
          [h.Class('mde-canvas')],
          [
            h.div(
              [
                h.Id('mde-surface'),
                h.OnMount(
                  Observe({ source: model.source, mode: model.mode, selection: model.selection }),
                ),
              ],
              [],
            ),
          ],
        ),
        h.div(
          [h.Class('mde-status')],
          [
            h.span([], [model.mode === 'Visual' ? 'Visual editing' : 'Markdown source']),
            h.span([], [`${model.source.length.toLocaleString()} characters`]),
          ],
        ),
      ],
    )
  }

  return { view, update: (model: Model, message: Message) => update(tools, model, message) }
}
