# Effect state machine options for Foldkit MDE

Status: historical research. The selected reducer direction remains current; feature and package statements below describe the scaffold at the research date. See [the implemented architecture](../blueprint/architecture.html) for current editing, history, plugin contracts, and local saving.

## Selected direction

We chose our own **Effect Schema + exhaustive Match reducer**, not Foldkit's experimental Machine or a separate statechart/actor library. Foldkit owns the UI event loop. Formatting plugins should produce pure editing transactions; async plugin work uses Effect and explicit completion Messages. No second Queue/Ref actor owns editor state.

At the research baseline, the Bun workspace separated headless core, Foldkit presentation, and the playground composition root. The reducer handled source replacement only. Editable WYSIWYG, shared history, and plugin contracts were future work at that point.

Version update on 2026-10-08: the project uses stable `effect@4.0.0` and `foldkit@0.167.0`. Effect 4.0.2 is the latest stable registry version checked, but Foldkit's declared peers pin Effect and platform-browser to exactly 4.0.0. We did not override those peers.

## Original research context

Research date: 2026-10-08. The original target was `effect@4.0.0-rc.116` and `foldkit@0.163.0`, confirmed in the initial local `package.json`. The version-specific compatibility table and source inspections below describe that snapshot, not the current stable installation. No external state machine dependency was installed. External research was combined with direct inspection and an inline smoke check of the then-installed Foldkit Machine.

## Shortlist and decision

