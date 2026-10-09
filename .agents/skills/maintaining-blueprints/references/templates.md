# Blueprint and implementation record templates

Use the sections relevant to the project. Replace placeholders with inspected facts or explicit proposals; delete empty sections. Do not manufacture decisions, dates, commands, or evidence.

## Documentation index

```markdown
# Project documentation

Code establishes current behavior. The blueprint describes intended contracts.
The implementation plan describes future work. The log records observed delivery.

| Record                           | Purpose                  | Status                   |
| -------------------------------- | ------------------------ | ------------------------ |
| [Blueprint](blueprint/README.md) | Design and decisions     | Mixed, sections labelled |
| [Plan](implementation-plan.md)   | Ordered delivery slices  | Current                  |
| [Log](implementation-log.md)     | Results and verification | Historical               |

Read the overview, relevant contract, referenced decisions, then the plan and recent log.
```

## Blueprint overview

```markdown
# Product blueprint

Status: [proposed / accepted / mixed]. Inspected baseline: [date and commit, if available].

## Goal and audience

[User outcome, primary consumer, and operating context.]

## Principles and non-goals

[Constraints that shape choices, plus deliberately excluded work.]

## Current behavior and intended changes

[Separate inspected behavior from the accepted or proposed target.]

## Document map

[Link each chapter and explain the responsibility it owns.]

## Open decisions

[Question, known constraints, evidence needed, and impact on the plan.]
```

## Architecture chapter

```markdown
# [Capability] architecture

Status: [section-level status if mixed]. Baseline: [inspected code].

## Contract and invariants

[Inputs, outputs, ownership, failure behavior, compatibility requirements.]

## Runtime flow

[A concise diagram plus any ordering or concurrency rules it cannot show.]

## File ownership

| Responsibility | Current path             | Planned change              |
| -------------- | ------------------------ | --------------------------- |
| [Owner]        | [Real file/package link] | [None or labelled proposal] |

## Consumer usage

[Public entry point, composition/configuration, lifecycle, and errors.
Label uncompiled or future API examples as proposed.]

## Verification and gaps

[What has been checked, what remains unverified, and what would detect a regression.]

## Decisions

[Links to relevant stable decision IDs, not duplicate rationale.]
```

## Decision record

```markdown
## D001: [Specific choice]

Status: [proposed / accepted / superseded by Dxxx]. Date: [actual date].

Context: [Problem and constraints.]
Chosen: [Choice, and who confirmed it when known.]
Alternatives: [Plausible options and why they were rejected.]
Reason: [Evidence and tradeoff that settled the choice.]
Consequences: [Benefits, costs, compatibility, and limitations.]
Revisit when: [Concrete change or evidence that could reverse it.]
References: [Code, research, or linked owner decision.]
```

If a choice changes, mark the old record superseded and add a new ID. Do not erase its rationale.

## Implementation plan slice

```markdown
## S01: [Observable outcome]

Status: [planned / active / blocked / complete].
Depends on: [Decision IDs or earlier slices, if any.]
Scope: [Owning modules, included changes, and exclusions.]
Acceptance: [Behavior someone can observe or verify.]
Checks: [Targeted checks and relevant repository gates.]
Docs: [Contract, usage, or decision records this slice must update.]
Risks and open decisions: [Only unresolved issues affecting this slice.]
Completion evidence: [Link to implementation entry when completed.]
```

Complete a slice only when its stated acceptance criteria hold. Record partial work separately.

## Implementation log entry

```markdown
## [Date with timezone when relevant]: [Outcome]

Related: [Slice IDs, decision IDs, and affected contract links.]
Scope: [What changed and its owning files/packages.]
Result: [Observable outcome, not a list of edits.]

### Verification

| Check          | Result                                | Evidence or limitation      |
| -------------- | ------------------------------------- | --------------------------- |
| [Actual check] | [Passed / failed / blocked / not run] | [Output/artifact reference] |

### Deviations and decisions

[Differences from the blueprint or plan; link new decisions rather than silently changing policy.]

### Remaining work

[Gaps, blockers, and the next useful step.]

Delivery: [Local edits / committed / pushed / merged / released / deployed, with evidence.]
```

For a correction, append `Correction to [entry link]` with the corrected fact, reason, and evidence. Preserve the original entry. Do not record secrets, private document contents, or raw diagnostic dumps.
