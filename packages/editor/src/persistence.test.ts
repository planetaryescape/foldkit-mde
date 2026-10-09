import { expect, test } from 'bun:test'

import * as Core from '@foldkit-mde/core'
import { Failure } from '@foldkit-mde/persistence/store'
import { Option } from 'effect'

import { make, Message, Model, project, Startup } from './persistence'

const key = { namespace: 'contract', documentId: 'one' }

const integration = make({
  key,
  seed: 'Seed only if missing',
  policy: { quietMs: 500, maximumMs: 2000 },
})

const markdown = { id: 'markdown', project: (source: string) => source }

test('packaged persistence distinguishes missing, empty and unavailable; output follows accepted core edits', () => {
  const missing = integration.init(
    Startup.cases.Loaded.make({ key, document: Option.none(), sessionId: 'missing' }),
  ).model

  expect(Option.getOrThrow(project(missing, markdown)).content).toBe('Seed only if missing')

  const opened = integration.init(
    Startup.cases.Loaded.make({
      key,
      document: Option.some({ key, source: '', revision: 3, lastWriteId: 'empty' }),
      sessionId: 'empty',
    }),
  ).model

  expect(Option.getOrThrow(project(opened, markdown)).content).toBe('')

  const edited = integration.update(
    opened,
    Message.cases.Editor.make({
      message: Core.Message.cases.UpdatedSource.make({
        source: '**new**\n::music{id="keep"}\n',
        selection: { start: 2, end: 5 },
      }),
    }),
  ).model

  expect(Option.getOrThrow(project(edited, markdown))).toEqual({
    key,
    localRevision: 1,
    representationId: 'markdown',
    content: '**new**\n::music{id="keep"}\n',
  })

  const mode = integration.update(
    edited,
    Message.cases.Editor.make({
      message: Core.Message.cases.ChangedMode.make({ mode: 'Markdown' }),
    }),
  ).model

  expect(Option.getOrThrow(project(mode, markdown)).localRevision).toBe(1)

  const undone = integration.update(
    mode,
    Message.cases.Editor.make({ message: Core.Message.cases.Undo.make({}) }),
  ).model

  expect(Option.getOrThrow(project(undone, markdown)).content).toBe('')
  expect(Option.getOrThrow(project(undone, markdown)).localRevision).toBe(2)

  if (!Model.guards.Editing(undone)) throw new Error('Expected editing model')
  expect(undone.saving.phase._tag).toBe('Dirty')
  expect(Option.getOrThrow(undone.saving.head)).toBe(3)

  const failed = integration.init(
    Startup.cases.LoadFailed.make({
      key,
      failure: Failure.cases.StorageUnavailable.make({ reason: 'Denied' }),
    }),
  ).model

  expect(Option.isNone(project(failed, markdown))).toBe(true)
  expect(
    integration.update(
      failed,
      Message.cases.Editor.make({
        message: Core.Message.cases.UpdatedSource.make({
          source: 'overwrite',
          selection: { start: 0, end: 0 },
        }),
      }),
    ).model,
  ).toEqual(failed)
})
