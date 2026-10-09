---
name: maintaining-blueprints
description: "Creates and maintains repository blueprints, decision records, implementation plans, and evidence-backed implementation logs. Use when shaping a project's documentation structure, recording architectural decisions or delivery progress, or reconciling design documents with code."
---

# Maintaining blueprints

Keep intended design, current behavior, future work, and delivery history distinct and linked.

## Authority

Follow repository guidance and user decisions first. Inspect code and executed checks to establish current behavior. A blueprint records the intended contract, not proof that the contract ships. A plan describes future work; a log records observed work. Neither authorizes implementation, deployment, publishing, or production changes.

When code and a blueprint disagree, report the difference. Identify whether it is an implementation gap, an approved design change, or unresolved drift. Do not silently make the blueprint match a bug or change code to match an obsolete proposal. Preserve settled decisions unless new evidence or the owner reopens them.

## Workflow

1. Read the documentation index, scoped guidance, relevant blueprint chapters and decisions. Inspect the owning code, tests, and history. For an empty repo, distinguish owner requirements from assumptions instead of inventing current behavior.
2. State the requested documentation outcome and affected records. Reuse existing paths and names; do not migrate a document tree unless requested. Read [templates](references/templates.md) when creating or restructuring records.
3. Draft the smallest useful structure. For a new blueprint, start with an index, overview, architecture, and decision log. Add a chapter only when it owns a distinct contract that needs detail. Keep plans and implementation history outside the blueprint.
4. Describe each relevant flow through its owner, input, transition, output, and failure behavior. Map responsibilities to real files or packages and show how a consumer uses the public boundary. Label illustrative APIs and future paths as proposed.
5. Record owner-confirmed decisions with stable IDs, rationale, rejected alternatives, consequences, and a revisit condition. Label unconfirmed recommendations as proposed. A useful decision record prevents repeated debate without hiding why the decision was made.
6. Update the plan with ordered, usable slices and observable completion criteria. After work, append an implementation entry with scope, results, evidence, deviations, remaining work, and actual delivery state. Do not turn a plan's checkbox into evidence.
7. Check links, file ownership, status labels, and claims against available evidence. For documentation-only changes, perform documentation checks; do not claim runtime verification. Follow repository-required checks when committing. Report unknowns and failures plainly.

## Shape and reading order

Prefer this shape for a new project, adapting it to existing conventions:

```text
docs/
├── README.md                  documentation map and reading order
├── blueprint/
│   ├── README.md              chapter index and authority rules
│   ├── 00-overview.md          goals, principles, non-goals, status
│   ├── 01-architecture.md      ownership, flows, file map, consumer usage
│   └── 02-decision-log.md      settled and proposed choices
├── implementation-plan.md     future slices and acceptance criteria
└── implementation-log.md      dated, evidence-backed history
```

Numbers order reading; they do not imply implementation priority. Keep established chapter numbers and decision IDs stable. Link superseding records rather than renumbering historical references. Split a growing plan by workstream only when navigation benefits.

Read overview, relevant architecture/contract, referenced decisions, then the current plan and recent log entries. Keep README focused on usable behavior. Keep AGENTS.md short: route contributors to the skill and relevant docs rather than duplicating every contract.

## Status and evidence

- **Implemented:** exists in inspected code. State verification coverage separately.
- **Proposed:** not accepted or not implemented; specify which.
- **Accepted, not implemented:** owner-approved target with an implementation gap.
- **Superseded:** historical rationale retained with a link to its replacement.

Mark mixed-status sections individually. Record an inspection date and code baseline when useful. Link to specific code, tests, commits, or source documents for consequential claims. Prefer repository-relative links inside repository docs. Include concise diagrams when they explain a flow better than prose.

An implementation log is append-only history, not a transcript. Add an explicit correction referencing the old entry when evidence changes. Summarize outcomes and failed approaches that affect the next decision; omit command noise and sensitive data. Distinguish not run, passed, failed, and blocked checks. Distinguish local edits, committed, pushed, merged, released, and deployed. Never infer one from another.

## Keep the boundary small

Do not create documents for hypothetical features, copy another project's domain rules, generate a full chapter catalog by default, or turn a documentation request into code work. Research references inform the shape, not the project's policy. This pattern adapts the indexed blueprints and decision logs in [spotuify](https://github.com/planetaryescape/spotuify/tree/main/docs/blueprint) and [mxr](https://github.com/planetaryescape/mxr/tree/main/docs/blueprint), with a separate evidence-backed implementation log.

## Completion report

Report the records changed, important drift or unresolved decisions, checks performed, and delivery state. Ask only for decisions the available evidence cannot settle. Do not describe the blueprint as implemented or the skill as behavior-tested unless those claims have been checked.
