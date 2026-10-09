import { expect, test } from 'bun:test'

import { Option } from 'effect'

import { Event, Intent, startSession, transition } from './autosave'
import { Failure } from './store'

const key = { namespace: 'test', documentId: 'one' }

test('a late receipt cannot mark newer source saved; only latest pending source is written', () => {
  let state = startSession(key, 'session', Option.none()).state
  let next = transition(state, Event.cases.Flush.make({ id: 'first' }), 'A')
  state = next.state
  const first = next.intents.find(Intent.guards.Save)

  if (!first) throw new Error('Expected save')
  state = transition(state, Event.cases.SourceChanged.make({}), 'B').state
  state = transition(state, Event.cases.SourceChanged.make({}), 'C').state
  state = transition(
    state,
    Event.cases.QuietDue.make({ sessionId: 'session', generation: state.generation }),
    'C',
  ).state
  next = transition(
    state,
    Event.cases.Committed.make({
      sessionId: 'session',
      localRevision: first.flight.localRevision,
      receipt: { key, revision: 1, writeId: first.flight.request.writeId },
    }),
    'C',
  )
  expect(next.state.phase._tag).toBe('Saving')
  const latest = next.intents.find(Intent.guards.Save)

  if (!latest) throw new Error('Expected latest save')
  expect(latest.flight.request.source).toBe('C')
  expect(Option.getOrThrow(latest.flight.request.expectedRevision)).toBe(1)
  expect(next.outputs.map((output) => output._tag)).toEqual(['Flushed'])
  expect(
    transition(
      next.state,
      Event.cases.Committed.make({
        sessionId: 'session',
        localRevision: 0,
        receipt: { key, revision: 1, writeId: first.flight.request.writeId },
      }),
      'C',
    ).state,
  ).toEqual(next.state)
})

test('unknown commits reconcile the original write before newer edits, while aborted saves retry latest source', () => {
  for (const commitOutcome of ['Unknown', 'Aborted']) {
    const started = transition(
      startSession(key, 'retry', Option.none()).state,
      Event.cases.Flush.make({ id: 'flush' }),
      'first',
    )

    const save = started.intents.find(Intent.guards.Save)

    if (!save) throw new Error('Expected save')
    let state = transition(started.state, Event.cases.SourceChanged.make({}), 'newer').state

    const failed = transition(
      state,
      Event.cases.Failed.make({
        sessionId: 'retry',
        localRevision: 0,
        writeId: save.flight.request.writeId,
        failure: Failure.cases.StorageFailure.make({
          commitOutcome: commitOutcome === 'Unknown' ? 'Unknown' : 'Aborted',
        }),
      }),
      'newer',
    )

    expect(failed.outputs.map((output) => output._tag)).toEqual(['FlushFailed'])
    state = transition(failed.state, Event.cases.SourceChanged.make({}), 'latest').state
    const retried = transition(state, Event.cases.Retry.make({}), 'latest')
    const retry = retried.intents.find(Intent.guards.Save)

    if (!retry) throw new Error('Expected retry')
    expect(retry.flight.request.source).toBe(commitOutcome === 'Unknown' ? 'first' : 'latest')
    expect(retry.flight.localRevision).toBe(commitOutcome === 'Unknown' ? 0 : 2)

    if (commitOutcome === 'Unknown') {
      expect(retry.flight).toEqual(save.flight)

      const reconciled = transition(
        retried.state,
        Event.cases.Committed.make({
          sessionId: 'retry',
          localRevision: 0,
          receipt: { key, revision: 1, writeId: retry.flight.request.writeId },
        }),
        'latest',
      )

      expect(reconciled.intents.find(Intent.guards.Save)?.flight.request.source).toBe('latest')
      expect(reconciled.state.phase._tag).toBe('Saving')
    }
  }
})

test('stale timers and conflicts cannot write, and flush waits for its captured revision', () => {
  let state = startSession(
    key,
    'timers',
    Option.some({ key, source: '', revision: 7, lastWriteId: 'loaded' }),
  ).state

  state = transition(state, Event.cases.SourceChanged.make({}), 'A').state
  const firstGeneration = state.generation
  const window = Option.getOrThrow(state.window)
  state = transition(state, Event.cases.SourceChanged.make({}), 'B').state
  expect(
    transition(
      state,
      Event.cases.QuietDue.make({ sessionId: 'timers', generation: firstGeneration }),
      'B',
    ).intents,
  ).toEqual([])
  expect(
    transition(state, Event.cases.MaximumDue.make({ sessionId: 'old-session', window }), 'B')
      .intents,
  ).toEqual([])
  const due = transition(state, Event.cases.MaximumDue.make({ sessionId: 'timers', window }), 'B')
  const save = due.intents.find(Intent.guards.Save)

  if (!save) throw new Error('Expected maximum-wait save')
  expect(save.flight.request.source).toBe('B')
  state = transition(due.state, Event.cases.SourceChanged.make({}), 'C').state
  state = transition(state, Event.cases.Flush.make({ id: 'C' }), 'C').state
  expect(
    transition(state, Event.cases.Flush.make({ id: 'busy' }), 'C').outputs.map(
      (output) => output._tag,
    ),
  ).toEqual(['FlushBusy'])

  const committed = transition(
    state,
    Event.cases.Committed.make({
      sessionId: 'timers',
      localRevision: 2,
      receipt: { key, revision: 8, writeId: save.flight.request.writeId },
    }),
    'C',
  )

  expect(committed.outputs).toEqual([])
  const latest = committed.intents.find(Intent.guards.Save)

  if (!latest) throw new Error('Expected flush save')

  const conflicted = transition(
    committed.state,
    Event.cases.Failed.make({
      sessionId: 'timers',
      localRevision: 3,
      writeId: latest.flight.request.writeId,
      failure: Failure.cases.Conflict.make({ expected: Option.some(8), actual: Option.some(9) }),
    }),
    'C',
  )

  expect(conflicted.outputs.map((output) => output._tag)).toEqual(['FlushFailed'])
  expect(transition(conflicted.state, Event.cases.Retry.make({}), 'C').intents).toEqual([])
  expect(transition(conflicted.state, Event.cases.SourceChanged.make({}), 'D').intents).toEqual([])
})
