import { Match, Option, Schema } from 'effect'

import { sameKey } from './checkpoints'
import {
  Counter,
  DocumentKey,
  Failure,
  type SavedDocument,
  SaveReceipt,
  SaveRequest,
} from './store'

export const Policy = Schema.Struct({
  quietMs: Counter.check(Schema.isGreaterThanOrEqualTo(1)),
  maximumMs: Counter.check(Schema.isGreaterThanOrEqualTo(1)),
}).check(Schema.makeFilter((policy) => policy.maximumMs >= policy.quietMs))

export type Policy = typeof Policy.Type

export const Flight = Schema.Struct({ request: SaveRequest, localRevision: Counter })

export type Flight = typeof Flight.Type

const Phase = Schema.TaggedUnion({
  Saved: {},
  Dirty: {},
  Saving: { flight: Flight, due: Schema.Boolean },
  Failed: { flight: Flight, failure: Failure },
  Conflict: { flight: Flight, failure: Failure },
})

export const Session = Schema.Struct({
  key: DocumentKey,
  sessionId: Schema.String,
  localRevision: Counter,
  acknowledged: Schema.Option(Counter),
  head: Schema.Option(Counter),
  lastReceipt: Schema.Option(SaveReceipt),
  generation: Counter,
  window: Schema.Option(Counter),
  flush: Schema.Option(Schema.Struct({ id: Schema.String, revision: Counter })),
  phase: Phase,
})

export type Session = typeof Session.Type

export const Event = Schema.TaggedUnion({
  SourceChanged: {},
  QuietDue: { sessionId: Schema.String, generation: Counter },
  MaximumDue: { sessionId: Schema.String, window: Counter },
  Committed: { sessionId: Schema.String, localRevision: Counter, receipt: SaveReceipt },
  Failed: {
    sessionId: Schema.String,
    localRevision: Counter,
    writeId: Schema.String,
    failure: Failure,
  },
  TimersCancelled: {},
  Retry: {},
  Flush: { id: Schema.String },
})

export type Event = typeof Event.Type

export const Intent = Schema.TaggedUnion({
  Quiet: { sessionId: Schema.String, generation: Counter },
  Maximum: { sessionId: Schema.String, window: Counter },
  CancelTimers: { sessionId: Schema.String },
  Save: { sessionId: Schema.String, flight: Flight },
})

export type Intent = typeof Intent.Type

export const FlushResult = Schema.TaggedUnion({
  Flushed: { id: Schema.String, receipt: SaveReceipt },
  FlushFailed: { id: Schema.String, failure: Failure },
  FlushBusy: { id: Schema.String },
})

export type FlushResult = typeof FlushResult.Type

export interface Transition {
  readonly state: Session
  readonly intents: ReadonlyArray<Intent>
  readonly outputs: ReadonlyArray<FlushResult>
}

const unchanged = (state: Session): Transition => ({ state, intents: [], outputs: [] })

const begin = (state: Session, source: string, retry?: Flight): Transition => {
  const flight = retry ?? {
    localRevision: state.localRevision,
    request: {
      key: state.key,
      source,
      expectedRevision: state.head,
      writeId: `${state.sessionId}:${state.localRevision}`,
    },
  }

  return {
    state: {
      ...state,
      window: Option.none(),
      phase: Phase.cases.Saving.make({ flight, due: false }),
    },
    intents: [
      Intent.cases.CancelTimers.make({ sessionId: state.sessionId }),
      Intent.cases.Save.make({ sessionId: state.sessionId, flight }),
    ],
    outputs: [],
  }
}

const schedule = (state: Session): Transition => {
  const generation = state.generation + 1
  const window = Option.getOrElse(state.window, () => generation)

  return {
    state: { ...state, generation, window: Option.some(window) },
    intents: [
      Intent.cases.Quiet.make({ sessionId: state.sessionId, generation }),
      ...(Option.isNone(state.window)
        ? [Intent.cases.Maximum.make({ sessionId: state.sessionId, window })]
        : []),
    ],
    outputs: [],
  }
}

export const startSession = (
  key: DocumentKey,
  sessionId: string,
  document: Option.Option<SavedDocument>,
): Transition => {
  const loaded = Option.getOrUndefined(document)

  const state: Session = {
    key,
    sessionId,
    localRevision: 0,
    acknowledged: loaded ? Option.some(0) : Option.none(),
    head: loaded ? Option.some(loaded.revision) : Option.none(),
    lastReceipt: loaded
      ? Option.some({ key, revision: loaded.revision, writeId: loaded.lastWriteId })
      : Option.none(),
    generation: 0,
    window: Option.none(),
    flush: Option.none(),
    phase: loaded ? Phase.cases.Saved.make({}) : Phase.cases.Dirty.make({}),
  }

  return loaded ? unchanged(state) : schedule(state)
}

