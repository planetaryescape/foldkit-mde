import { Model as EditorModel, Message as EditorMessage } from '@foldkit-mde/core'
import { Event, FlushResult, Session } from '@foldkit-mde/persistence/autosave'
import { Counter, DocumentKey, Failure, SavedDocument } from '@foldkit-mde/persistence/store'
import { Schema } from 'effect'

export const Startup = Schema.TaggedUnion({
  Loaded: { key: DocumentKey, document: Schema.Option(SavedDocument), sessionId: Schema.String },
  LoadFailed: { key: DocumentKey, failure: Failure },
})

export type Startup = typeof Startup.Type

export const Recovery = Schema.TaggedUnion({
  NotRequested: {},
  Loading: {},
  Available: { document: SavedDocument },
  Missing: {},
  Failed: { failure: Failure },
})

export const Retention = Schema.Literals(['Unknown', 'Persistent', 'BestEffort', 'Unavailable'])

export type Retention = typeof Retention.Type

export const Model = Schema.TaggedUnion({
  Editing: { editor: EditorModel, saving: Session, retention: Retention },
  LoadFailed: {
    key: DocumentKey,
    attempt: Counter,
    loading: Schema.Boolean,
    failure: Failure,
    recovery: Recovery,
  },
})

export type Model = typeof Model.Type

export const Message = Schema.TaggedUnion({
  Editor: { message: EditorMessage },
  Persistence: { message: Event },
  FlushCompleted: { result: FlushResult },
  RetryLoad: {},
  Loaded: { attempt: Counter, startup: Startup },
  RequestRecovery: {},
  Recovered: { attempt: Counter, result: Recovery },
  RequestRetention: {},
  RetentionChecked: { sessionId: Schema.String, status: Retention },
  ExportMarkdown: {},
})

export type Message = typeof Message.Type
