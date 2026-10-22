# Narrative Conversation System

A starting point for a data-driven narrative conversation project: turn scene outlines,
character models, and story-bible material into structured conversations that a runtime can
interpret. The project emphasizes writing and narrative design while separating authored
content, conversation navigation, shared game state, and presentation.

The repository also contains a **Unity 6 UPM package** for C# conversations and
single-character banter/barks. Both systems use the same typed facts and Conditions.
The existing browser tools remain JavaScript; no separate TypeScript project is required.
See [Unity installation and samples](#unity-upm-package).

## Dialogue/conversation model

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

## Banter/bark model

A **BarkSet** describes a character's responses to game events. Unlike a conversation,
a bark does not navigate a graph or wait for a player Choice. The host requests a trigger,
the runtime selects at most one eligible **BarkRule**, and returns one line as a **Bark**.
"Banter" here means a single-character reactive line, not a multi-speaker exchange.
Use a Story for an exchange with multiple speakers or player-driven progression.

All properties below are required in bark JSON:

| Structure | Property | Type | Meaning |
|-----------|----------|------|---------|
| BarkSet | `characterId` | string | Stable, nonblank speaker identifier |
| BarkSet | `characterName` | string | Nonblank display name |
| BarkSet | `rules` | Array<BarkRule> | Rules for this character; `[]` produces no barks |
| BarkRule | `id` | string | Nonblank ID, unique within the set |
| BarkRule | `trigger` | string | Nonblank event name, matched exactly and case-sensitively |
| BarkRule | `conditions` | Array<Condition> | Same Condition objects as dialogue; AND, with `[]` unconditional |
| BarkRule | `priority` | integer | Signed 32-bit ranking; higher wins |
| BarkRule | `cooldownSeconds` | number | Finite, nonnegative delay between selections of this rule |
| BarkRule | `playOnce` | boolean | At most one selection until this session's history is reset |
| BarkRule | `lines` | Array<string> | At least one nonblank alternative line |

For example:

```json
{
  "characterId": "mara",
  "characterName": "Mara",
  "rules": [
    {
      "id": "enter_lab",
      "trigger": "EnterZone",
      "conditions": [
        { "fact": "zone", "comparison": "equals", "stringValue": "lab" }
      ],
      "priority": 0,
      "cooldownSeconds": 8,
      "playOnce": false,
      "lines": ["Someone left this lab in a hurry.", "Stay close."]
    }
  ]
}
```

### Bark selection and lifetime

For each request, the runtime:

1. Matches the trigger and excludes rules on cooldown or already consumed by `playOnce`.
2. Evaluates Conditions against the current shared facts.
3. Keeps the highest priority, then the highest **specificity** (number of Conditions).
4. Randomly chooses among tied rules, then randomly chooses one of its lines.
5. Records the selected rule's time/history and returns a Bark with `CharacterId`,
   `CharacterName`, `RuleId`, and `Text`.

Both random selections are uniform; repeated lines are allowed. An optional `System.Random`
can be injected for reproducible tests. No eligible rule is an ordinary result:
`TrySelect` returns `false` with a null Bark. Invalid content or state configuration throws;
it is not treated as "no bark."

The host supplies finite, nonnegative, monotonically nondecreasing seconds, for example
`Time.unscaledTimeAsDouble`. A rule becomes eligible exactly at its cooldown boundary.
History is recorded on selection, not after audio/UI completion. If the winning rule is
on cooldown, a lower-ranked eligible rule can play. There is no global character cooldown,
queue, audio scheduling, subtitle duration, or conversation-interruption policy; the host
controls when requests are made and what happens to the result.

One `BarkSession` holds one character set and its per-rule history. Reuse that session
for persistent character history; separate sessions have independent histories.
`ResetHistory()` clears cooldowns, play-once records, and the clock baseline without
changing facts. Play-once is session-local, not a saved-game guarantee.

### Shared objects and normalization

Dialogue Choices and BarkRules use the **same Condition model, parser, type checks, and
evaluator**. Both sessions take an `IFactStore`; passing the same instance lets a dialogue
Action immediately affect bark eligibility. Actions are currently supported only by
Choices; barks have no Action field.

The supplied Mara example is normalized in the
[Unity sample](packages/com.videlais.narrative/Samples~/ConversationAndBarks/mara.json):

- Remove redundant Condition `type` fields; the single typed operand determines its type.
- Rename `notEqual` to the shared spelling `notEquals`.
- Remove authored `specificity`; the runtime derives it from `conditions.Count`.

The Unity loaders reject these legacy fields/spellings rather than silently migrating them.
They also reject unknown properties, duplicate IDs/properties, missing required fields,
invalid targets, invalid operands, and illegal operations. Loading validates structure;
constructing a session additionally validates **all** fact references/types, even in
unreachable nodes or currently ineligible rules. Content objects are read-only after loading.
The existing web tools remain conversation-only; they do not edit or play bark sets.

## Unity UPM package

The source-based package is in
[`packages/com.videlais.narrative/`](packages/com.videlais.narrative/).
Its declared minimum is Unity **6.0** (`6000.0`). Newtonsoft JSON is declared as a UPM
dependency so absent operands can be distinguished from explicit `0` and `false`.
There is no compiled DLL, native plugin, or TypeScript build step.

```text
packages/com.videlais.narrative/
  package.json
  Runtime/
    Core/          Engine-independent C# models, JSON loaders, facts, and sessions
    Unity/         FactRegistry ScriptableObject and separate Unity assembly
  Tests/Editor/    Runtime contracts and Unity registry tests
  Samples~/
    ConversationAndBarks/
      conversation.json
      mara.json
      DemoFacts.asset
      NarrativeDemo.cs
      Editor/      Demo creation menu and sample smoke test
  Documentation~/
```

### Installation

For local development, open **Window > Package Management > Package Manager**, choose
**Install package from disk** (wording varies by Editor version), and select the package's
[`package.json`](packages/com.videlais.narrative/package.json).
The surrounding repository does not need to be a Unity project.

Once these changes are published, users with Git installed can use **Install package from
Git URL**:

```text
https://github.com/videlais/narrative-conversation-system.git?path=/packages/com.videlais.narrative
```

For releases, append an existing release tag or full commit hash after `#` to pin a version.
No Unity release tag is assumed to exist yet. UPM is the primary distribution: it isolates
package code, declares dependencies, and supports explicit version upgrades. A
`.unitypackage` could later provide an additional download-and-import route, but no separate
export is maintained here.

### ScriptableObject facts and the supplied KnowledgeRegistry

Create a **Narrative > Fact Registry** asset from the Assets/Create menu. Each entry has a
key, a `FactType`, and initial value fields; only the field matching its type is used.
Duplicate/blank keys, invalid numeric values, and unsupported types fail when creating a store.
The Unity representation uses a JSON-safe `long` for `intValue`, a finite `double` for
`floatValue`, ordinal strings, and booleans. Integers retain the web contract's range of
`-9007199254740991` through `9007199254740991`, not the full range of C# `long`.

The asset is a **definition of initial facts**, not mutable game state.
`FactRegistry.CreateStore()` creates an independent runtime `FactStore`. Call it once in
the host and pass that same store to conversations and barks that should share knowledge.
Calling it twice intentionally creates isolated worlds. Runtime changes do not modify the
asset or leak into subsequent Play sessions.

The supplied `KnowledgeRegistry` follows a useful strict-key, ordinal-dictionary pattern,
but its public API only exposes `GetBool`/`SetBool`. It cannot directly supply numeric/string
facts, enumerate definitions, or represent deleted values. This package therefore supplies
a typed alternative rather than copying or coupling to that application-specific class.

For an existing game's state, implement `IFactStore` in the host project:

| Member | Required behavior |
|--------|-------------------|
| `GetFactType(key)` | Return the registered type; throw for an unknown/blank key |
| `TryGet(key, out value)` | Return false only for a registered, deleted value; unknown keys throw |
| `Set(key, value)` | Validate registration/type/value before mutation; restore deleted values |
| `Delete(key)` | Delete the current value, retain registration; repeated deletion is harmless |

A boolean-only adapter can wrap the supplied registry using an explicit known-key list,
delegate reads/writes to `GetBool`/`SetBool`, and track deleted keys separately. It must
reject nonboolean operands and clear deletion markers on successful writes. It cannot
support the full Mara sample unchanged because that sample uses all four fact types.
If deletion must be visible to every consumer (including code that bypasses the adapter),
extend the original registry's API instead. Keep a single source of truth rather than
copying values between two independently mutable registries.

The host owns store lifetime, resets, and persistence. `FactStore.Reset()` restores its
creation-time initial values, including deleted facts. `ConversationSession.Restart()`
resets navigation **only**; it does not undo world state or bark history. This differs from
the browser player's Start-snapshot restart and avoids one conversation resetting another
system's shared facts. Save-game serialization is not included.

### Using the objects from C#

`TextAsset` references hold the imported JSON; `FactRegistry` is an Inspector-assigned
asset. Parse and construct sessions once, then use the returned objects from game/UI code:

```csharp
using Videlais.Narrative;
using Videlais.Narrative.Unity;
using UnityEngine;

public sealed class NarrativeHost : MonoBehaviour
{
    [SerializeField] private FactRegistry registry;
    [SerializeField] private TextAsset storyJson;
    [SerializeField] private TextAsset barkJson;

    public ConversationSession Conversation { get; private set; }
    private FactStore facts;
    private BarkSession barks;

    private void Awake()
    {
        facts = registry.CreateStore();
        Conversation = new ConversationSession(NarrativeJson.LoadStory(storyJson.text), facts);
        barks = new BarkSession(NarrativeJson.LoadBarks(barkJson.text), facts);
    }

    public void Choose(Choice choice) => Conversation.Choose(choice);

    public void EnterZone(string zone)
    {
        facts.Set("zone", FactValue.String(zone));
        if (barks.TrySelect("EnterZone", Time.unscaledTimeAsDouble, out var bark))
            Debug.Log(bark.CharacterName + ": " + bark.Text);
    }
}
```

Render `Conversation.CurrentNode` and bind buttons to the Choice objects returned by
`GetAvailableChoices()`. `Choose` rejects stale/foreign Choices and rechecks Conditions
before applying its Action and navigating. Failed Actions preserve facts and navigation.
`Status` distinguishes `Ready`, `Blocked`, and `Ended`. There is no automatic progression
or built-in production UI.

For projects using assembly definitions, reference `Videlais.Narrative` and, when using
the ScriptableObject asset, `Videlais.Narrative.Unity`. Custom `IFactStore` implementations
must validate before mutation to preserve the Action failure guarantee. Handle reported
configuration errors in your host's normal error UI/logging; do not turn them into empty
stories or no-bark results.
The C# model for a JSON Action is named `FactAction` to distinguish it from `System.Action`.

### Working conversation and bark sample

1. Select this package in Package Manager, expand **Samples**, and import
   **Conversation and Barks**. The demo uses Unity's built-in IMGUI module, not a Canvas,
   UI Toolkit, or an external UI package.
2. In an empty scene, choose **GameObject > Narrative > Conversation and Barks Demo**.
   The menu creates a component and assigns both JSON TextAssets and `DemoFacts.asset`.
3. Press Play and use the Game view's conversation buttons. Accept/refuse the job,
   read the report, return to the question hub, and tell Mara about the experiments.
4. With `zone = lab`, healthy Mara, and no boss, press **Enter zone**. After the dialogue
   reveals the experiments, `enter_discovery` wins and plays once. Request again to hear
   a lower-ranked lab/general bark while other rules are unavailable.
5. Toggle boss/health/zone/supplies to exercise the original Mara rules. The boss rule
   has priority 10, discovery 2, hurt/supplies 1, and lab/general 0. On cooldown, higher
   priority rules no longer suppress eligible lower ones.
6. Try navigation-only restart, bark-history reset, and full reset to see the separate
   lifetimes. No setup changes are written into the registry asset during play.

The normalized bark sample contains all six supplied rules. The conversation is a
compact foldback/question-hub example that writes `experimentsDiscovered`, demonstrating
real state sharing with barks rather than two disconnected demos.

### Tests

In a consuming Unity project's package manifest, add
`"testables": ["com.videlais.narrative"]` alongside `dependencies` and install Unity Test
Framework if it is not already present. Run the package's **EditMode** tests in Test Runner.
Importing the sample also makes its smoke test available; that test enters Play Mode,
creates the configured demo, and checks initialization. Tests cover typed operations,
atomic errors, navigation, validation, bark ranking, ties, cooldown boundaries, play-once,
registry isolation, and the conversation-to-bark discovery path.
Test assemblies are gated on Test Framework availability; importing the runtime and sample
does not require installing test tooling.

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