| Option                                                                                   | What it actually is                                                      | Compatibility with our pinned Effect                    | Assessment                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `foldkit/experimental/machine`                                                           | Pure typed transition table returning Foldkit Model changes and Commands | Already shipped in our installed Foldkit 0.163.0        | Best first candidate for an explicit editor interaction machine without another runtime               |
| [`@typeonce/effect-machine`](https://github.com/typeonce-dev/effect-machine), **0.38.0** | Real schema-first hierarchical/parallel statechart engine                | **Exact matching peer: `4.0.0-rc.116`**                 | Strongest external library candidate; evaluate this version, not latest                               |
| Local reducer/actor built from Effect primitives                                         | An approach, not a packaged statechart library                           | Primitives already present in rc.116                    | Lowest dependency cost for a small editor mode machine; lifecycle semantics remain our responsibility |
| [`@handfish/effstate-v4`](https://github.com/Handfish/effstate)                          | Real flat FSM with Effect/Stream lifecycle work                          | **Effect 3 only**, despite “v4” in the package name     | Useful design reference, not a compatible dependency                                                  |
| Historical `@effect/experimental/Machine`                                                | Effect 3 local request/reply stateful actor                              | Not ported to Effect 4                                  | Historical reference, not the new statechart engine                                                   |
| Proposed `effect/unstable/machine`                                                       | First-party statechart proposal behind the Typeonce library              | Not present in rc.116; original PR closed without merge | Watch upstream, do not plan on an available built-in module                                           |

**Initial recommendation, superseded by the decision above:** model the editor's states ourselves, but do not build a general-purpose statechart engine or another event loop. Use Foldkit's existing Model/Message/update runtime; evaluate its experimental Machine for the interaction lifecycle. An exhaustive Schema/Match reducer is the simpler alternative when the transition table does not earn its complexity. Shortlist Typeonce 0.38.0 only if we genuinely need hierarchical/parallel statecharts or state-owned asynchronous invocations. None of these choices requires React, AtomMachine, ClusterMachine, or durable workflows.

## 0. Foldkit already ships a Machine

The then-installed `foldkit/dist/experimental/machine/machine.d.ts` and `machine.js` were the exact-version primary sources. The older local `../invoicing-mprocs/repos/foldkit/examples/checkout-machine/src/main.ts` checkout example was useful for structure but had older API shapes. These local research inputs are not portable repository links. Upstream repository: [foldkit/foldkit](https://github.com/foldkit/foldkit).

- Schema state/Message unions define the protocol. `define` compiles a state-local table; `to` names an edge's target. `when` supplies ordered pure guards, including Option-valued guards that refine data for the edge. `otherwise` and `ignore` give explicit fallback behavior.
- Edge handlers return `Update.Return`: next Model plus optional Commands. `transition` applies one Message; `step` exposes whether it transitioned or was ignored and why. `fold` embeds a Machine state field into a parent Model.
- Shared transition defaults are expanded into state-local tables. They are not hierarchical parent states. The inspected definition has no native compound/parallel state configuration, invoked state work, or entry/exit lifecycle hooks.
- `edges`, `reachableFrom`, `unreachableStates`, and `deadTransitions` support inspection. Reachability is structural: guard feasibility and external state changes are not proved. It also exposes diagram export.
- Crucially, it is not another runtime. State remains in the Foldkit Model; the normal runtime executes Commands. Leaving a Machine state does not automatically cancel a Command. Subscriptions, Mounts, ManagedResources, or an explicit cancellation protocol still own external work and resource lifetimes. The then-installed `foldkit/dist/managedResource/managedResource.d.ts` ManagedResource contract described model-driven acquisition/release.
- It is explicitly experimental; API stability is not promised. Keeping application state schemas and behavioral tests explicit limits the cost of replacing the transition-table notation later.

An inline Bun smoke check against the installed packages constructed a two-state Raw/Visual machine and verified transition, exact source preservation, ignored-event reporting, and structural reachability. This was not a browser editor integration, a cancellation test, or a persisted project test. No scratch source file was created.

## Where the editor benefits from machines

Machines are most useful for interaction and asynchronous lifecycle constraints, not for representing every possible document or selection as a named state.

- Raw/visual mode switching: retain raw source if parsing fails; enter the visual surface only when its representation is usable. A pending transition is useful only if parsing is asynchronous.
- IME composition: prevent formatting or mode changes from disrupting an in-progress composition; explicitly choose whether such actions are deferred or declined.
- Async plugin work: encode pending/succeeded/failed/cancelled work, and correlate completions with the document revision or operation ID to reject stale results.

Keep mode, composition, and individual plugin lifecycles as small cooperating models rather than enumerating their full Cartesian product. Document transformations, source mapping, selection mapping, and undo history remain separate core responsibilities. Bold/italic plugins should return pure editing transactions; they do not each need an actor or a state machine.

Foldkit already serializes application behavior through Messages and update. Queue/Ref/PubSub is a useful design for an independently running Effect actor, but adding that event loop to this editor by default would create competing state owners. We should define and test the actual transition rules before selecting more machinery.

## 1. Typeonce Effect Machine

### Maintenance and version reality

The repository is not archived, last pushed 2026-10-02; npm latest is **0.40.0**, published 2026-10-02. Latest requires stable **`effect: ^4.0.0`**, which does not admit `4.0.0-rc.116`. Version **0.38.0**, published 2026-09-19, declares exactly rc.116 as both peer and development dependency. 0.38.1 and 0.39.0 require rc.117. These are registry and manifest checks, not a compiled integration test. Sources: [repository metadata](https://api.github.com/repos/typeonce-dev/effect-machine), [npm metadata including historical manifests](https://registry.npmjs.org/@typeonce%2Feffect-machine), [0.38.0 manifest](https://github.com/typeonce-dev/effect-machine/blob/%40typeonce%2Feffect-machine%400.38.0/packages/effect-machine/package.json), [releases](https://github.com/typeonce-dev/effect-machine/releases).

This is pre-1.0 software. The author explicitly permits breaking changes in minor releases without compatibility aliases. **Use versioned documentation:** 0.38.0 uses `Machine.targets(Root)` references; current documentation uses dotted destination strings. The 0.38.0 README installation example still says rc.112, contrary to its package manifest. Current README also retains older “exact beta” wording despite its stable peer. Prefer the published/versioned manifest for compatibility, not stale prose.

Primary docs: [0.38.0 package README](https://github.com/typeonce-dev/effect-machine/blob/%40typeonce%2Feffect-machine%400.38.0/packages/effect-machine/README.md), [current API reference](https://effect-machine.typeonce.dev), [current root API and migration details](https://github.com/typeonce-dev/effect-machine/blob/main/packages/effect-machine/docs/root-api.md).

### Semantics and testability

The versioned README documents the following, not just a workflow runner:

- Schema-backed state/event protocols, state-owned data, compound and parallel states, `always` transitions, ordered choices, finals/completion, shallow/deep history, and logical snapshots.
- Separate topology and handlers. Ordinary edges declare destinations; named branch groups declare possible outcomes before synchronous resolution. A boolean `guard` declines before construction/commands. Resolver rejection requires explicit `declinable: true`. Async checks belong in invoked work followed by a result event, not in a guard.
- Retained-owner updates replace data without restarting retained work. Reentry explicitly restarts lifecycle. Entry/exit are documented as synchronous commands; asynchronous work belongs in `invoke`.
- Registered Effects, Streams, timers, logic, and child machines have typed inputs and required reachable result handlers. Typed failures use `onFailure`; defects, startup errors, and interruption have separate runtime boundaries. Do not assume `onFailure` catches every possible Cause.
- Invocations belong to their state and cancel on exit. Dynamically spawned process-owned children can survive the commissioning state, so they require an explicit stop policy. Effect services and Layers supply dependencies; there is no additional machine-specific DI container. `Machine.start` is used within an Effect scope. Cancellation of an invocation is not a guarantee that a resource acquired in an unrelated enclosing scope is released on that state exit.
- Snapshot resume restores logical state/history, **not live fibers or subscriptions**. Invocations restart and timers restart at full duration. Snapshot persistence is not autosave durability or transactional execution of external effects.
- `MachineTest` supplies pure planner traces, verification, transition/branch coverage, invariants, generated scenarios, bounded exploration, and live-runtime probes/command models. Pure planning does not execute invokes or time; live tests are necessary for cancellation, timing, and resources.

These semantics are documented in the [0.38.0 README](https://github.com/typeonce-dev/effect-machine/blob/%40typeonce%2Feffect-machine%400.38.0/packages/effect-machine/README.md). Authoritative implementation/test locations: [planner](https://github.com/typeonce-dev/effect-machine/blob/%40typeonce%2Feffect-machine%400.38.0/packages/effect-machine/src/internal/machine/planner.ts), [runtime](https://github.com/typeonce-dev/effect-machine/blob/%40typeonce%2Feffect-machine%400.38.0/packages/effect-machine/src/internal/machine/runtime.ts), [MachineTest API](https://github.com/typeonce-dev/effect-machine/blob/%40typeonce%2Feffect-machine%400.38.0/packages/effect-machine/src/testing/MachineTest.ts), [MachineTest tests](https://github.com/typeonce-dev/effect-machine/blob/%40typeonce%2Feffect-machine%400.38.0/packages/effect-machine/test/testing/MachineTest.test.ts). Those paths were verified in the versioned repository tree; this research did not exhaustively audit their implementation or run their tests.

**Editor limitations:** the runtime is another state owner. Choose one authority for editor state and keep event/render boundaries explicit. Do not put every keystroke or DOM selection into a statechart merely because it can hold data. Validate async stale-result rejection, exit cleanup, composition cancellation, and undo grouping in any later trial. These are recommendations, not verified library guarantees. The manifest declares Node >=20; browser/Bun integration and bundle size were not tested here.

## 2. Effstate: useful flat FSM, wrong Effect generation

Repo: [Handfish/effstate](https://github.com/Handfish/effstate). Docs: [introduction](https://handfish.github.io/effstate/getting-started/introduction/), [transition guide source](https://github.com/Handfish/effstate/blob/main/apps/docs/src/content/docs/guides/transitions.mdx), [entry lifecycle notes](https://github.com/Handfish/effstate/blob/main/packages/effstate-v4/docs/entry-effect-lifecycle.md), [runtime source](https://github.com/Handfish/effstate/blob/main/packages/effstate-v4/src/machine.ts).

Latest npm **0.0.6** was published 2026-01-27. Repo last pushed 2026-07-23, not archived, with no GitHub releases returned. Its [manifest](https://github.com/Handfish/effstate/blob/main/packages/effstate-v4/package.json) declares `effect: ^3.0.0` and dev `^3.19.12`. The “v4” names its own API, **not Effect 4**. Sources: [registry](https://registry.npmjs.org/@handfish%2Feffstate-v4), [repository metadata](https://api.github.com/repos/Handfish/effstate), [release API](https://api.github.com/repos/Handfish/effstate/releases).

- Flat tagged states/events and shared context. Synchronous handlers return `goto`, context `update`, actions, or `null` to decline, effectively an inline guard. Global handlers apply across states. This is an FSM, not durable workflow orchestration; no hierarchical/parallel-state contract was found for this API.
- `interpret()` produces an actor with imperative `send`, snapshot reads, subscriptions, and `stop`. Entry/exit Effects and `run` Streams carry typed error/service channels; failures report through `onError`, rather than forcing a failure state.
- Runtime source interrupts the previous `run` fiber before starting its successor. Entry interruption on transition is **off by default**. Exit work is fire-and-forget. `stop()` initiates interruption and returns immediately; it is not an awaitable cleanup barrier.
- Important documentation mismatch: lifecycle prose says exit effects can be interrupted by stop; runtime stop collects only current entry/run fibers and explicitly lets exit fibers complete. Earlier untracked entry work can also outlive a transition when default interruption is disabled. Do not infer complete state-scoped resource ownership from the README’s “auto-cleanup” slogan.
- Snapshot/subscribe APIs make transition tests straightforward, with Effect services available for substitution. The repository has tests under `packages/core/tests`, but the `effstate-v4` manifest has no test script and its directory has no dedicated tests in the inspected tree. Coverage for this API, deterministic timer support, and model-based testing were not verified.

The [README](https://github.com/Handfish/effstate/blob/main/README.md) recommends a supposedly available native `effect/unstable/machine` and claims snapshot interoperability. Both need caution: the referenced PR was not merged, and shared tagged schemas do not establish interchangeable snapshot codecs. No conversion contract was verified. Performance/bundle comparisons were not independently reproduced.

## 3. First-party Machine history: two distinct things

### Proposed Effect 4 statechart engine

[Effect PR #6429](https://github.com/Effect-TS/effect/pull/6429) proposed `effect/unstable/machine`, AtomMachine, and ClusterMachine. It is **closed, not merged**, verified through [PR metadata](https://api.github.com/repos/Effect-TS/effect/pulls/6429). The author [published the community library](https://github.com/Effect-TS/effect/pull/6429#issuecomment-5107219057); maintainer Tim Smart [asked development to stay there until v4 and the package settled](https://github.com/Effect-TS/effect/pull/6429#issuecomment-5109812313). Inclusion in core is an intention, not an available dependency or a commitment.

The installed rc.116 source tree and [tagged upstream tree](https://api.github.com/repos/Effect-TS/effect/git/trees/effect%404.0.0-rc.116?recursive=1) have no unstable machine module. Do not copy the unmerged PR import into this project.

### Historical Effect 3 experimental actor

The older [`@effect/experimental/Machine` API docs](https://effect-ts.github.io/effect/experimental/Machine.ts.html) describe a different model. Its [Effect 3 source](https://github.com/Effect-TS/effect/blob/effect%403.19.12/packages/experimental/src/Machine.ts) builds procedure lists; [Procedure handlers](https://github.com/Effect-TS/effect/blob/effect%403.19.12/packages/experimental/src/Machine/Procedure.ts) return an Effect of `[response, nextState]`. Typed public/private requests, scoped actor startup, observable state, and serializable snapshots are supported. Conditions/guards are handler logic, not a declarative hierarchical statechart topology. Actor lifecycle is scoped, but automatic per-state exit/entry resource ownership should not be assumed. Test through requests/state streams and injected Effect services; no specialized model-based testing API was verified.

The official [rc.116 migration annotation](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.116/migration/annotations/effect__experimental__Machine.yaml) explicitly says this runtime **was not ported**, including snapshot restoration. It recommends choosing local Queue/Ref/PubSub/scoped fibers, Cluster Entity, or Workflow according to semantics. That is stronger evidence than old generated API pages.

## 4. No extra library: explicit reducer plus Effect actor

This is an approach grounded in that official migration recommendation, not a named library. Define a pure tagged-state/event transition function with pure guards and an explicit list of commands. Execute commands in a scoped Effect runtime; feed results back as events. If an autonomous actor is needed, serialize a Queue consumer; use Ref for actor-owned state and PubSub for observation. If several fibers update state directly, [rc.116 SynchronizedRef](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.116/packages/effect/src/SynchronizedRef.ts) serializes even effectful updates, but holding its lock through long work is a design risk, not a substitute for an event protocol.

Resource release comes from explicit scopes/fiber interruption, not from naming a state `Saving` or `Previewing`. A reducer alone has no automatic entry/exit, hierarchy, history, visualization, or machine persistence. The application must define stale-result handling, event ordering, failure transitions, and shutdown. Test the pure transition function directly, inject services for commands, and use [rc.116 TestClock](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.116/packages/effect/src/testing/TestClock.ts) for Effect-based sleeps, retries, and debounce timing. Primitives were checked in the installed rc.116 sources; no actor was implemented.

## 5. Exclusions and XState contrast

**Effect Workflow is not a UI statechart library.** The installed and [tagged rc.116 Workflow source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.116/packages/effect/src/unstable/workflow/Workflow.ts) defines durable execution with payload/result schemas, execution IDs derived from idempotency keys, poll/interrupt/resume, compensation, and suspension. Guards become ordinary Effect control flow; resources follow Effect/workflow lifecycle, not declarative editor state exit. It needs a WorkflowEngine. It can be useful for durable backend jobs, not for cursor, selection, editing/preview modes, or local command ordering. No editor-specific advantage or testing contract was verified. ClusterMachine is an optional distribution adapter around a genuine machine; it does not make Workflow and Machine interchangeable.

**XState is contrast only, not a proposed dependency.** [Actual example repo](https://github.com/SandroMaglione/getting-started-xstate-and-effect), [author explanation](https://www.sandromaglione.com/newsletter/state-management-with-xstate-state-machines-and-effect), [machine source](https://github.com/SandroMaglione/getting-started-xstate-and-effect/blob/main/apps/audio-player-react/src/machine.ts), and [Effect action source](https://github.com/SandroMaglione/getting-started-xstate-and-effect/blob/main/apps/audio-player-react/src/effect.ts) show XState owning states while Effect implements actions. The published 2023 explanation uses Effect 2 prerelease and XState 5.3, so it is not rc.116 compatibility evidence. Separate runtimes require explicit cancellation/resource bridging; do not equate stopping an XState actor with interrupting an Effect fiber. Typeonce calls XState its semantic inspiration, not a drop-in compatibility promise. Example maintenance and a modern bridge were not audited because this is not a candidate.

## First-party Twitter/X evidence

Public post bodies were accessible; reply threads were not retrieved:

- Sandro Maglione, [2026-08-10 release announcement](https://x.com/SandroMaglione/status/2086826948236345715): effect-machine v0.4.0 and performance/internal cleanup. Useful evidence of author activity, **not independently verified benchmark results**.
- Same author, [2026-08-29 frontend update](https://x.com/SandroMaglione/status/2093761621151650196): machine references and Effect atom selectors for React. Useful integration direction, not a Foldkit adapter or evidence that React is required.

The maintainer/author GitHub exchange above is more authoritative for core inclusion and release status than social announcements.

## Verification boundaries

Checked actual repositories, live GitHub API metadata, npm registry versions/peers, versioned primary README/manifests, selected source excerpts, and installed Effect primitives. No install, compile, benchmark, or library test execution. Typeonce 0.38.0 is **metadata-compatible**, not proven integrated with our editor. Remaining trial questions are browser/Bun execution, state ownership at the UI boundary, typed failure handling, stale completion suppression, and whether cleanup is completed before the next editor operation. No claim is made that this search exhausts every small community repository.
