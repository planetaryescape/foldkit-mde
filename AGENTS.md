# Foldkit MDE

Build a small Markdown editor library with Foldkit and Effect. gbfm is the intended first consumer, not part of this repository's change scope.

## Reference workflow

Use [rat-stack's agent guide](https://ratstack.sh/llms.txt) as the architecture reference. Before writing code, search its rules and skills for the work at hand. Read the owning rules, relevant principles from [rat-stack-mode](https://ratstack.sh/skills/rat-stack-mode), and matching playbooks. Report which patterns affect the design and any violations you find.

Read the installed `node_modules/effect/AGENTS.md` before changing Effect code. Check APIs against installed versions, not older local checkouts. Reference sources do not become runtime dependencies.

[Our rat-stack adaptation](docs/rat-stack-reference.md) records adopted patterns, deliberate differences, and enforcement gaps. Local product decisions take precedence over template-specific choices:

- Bun workspaces, not pnpm or Turborepo.
- Foldkit and Effect as the only direct external application dependencies.
- Effect Schema and exhaustive Match reducers, not XState or another actor runtime.
- Alchemy for future infrastructure. Do not add infrastructure until a concrete host requirement exists. Deploys and production writes require explicit approval.
- Keep development tooling in workspace packages. Preserve vendored licenses and provenance.

## Ownership

- `packages/core` owns document state, selection, transactions, history, and pure transitions. It imports neither Foldkit, browser APIs, apps, nor provider adapters.
- `packages/editor` owns Foldkit views and browser input, selection, focus, and composition integration. It depends on core.
- `packages/plugins` owns built-in format representations. Core owns their contracts, not concrete output formats. The host chooses plugins.
- `apps/playground` owns runtime startup and composition. Packages never import apps or reach into sibling workspace source through relative paths.
- Formatting plugins return pure transactions. Rendering and custom-component plugins use explicit contracts. Prove one operation before introducing a general plugin framework.
- Saving, publishing, and gbfm-specific integrations belong to the host. Do not modify gbfm without a separate request.

Before changing editor state, name its authoritative representation, derived views, and writer. `Model.source` is authoritative; parsing and DOM content are derived, and `update` owns edits and history. Both raw and editable visual surfaces must use the same transaction and history path. Preserve unsupported Markdown across mode switches. The current visual subset is paragraphs and bold, not full CommonMark/GFM or a registered plugin engine.

Visual mode has one editing host. Do not turn paragraphs back into separate contenteditable inputs. JSON is a versioned, read-only representation plugin, not another state store. Future JSON import or editing must decode its declared format and dispatch core transactions. [The architecture visual](docs/architecture.html) distinguishes implemented contracts from planned plugin capabilities.

Use Effect for typed failures, asynchronous work, services, and resource lifetimes. Keep pure transformations pure. Execute Effects through the host's existing runtime boundary, not inside plugins or reducers. Decode external values with Schema at their boundary instead of using assertions.

## Verification and delivery

Run `bun run precommit` and `bun run build` before reporting readiness. `bun install` patches the compiler and Oxlint, then installs the repository-local Git hook. The hook runs formatting, lint, types, and tests without rewriting files.

Never bypass hooks or weaken checks to make a change pass. Keep local commits atomic and message-only, with no attribution trailers or co-authors. Do not push or deploy without explicit approval.

Choose tests that detect plausible broken behavior. For stateful editing, check command histories against an independent model. For domain rules, prefer generated inputs where they add coverage; demonstrate that an intentional defect fails the test before trusting it. Keep browser integration tests for selection, IME, and undo behavior.

With the playground server running, `bun run --filter @foldkit-mde/playground test:browser` uses a separately installed agent-browser to check the DOM adapter. This is separate from precommit. Synthetic composition events do not prove real operating-system IME behavior.

When a pattern needs enforcement, prefer the smallest compiler, lint, or test check that rejects it. Distinguish written policy from verified enforcement. The current fence does not yet include project-specific import-boundary lint rules or CI.