const due = (state: Session, source: string): Transition =>
  Phase.match(state.phase, {
    Saved: () => unchanged(state),
    Dirty: () => begin(state, source),
    Saving: ({ flight }) => ({
      ...unchanged(state),
      state: { ...state, phase: Phase.cases.Saving.make({ flight, due: true }) },
    }),
    Failed: () => unchanged(state),
    Conflict: () => unchanged(state),
  })

export const transition = (state: Session, event: Event, source: string): Transition =>
  Match.value(event).pipe(
    Match.withReturnType<Transition>(),
    Match.tagsExhaustive({
      SourceChanged: () => {
        const next = { ...state, localRevision: state.localRevision + 1 }

        if (Phase.guards.Failed(state.phase) || Phase.guards.Conflict(state.phase))
          return unchanged(next)

        return schedule({
          ...next,
          phase: Phase.guards.Saving(state.phase) ? state.phase : Phase.cases.Dirty.make({}),
        })
      },
      QuietDue: (event) =>
        event.sessionId === state.sessionId &&
        event.generation === state.generation &&
        Option.isSome(state.window)
          ? due(state, source)
          : unchanged(state),
      MaximumDue: (event) =>
        event.sessionId === state.sessionId && Option.getOrUndefined(state.window) === event.window
          ? due(state, source)
          : unchanged(state),
      Committed: (event) => {
        if (!Phase.guards.Saving(state.phase)) return unchanged(state)
        const { flight } = state.phase

        if (
          event.sessionId !== state.sessionId ||
          event.localRevision !== flight.localRevision ||
          event.receipt.writeId !== flight.request.writeId ||
          !sameKey(event.receipt.key, state.key) ||
          event.receipt.revision !== Option.getOrElse(flight.request.expectedRevision, () => 0) + 1
        )
          return unchanged(state)
        const target = Option.getOrUndefined(state.flush)
        const flushed = target && event.localRevision >= target.revision

        const next = {
          ...state,
          acknowledged: Option.some(event.localRevision),
          head: Option.some(event.receipt.revision),
          lastReceipt: Option.some(event.receipt),
          flush: flushed ? Option.none<{ id: string; revision: number }>() : state.flush,
        }

        const result =
          event.localRevision === state.localRevision
            ? {
                state: { ...next, window: Option.none(), phase: Phase.cases.Saved.make({}) },
                intents: [Intent.cases.CancelTimers.make({ sessionId: state.sessionId })],
                outputs: [],
              }
            : state.phase.due || Option.isSome(next.flush) || Option.isNone(next.window)
              ? begin(next, source)
              : unchanged({ ...next, phase: Phase.cases.Dirty.make({}) })

        return {
          ...result,
          outputs: flushed
            ? [FlushResult.cases.Flushed.make({ id: target.id, receipt: event.receipt })]
            : [],
        }
      },
      Failed: (event) => {
        if (
          !Phase.guards.Saving(state.phase) ||
          event.sessionId !== state.sessionId ||
          event.localRevision !== state.phase.flight.localRevision ||
          event.writeId !== state.phase.flight.request.writeId
        )
          return unchanged(state)
        const target = Option.getOrUndefined(state.flush)

        return {
          state: {
            ...state,
            window: Option.none(),
            flush: Option.none(),
            phase: Failure.guards.Conflict(event.failure)
              ? Phase.cases.Conflict.make({ flight: state.phase.flight, failure: event.failure })
              : Phase.cases.Failed.make({ flight: state.phase.flight, failure: event.failure }),
          },
          intents: [Intent.cases.CancelTimers.make({ sessionId: state.sessionId })],
          outputs: target
            ? [FlushResult.cases.FlushFailed.make({ id: target.id, failure: event.failure })]
            : [],
        }
      },
      Retry: () => {
        if (!Phase.guards.Failed(state.phase)) return unchanged(state)

        const unknown =
          Failure.guards.StorageFailure(state.phase.failure) &&
          state.phase.failure.commitOutcome === 'Unknown'

        return begin(state, source, unknown ? state.phase.flight : undefined)
      },
      Flush: ({ id }) => {
        if (Option.isSome(state.flush))
          return { ...unchanged(state), outputs: [FlushResult.cases.FlushBusy.make({ id })] }

        if (Phase.guards.Saved(state.phase) && Option.isSome(state.lastReceipt))
          return {
            ...unchanged(state),
            outputs: [FlushResult.cases.Flushed.make({ id, receipt: state.lastReceipt.value })],
          }

        if (Phase.guards.Failed(state.phase) || Phase.guards.Conflict(state.phase))
          return {
            ...unchanged(state),
            outputs: [FlushResult.cases.FlushFailed.make({ id, failure: state.phase.failure })],
          }

        return due({ ...state, flush: Option.some({ id, revision: state.localRevision }) }, source)
      },
      TimersCancelled: () => unchanged(state),
    }),
  )
