import type { Message as EditorMessage, Model as EditorModel } from '@foldkit-mde/core'
import { Event } from '@foldkit-mde/persistence/autosave'
import { Failure } from '@foldkit-mde/persistence/store'
import { Match, Predicate } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'

import { Message, Model, Recovery } from './persistence-model'
import { view as editorView } from './view'

const child = defineView<EditorModel, EditorMessage>(editorView)

const failureText = (failure: Failure) =>
  Failure.match(failure, {
    InvalidSave: ({ reason }) =>
      reason === 'TooLarge'
        ? 'This document exceeds the local save limit. Export your Markdown.'
        : 'This document could not be saved. Export your Markdown.',
    InvalidStoredDocument: () => 'The saved document is damaged or does not match this document.',
    UnsupportedVersion: () => 'This document was saved by a newer format. It has not been changed.',
    Conflict: () =>
      'Another editor saved this document. Your edits are still here. Export before reloading.',
    QuotaExceeded: () =>
      'Browser storage is full. Your edits are still here. Export your Markdown.',
    StorageUnavailable: () =>
      'Browser storage is unavailable. No saved document has been overwritten.',
    StorageFailure: ({ commitOutcome }) =>
      commitOutcome === 'Unknown'
        ? 'Save outcome unknown. Retry will check that exact save before saving newer edits.'
        : 'Saving failed. Your edits are still here. You can retry.',
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const button = (label: string, message: Message, disabled = false) =>
    h.button([h.Type('button'), h.Disabled(disabled), h.OnClick(message)], [label])

  return Model.match(model, {
    Editing: ({ editor, saving, retention }) => {
      const status = Match.value(saving.phase).pipe(
        Match.tagsExhaustive({
          Saved: () => 'Saved locally',
          Dirty: () => 'Unsaved changes',
          Saving: () => 'Saving locally…',
          Failed: () => 'Not saved',
          Conflict: () => 'Save conflict',
        }),
      )

      const failure = Match.value(saving.phase).pipe(
        Match.tagsExhaustive({
          Saved: () => '',
          Dirty: () => '',
          Saving: () => '',
          Failed: ({ failure }) => failureText(failure),
          Conflict: ({ failure }) => failureText(failure),
        }),
      )

      return h.section(
        [h.Class('mde-persistent')],
        [
          h.submodel({
            slotId: 'editor',
            view: child,
            model: editor,
            toParentMessage: (message) => Message.cases.Editor.make({ message }),
          }),
          h.div(
            [h.Class('mde-saving')],
            [
              h.span([h.Role('status'), h.AriaLive('polite')], [status]),
              h.div(
                [h.Class('mde-save-actions')],
                [
                  button(
                    'Save now',
                    Message.cases.Persistence.make({
                      message: Event.cases.Flush.make({
                        id: `${saving.sessionId}:manual:${saving.localRevision}`,
                      }),
                    }),
                    Predicate.isTagged(saving.phase, 'Conflict') ||
                      Predicate.isTagged(saving.phase, 'Failed'),
                  ),
                  ...(Predicate.isTagged(saving.phase, 'Failed')
                    ? [
                        button(
                          'Retry save',
                          Message.cases.Persistence.make({ message: Event.cases.Retry.make({}) }),
                        ),
                      ]
                    : []),
                  button('Export Markdown', Message.cases.ExportMarkdown.make({})),
                  button(
                    'Keep on this device',
                    Message.cases.RequestRetention.make({}),
                    retention === 'Persistent',
                  ),
                ],
              ),
            ],
          ),
          ...(failure ? [h.p([h.Class('mde-save-warning'), h.Role('alert')], [failure])] : []),
          h.p(
            [h.Class('mde-storage-note')],
            [
              Match.value(retention).pipe(
                Match.when(
                  'Persistent',
                  () =>
                    'Storage retention granted. Clearing browser data still removes local saves. Keep an exported copy.',
                ),
                Match.when(
                  'BestEffort',
                  () =>
                    'Storage retention was not granted. Browser clearing or eviction can remove saves. Keep an exported copy.',
                ),
                Match.when(
                  'Unavailable',
                  () =>
                    'Storage retention could not be requested. Local saves are not a backup. Keep an exported copy.',
                ),
                Match.when(
                  'Unknown',
                  () =>
                    'Local to this browser, not a backup. Browser clearing or eviction can remove saves. Export work you want to keep.',
                ),
                Match.exhaustive,
              ),
            ],
          ),
        ],
      )
    },
    LoadFailed: ({ loading, failure, recovery }) =>
      h.section(
        [h.Class('mde-load-error'), h.AriaLabel('Local document recovery')],
        [
          h.h2([], ['Your saved document could not be opened.']),
          h.p([h.Role('alert')], [failureText(failure)]),
          h.p([], ['Editing is paused so we do not replace a document we could not read.']),
          h.div(
            [h.Class('mde-save-actions')],
            [
              button(
                loading ? 'Loading…' : 'Retry opening',
                Message.cases.RetryLoad.make({}),
                loading,
              ),
              button(
                'Check previous checkpoint',
                Message.cases.RequestRecovery.make({}),
                loading || Recovery.guards.Loading(recovery),
              ),
            ],
          ),
          ...Recovery.match(recovery, {
            NotRequested: () => [],
            Loading: () => [h.p([h.Role('status')], ['Checking previous checkpoint…'])],
            Missing: () => [h.p([], ['No previous checkpoint is available.'])],
            Failed: ({ failure }) => [h.p([h.Role('alert')], [failureText(failure)])],
            Available: ({ document }) => [
              h.p(
                [],
                ['Previous checkpoint found. Export it without replacing the saved document.'],
              ),
              h.pre([h.Class('mde-recovery-source')], [document.source]),
              button('Export previous Markdown', Message.cases.ExportMarkdown.make({})),
            ],
          }),
        ],
      ),
  })
}
