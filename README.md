# Narrative Conversation System

A starting point for a data-driven narrative conversation project: turn scene outlines,
character models, and story-bible material into structured conversations that a runtime can
interpret. The project emphasizes writing and narrative design while separating authored
content, conversation navigation, shared game state, and presentation.

## Core model

The core metaphors are **Story**, **Node**, and **Choice**:

- A **Story** defines a starting Node and an array of Nodes. It contains conversation structure,
  not shared state or a fact registry.
- **Nodes** contain an ID, speaker, text, and an array of Choices. An empty array is an ending.
- **Choices** contain visible text, a target Node, an array of Conditions, and an optional
  Action referencing externally registered, typed facts.
- **Foldback structures** reconnect branches to shared material, supporting acceptance/refusal
  exchanges and question hubs without duplicating every later beat.

### Story specification

Every property below is required unless marked optional:

| Structure | Property | Type | Meaning |
|-----------|----------|------|---------|
| Story | `start` | string | ID of the starting Node |
| Story | `nodes` | Array<Node> | Story Nodes |
| Node | `id` | string | Unique, stable node identifier |
| Node | `speaker` | string | Speaker identifier |
| Node | `text` | string | Player-facing dialogue |
| Node | `choices` | Array<Choice> | Available response definitions, or `[]` |
| Choice | `text` | string | Player-facing response label |
| Choice | `target` | string | Destination node ID |
| Choice | `conditions` | Array<Condition> | All Conditions must pass; `[]` is unconditional |
| Choice | `action` | Action or null | Action to apply before navigation, or `null` for no action |
| Condition | `fact` | string | Key of a fact in the external registry |
| Condition | `comparison` | string | `equals`, `notEquals`, `lessThan`, `greaterThan`, `greaterThanEqual`, or `lessThanEqual` |
| Condition | one typed value | see below | Exactly one of `intValue`, `floatValue`, `stringValue`, `boolValue` |
| Action | `fact` | string | Key of a fact in the external registry |
| Action | `action` | string | `update`, `delete`, `add`, or `subtract` |
| Action | one typed value | see below | Exactly one typed value, except `delete` must have none |

A Node with no Choices represents an ending. All movement between Nodes is player-driven:
even a linear continuation requires a Choice with a `target` (for example, "Continue").

Typed values use `intValue` (a safe integer), `floatValue` (a finite JSON number),
`stringValue` (a string), or `boolValue` (a boolean). The value field must match the
registered fact type; no implicit conversion occurs. A whole number can be a `floatValue`.

`equals` and `notEquals` compare all four types using strict equality. Ordered comparisons
are numeric-only. Conditions are combined with AND, not arbitrary expressions or executable
commands. A missing/deleted value fails every comparison, including `notEquals`.
If a Node has Choices but none are eligible, it is blocked, not an ending.

Actions run before navigation:

- `update` replaces the current value (or restores a deleted value), for all four types.
- `delete` removes the current value, not its registry definition; repeating it is harmless.
- `add` adds numbers or concatenates strings.
- `subtract` subtracts numbers only.

`add` and `subtract` require a current value. Boolean arithmetic, type mismatches,
non-finite numeric results, and unsafe integer results are errors: state and navigation
must remain unchanged. An Action is a single object, not an array.

For example, a Choice can require two facts and subtract a cost:

```json
{
  "text": "Buy supplies",
  "target": "supplies",
  "conditions": [
    { "fact": "coins", "comparison": "greaterThanEqual", "intValue": 5 },
    { "fact": "trusted", "comparison": "equals", "boolValue": true }
  ],
  "action": { "fact": "coins", "action": "subtract", "intValue": 5 }
}
```

Other valid objects include
`{"fact":"trust","comparison":"lessThan","floatValue":0.5}`,
`{"fact":"name","comparison":"notEquals","stringValue":""}`,
`{"fact":"name","action":"update","stringValue":"Ilsa"}`, and
`{"fact":"name","action":"delete"}`.

### External state

Story JSON contains only `start` and `nodes`; Nodes contain `id`, `speaker`, `text`,
and `choices`; Choices contain `text`, `target`, `conditions`, and `action`.
There is no embedded registry, initial state, or `title`.

The host runtime owns its typed fact registry, initial values, ownership, and lifetime rules.
Every Condition and Action must reference a registered fact. Unknown facts are configuration
errors, not implicitly false values. `conditions: []` is unconditional; `action: null`
changes no state.

The web tools keep independent registries outside the Story. Their registry entries use
`id`, `type` (one of the four value field names), `initial` (a matching value), and
`description`; these are tool settings, not part of this
project's Story contract. Structural validation can run without a registry. Before play,
the host must also validate all fact references and types against its own registry.

See [`docs/example-conversation.json`](docs/example-conversation.json) for a complete example
with an acceptance/refusal foldback and a question hub gated by boolean Conditions. To test it,
register `accepted_task` and `read_report` as `boolValue` with false starting values.
Both tools offer an explicit "Register referenced facts with default values" shortcut;
loading a Story does not register facts. The shortcut infers types from typed operands and
uses `0`, `""`, or `false` as appropriate. Conflicting types are errors. A fact referenced
only by delete must be registered manually because its type cannot be inferred.

## Web tools

The [`docs/`](docs/) folder is a static website (no build step or frameworks) that can be
served with GitHub Pages or opened through any local web server:

- [`docs/editor/`](docs/editor/): create Stories from Nodes and Choices, validate against
  the editor's external registry, and export Story-only JSON. Drafts save the Story and
  registry separately in one browser-local workspace. Existing drafts with embedded flags
  are migrated automatically. Saved boolean-string Conditions become `equals`/`boolValue`
  Conditions; string actions become boolean `update` Actions; empty strings become `[]`
  and `null`. Old boolean registry entries gain `type: "boolValue"`.
  Saved drafts with legacy `next` continuations convert them
  into unconditional "Continue" Choices; empty `next` properties are removed.
  Imported Story files with `next` or legacy string Conditions/Actions are rejected with
  migration guidance rather than silently changing their data. New/imported Stories keep
  the editor registry.
- [`docs/player/`](docs/player/): load Story JSON, register typed facts and set their
  values, and play with a transcript. Missing facts or type mismatches block Start. The player registry lasts
  for the page session and persists across Story loads, independently of the editor.
  Fact values can be changed during play; Restart restores values (including deleted facts)
  captured at Start. A deleted value remains missing until updated or entered manually;
  loading a Story resets current values to registry initial values.

Both pages share the validator in [`docs/narrative.js`](docs/narrative.js). To run locally,
serve the folder (for example `python3 -m http.server -d docs`) and open
`http://localhost:8000/`.
