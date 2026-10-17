# Narrative Conversation System

A starting point for a data-driven narrative conversation project: turn scene outlines,
character models, and story-bible material into structured conversations that a runtime can
interpret. The project emphasizes writing and narrative design while separating authored
content, conversation navigation, shared game state, and presentation.

## Core model

Conversations are graphs of possible states:

- **Nodes** contain a speaker, text, and either a linear continuation, branching choices, or
  an ending.
- **Choices** define when a response appears, its visible text, its destination, and any
  resulting state change.
- **Foldback structures** reconnect branches to shared material, supporting acceptance/refusal
  exchanges and question hubs without duplicating every later beat.
- **Shared state** records facts such as accepting a task or accessing a report, independently
  of the current node and individual characters.

### Initial conversation specification

Every property below is required:

| Structure | Property | Type | Meaning |
|-----------|----------|------|---------|
| Node | `id` | string | Unique, stable node identifier |
| Node | `speaker` | string | Speaker identifier |
| Node | `text` | string | Player-facing dialogue |
| Node | `next` | string | Continuation destination, or `""` |
| Node | `choices` | Array<Choice> | Available response definitions, or `[]` |
| Choice | `text` | string | Player-facing response label |
| Choice | `target` | string | Destination node ID |
| Choice | `conditions` | string | Required registered boolean flag, or `""` for no requirement |
| Choice | `action` | string | Registered boolean flag to set true on selection, or `""` |

A node cannot have both a nonempty `next` and nonempty `choices`. Empty values for both
represent an ending. Conditions control visibility; unmet choices are hidden. Actions happen
only when an eligible choice is selected, before navigating to its target.

The initial contract supports one positive boolean condition and one flag-setting action per
choice, not arbitrary expressions or executable commands. Shared flags require an explicit
registry, initial values, ownership, and lifetime rules.

### Conversation file

A conversation file wraps the nodes with a title, a start node, and the flag registry:

| Property | Type | Meaning |
|----------|------|---------|
| `title` | string | Human-readable conversation title |
| `start` | string | ID of the first node |
| `flags` | Array<Flag> | Registered shared boolean flags |
| `nodes` | Array<Node> | Conversation nodes |

Each flag has an `id` (string), an `initial` value (boolean), and a `description` (string).
Every choice `conditions` and `action` value must be `""` or a registered flag `id`.

See [`docs/example-conversation.json`](docs/example-conversation.json) for a complete example
with an acceptance/refusal foldback and a question hub gated by a flag.

## Intended workflow

1. Extract a scene's purpose, character knowledge, player options, and consequences.
2. Map beats into nodes, continuations, branches, and convergence points.
3. Encode the conversation as JSON with stable references and explicit conditions/actions.
4. Validate structure, destinations, and state vocabulary.
5. Trace and eventually playtest routes, including refusal, question order, re-entry, and exit.

A compatible runtime must interpret this contract; valid JSON alone does not implement
dialogue. Engine integrations can map the data into prepared assets and interfaces so writers
can edit and test content without modifying runtime code.

## Web tools

The [`docs/`](docs/) folder is a static website (no build step or frameworks) that can be
served with GitHub Pages or opened through any local web server:

- [`docs/editor/`](docs/editor/): create conversations from nodes, choices, and flags,
  validate them, and export JSON. Drafts are saved in the browser automatically.
- [`docs/player/`](docs/player/): load a conversation JSON file, set the starting values of
  global flags, and play through it with a transcript.

Both pages share the validator in [`docs/narrative.js`](docs/narrative.js). To run locally,
serve the folder (for example `python3 -m http.server -d docs`) and open
`http://localhost:8000/`.

## Status

Early prototype. This repository contains the specification above, an example conversation,
and a browser-based editor and player. There is no engine integration or automated test suite
yet.

The starting concepts come from the course's node/state design lesson, design-document-to-
conversation walkthrough, and revised narrative JSON specification. This README is
self-contained so it remains useful when the folder becomes a separate repository.
