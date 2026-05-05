# Clean-Room Working Rules

This file is the operating contract for everyone working on Inkling.

## 1. Project intent

Build a new product inspired by the problem space, not by the old source tree.

Allowed:

- same product category
- similar high-level UX goals
- similar user problems

Forbidden:

- source reuse
- config reuse
- file-by-file translation
- identifier reuse where not necessary

## 2. Source hygiene

Allowed sources:

- this repo
- official Tauri docs
- official Apple docs
- fresh product requirements
- manual testing notes

Disallowed sources:

- copying from the old Swift repo
- screenshot-to-code recreation of old implementation details
- preserving old internal names just because they already exist elsewhere

## 3. Naming rules

Use fresh names for:

- action identifiers
- config files
- database tables
- Rust modules
- frontend components

Examples of what to avoid:

- `selected.translation.en`
- `selectedext`
- `UserConfiguration.json`
- legacy bundle identifiers

## 4. Data and config rules

Use fresh storage formats:

- settings via store plugin
- sentence data via SQLite
- no legacy extension package format in phase 1

If extensibility is added later, design a new format from scratch.

## 5. Prompt and copy rules

All prompts, button text, and settings copy must be freshly authored here.

Do not:

- reuse legacy prompt wording
- mirror old menu copy line by line
- preserve old localized strings unless they are unavoidable platform terms

## 6. Implementation workflow

Every feature should follow this order:

1. write the requirement in this repo
2. define acceptance criteria
3. implement from the requirement
4. test against black-box behavior

Do not implement from memory of old code structure.

## 7. Review checklist

Before merging any feature, verify:

- no copied code or config
- no old identifiers leaked in
- behavior is described in fresh requirements
- tests or manual QA steps exist
- user-visible copy was freshly written

## 8. Escalation rule

If a task starts depending on the old repo for implementation detail, stop and rewrite the task as:

- a requirement
- a behavior spec
- or a manual test case

Then continue from that rewritten spec.
