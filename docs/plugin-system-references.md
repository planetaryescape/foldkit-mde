# Plugin-system design references

Vendored on 2026-10-08. These are read-only, curated source snapshots under `docs/references/`, not installed packages, runnable checkouts, or editor implementations. No runtime dependencies were added. Upstream paths and bytes are preserved, including each root README and MIT license. Imports and README links can point outside the selected snapshot; follow the pinned upstream tree for omitted context.

Executor's [README References section](references/executor/README.md#references) explicitly names OpenCode, OpenClaw, EmDash, and Pi as plugin-system references. All four are included alongside executor. Its other references, Effect and FumaDB, are not additional vendored repositories here: Effect is already installed and locally available; executor's selected storage implementation provides context without adding a database framework.

## Provenance and update policy

| Snapshot               | Exact upstream revision                                                                                                            | License                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `references/executor/` | [UsefulSoftwareCo/executor at 27dccb8](https://github.com/UsefulSoftwareCo/executor/tree/27dccb896fbaf9d1790496d1a8f131b790c89c68) | [MIT](references/executor/LICENSE) |
| `references/opencode/` | [anomalyco/opencode at 5d9cd9b](https://github.com/anomalyco/opencode/tree/5d9cd9b259f0456522f318a7435501d03cfbee79)               | [MIT](references/opencode/LICENSE) |
| `references/openclaw/` | [openclaw/openclaw at de2b8ae](https://github.com/openclaw/openclaw/tree/de2b8ae04af1623cbb5b72e84bb80976008b784f)                 | [MIT](references/openclaw/LICENSE) |
| `references/emdash/`   | [emdash-cms/emdash at 00b5cfa](https://github.com/emdash-cms/emdash/tree/00b5cfaf3cb0c9bf041f57b77695ef13221d6221)                 | [MIT](references/emdash/LICENSE)   |
| `references/pi-mono/`  | [badlogic/pi-mono at ce950d7](https://github.com/badlogic/pi-mono/tree/ce950d78f424dcaf9f5d6a03ce80ab141130eb1d)                   | [MIT](references/pi-mono/LICENSE)  |

[SHA256SUMS](references/SHA256SUMS) lists every retained upstream file and serves as the exact selection manifest. Verify it from the repository root with `shasum -a 256 -c docs/references/SHA256SUMS`. The snapshots were fetched from GitHub commit archives, not copied from potentially modified sibling checkouts.

Keep snapshots unchanged. Formatter and application lint exclude only `docs/references/`; TypeScript includes application/workspace sources explicitly, and these folders are outside Bun workspace globs. Do not install or execute upstream examples as part of our checks. Upstream scripts, comments, framework choices, and development instructions are historical reference material, not this project's rules.

For an intentional refresh, download each pinned commit archive into ignored scratch, extract the same manifest paths, retain licenses, inspect the relevant upstream changes, update revision links and checksums, then rerun our checks. Expand the selection only for a concrete design question. Do not track moving branches, add Git submodules, or copy whole agent applications into the editor.

## Where to read, and why

### Executor: typed capabilities and external work

- [Plugin contract and `definePlugin`](references/executor/packages/core/sdk/src/plugin.ts): typed extension surfaces, storage construction, dynamic tools, and separate validation/invocation hooks.
- [Composition and dispatch](references/executor/packages/core/sdk/src/executor.ts): how the host wires concrete plugins rather than letting each plugin own a runtime.
- [Storage runtime](references/executor/packages/core/sdk/src/fuma-runtime.ts) and [after-commit tests](references/executor/packages/core/sdk/src/plugin-after-commit.test.ts): transactional state changes versus irreversible external cleanup. Cleanup registered with `afterCommit` is discarded on rollback.

Use this for Effect service adapters and host composition. Do not copy credential providers, OAuth, HTTP routing, policy engines, or its general catalog into formatting plugins. Our [persistence proposal](persistence-design.md) remains a narrow `DocumentStore` contract, not executor's database abstraction.

### OpenCode: Effect scopes and contribution lifetime

- [V2 Effect authoring guide](references/opencode/packages/plugin/src/v2/effect/README.md), [definition](references/opencode/packages/plugin/src/v2/effect/plugin.ts), and [registration contract](references/opencode/packages/plugin/src/v2/effect/registration.ts).
- [V2 runtime](references/opencode/packages/core/src/plugin.ts) and [lifecycle tests](references/opencode/packages/core/test/plugin.test.ts): per-plugin child scopes, replacement, removal, failed activation, and host shutdown.
- [Older Promise hooks](references/opencode/packages/plugin/src/index.ts) and [their loader](references/opencode/packages/opencode/src/plugin/index.ts): a contrasting sequential hook model. V2 Promise authoring sources are also retained for comparison.

Use scoped contribution cleanup when custom components or effectful plugins acquire listeners or resources. Do not mistake the older mutable-output hooks for the whole current design, or copy another application's event loop into Foldkit. Check APIs against our installed Effect version before adapting anything.

### OpenClaw: registration is not execution

- [Definition](references/openclaw/src/plugins/plugin-definition.types.ts), [registration API](references/openclaw/src/plugins/plugin-api.types.ts), [contribution types](references/openclaw/src/plugins/plugin-registration.types.ts), and [hooks](references/openclaw/src/plugins/hook-types.ts). The retained `types.ts` is a facade, not the complete contract.
- [Loader facade](references/openclaw/src/plugins/loader.ts), [orchestration](references/openclaw/src/plugins/loader-runtime-load.ts), and [registration ownership](references/openclaw/src/plugins/loader-module-runtime.ts).
- [Registration lifecycle guard](references/openclaw/src/plugins/api-lifecycle.ts) and [its tests](references/openclaw/src/plugins/api-lifecycle.test.ts): registration methods become inert after the synchronous registration phase. Selected runtime actions remain callable. The guard defaults to rejecting Promise-returning registration, with an explicit ignore mode.

Use this to decide when contributions may be registered and who owns them. Do not reproduce its broad gateway API, Proxy-based guards, or agent/session services for a small editor. Typed host inputs and simple static composition are preferable until dynamic loading has a real consumer.

### EmDash: editor extensions return patches

- [Native definition helper](references/emdash/packages/core/src/plugins/define-plugin.ts), [runtime types](references/emdash/packages/core/src/plugins/types.ts), and [sandboxed authoring surface](references/emdash/packages/core/src/plugin-types.ts).
- [Manifest/capabilities](references/emdash/packages/plugin-types/src/index.ts), [manager](references/emdash/packages/core/src/plugins/manager.ts), [lifecycle](references/emdash/packages/core/src/plugins/lifecycle.ts), [hooks](references/emdash/packages/core/src/plugins/hooks.ts), and [context](references/emdash/packages/core/src/plugins/context.ts).
- [Draft patch contract](references/emdash/packages/core/src/plugins/editor-draft.ts) and [editor extension example](references/emdash/e2e/fixture/src/editor-extensions-plugin.mjs): an async extension returns explicit patch operations, rather than mutating the editor directly.

Use explicit result contracts for custom components and async transformations. Our host must still reject stale results and apply accepted transactions through core history. Native `definePlugin` and sandboxed manifest identity are distinct upstream models; native capability declarations are not a sandbox. Do not add installation states, marketplace infrastructure, permissions, or sandbox machinery without a requirement.

### Pi: a small Markdown transform contract

- [Extension types](references/pi-mono/packages/coding-agent/src/core/extensions/types.ts): `MarkdownTransformer` is a synchronous Markdown/context-to-Markdown function, registered through `registerMarkdownTransformer`.
- [Loader](references/pi-mono/packages/coding-agent/src/core/extensions/loader.ts) and [runner](references/pi-mono/packages/coding-agent/src/core/extensions/runner.ts): extension-owned contributions, event subscriptions, runtime binding, and collection of transformers.
- [Authoring guide](references/pi-mono/packages/coding-agent/docs/extensions.md) and [minimal tool example](references/pi-mono/packages/coding-agent/examples/extensions/hello.ts).

Use the small function shape as a comparison for testable transformations. Pi's Markdown transformer is presentation-oriented, not an accepted edit or durable document change. A synchronous signature does not itself enforce purity. Formatting here returns a source-offset transaction, while JSON/HTML return derived representations.

## How this maps to our architecture

| Responsibility                            | Our owner                                             | Useful reference                                                      | Boundary to preserve                                                          |
| ----------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Formatting input/result contract          | `packages/core/src/plugins.ts`                        | Pi's small transform surface; EmDash's explicit patches               | Pure inputs and transactions; core applies edits and owns undo.               |
| JSON/HTML representations                 | `packages/plugins` implementations, core contracts    | Executor's separate validation/projection/invocation responsibilities | Source stays authoritative; projection cannot mutate the document.            |
| Custom-component registration and cleanup | Future editor contract, host composition              | OpenCode V2 scopes; OpenClaw registration phase                       | Scope contributions to an editor instance; do not create a second event loop. |
| Persistence operations                    | Proposed `packages/persistence`, host-selected Layers | Executor's storage and cleanup boundaries                             | Typed service, atomic save, explicit outcomes; no database handles in core.   |
| Runtime and plugin selection              | `apps/playground`, later the gbfm host                | Executor composition; OpenCode lifecycle                              | Host chooses implementations and provides services to Foldkit.                |

These are design references, not approval to introduce a registry. The current editor has formatting and representation contracts but no general dynamic plugin engine. Keep pure formatting, derived output, scoped DOM behavior, and external services separate instead of giving every plugin one enormous context.

## Before designing or changing a plugin

1. Read the relevant section and vendored contract, implementation, and example/test together. Use the pinned upstream tree if an imported helper is omitted.
2. State the specific pattern being borrowed, its owner in our file tree, and what upstream complexity is deliberately omitted.
3. Name authoritative state, ordering, disposal, errors, and stale-result behavior where relevant. A formatter needs none of the storage/provider lifecycle machinery.
4. Keep our Schema + Match reducer, Foldkit runtime, Bun checks, dependency limits, and [rat-stack adaptation](rat-stack-reference.md). Report any conflict rather than silently adopting upstream rules.
5. Test the actual contract: deterministic formatting and source preservation, or typed failures and resource cleanup for adapters. Vendored tests are evidence of upstream intent, not tests that we have run.
