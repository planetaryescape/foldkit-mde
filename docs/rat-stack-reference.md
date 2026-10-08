# Using rat-stack as a reference

Checked on 2026-10-08. Start with [llms.txt](https://ratstack.sh/llms.txt), [AGENTS.md](https://ratstack.sh/AGENTS.md), and [VISION.md](https://ratstack.sh/VISION.md). This project adopts relevant patterns rather than cloning the template or its dependency set.

## Patterns we adopt

| Reference                                                                           | Application here                                                                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Schemas define the boundary](https://ratstack.sh/lore/schemas-define-the-boundary) | Schema defines shared values and types. Validate external input before dispatch.                                             |
| [Ports and adapters](https://ratstack.sh/lore/hexagonal-architecture)               | Core owns editor behavior. Foldkit, DOM, persistence, and provider integration stay outside it.                              |
| [Run Effect at the boundary](https://ratstack.sh/lore/run-effect-at-the-boundary)   | Use Foldkit's runtime bridge. Plugins describe work; they do not start private runtimes.                                     |
| [The fence](https://ratstack.sh/lore/the-fence)                                     | Compiler diagnostics, lint, tests, and Git hooks enforce the rules we can currently check.                                   |
| [Keep or cut](https://ratstack.sh/skills/keep-or-cut)                               | Do not import unused HTTP, MCP, database, auth, or deployment surfaces.                                                      |
| [Lifecycle machines](https://ratstack.sh/skills/add-a-lifecycle-machine)            | Name states, events, and outcomes before implementation. Adapt this discipline to Schema + Match, without its XState actors. |

For future plugin design, share a contract and transformation between raw and visual editing. Do not copy rat-stack's server capability/projection framework into a browser-only library without a concrete need.

## Deliberate differences

- **Bun workspaces:** retain the user's chosen package manager and workspace layout. No pnpm or Turborepo migration.
- **Schema + Match:** retain our pure reducer and Foldkit event loop. No XState or `@xstate/effect` dependency.
- **Bun tests:** keep the existing runner. Rat-stack's `@effect/vitest` examples are references, not an instruction to add another framework.
- **Compatible exact pins:** use this repository's versions. Rat-stack's pins do not authorize upgrades or downgrades.
- **Vendor layout:** anti-slop remains under `packages/anti-slop`, with upstream licenses and `UPSTREAM.md`, not a top-level tools directory.
- **Alchemy later:** infrastructure belongs to a host or a dedicated app workspace when needed. The editor core must not depend on Alchemy.
- **Approval:** rat-stack's deployment permissions apply to its own repository. They do not authorize production writes here or in gbfm.

## Current fence and gaps

The repository checks formatting, type-aware Oxlint, Effect diagnostics, native TypeScript, core tests, and the vendored rule tests. A tracked `.githooks/pre-commit` runs `bun run precommit`; `prepare` installs it through repository-local `core.hooksPath`. Build verification remains a separate `bun run build` command.

The scaffold currently follows the intended dependency direction, but no project-specific lint rule enforces it. We also have no CI or agent-harness hook-bypass interceptor. A Git hook is useful local enforcement, not a security boundary.

The imported gist relaxes some type-safety rules in test files and permits TypeScript suppression comments. These exemptions are broader than rat-stack's targeted-override policy. No blanket claim of equivalent enforcement is justified. Tighten them when adopting the corresponding tests or rules, without rewriting vendored source.

The two current core tests cover source replacement and clearing. They are not model-based coverage of selection, formatting, history, or asynchronous lifecycle behavior. Those behaviors are not implemented yet.

## Workflow for subsequent work

1. Search the reference guide for the behavior being changed. Read the relevant rules and skills before coding.
2. Name the authoritative state, derived representations, and writer. For the current scaffold, `Model.source` is authoritative and `update` replaces it.
3. Keep domain transformations in core and external behavior at the adapter boundary.
4. Identify the invariant and its check. Do not add a gate that only creates process.
5. Run the local checks and inspect affected browser behavior. Report violations, intentional differences, and unverified claims separately.

For the first WYSIWYG slice, the important invariant is source preservation: switching modes or applying bold must not rewrite unrelated Markdown. A single core transaction path should own both modes and undo. The source-span model in the README remains a proposal until we prove that slice.
