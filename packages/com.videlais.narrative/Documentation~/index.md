# Using the Unity package

## Install and try

Use Package Manager to install this package from disk by selecting its `package.json`,
or use the repository's Git URL with `?path=/packages/com.videlais.narrative` once published.
Append `#` followed by an existing release tag/full commit hash for reproducible installs.
Unity 6.0 is the declared minimum; Newtonsoft JSON is an automatic dependency.

Import **Conversation and Barks** from the package's Samples section. In an empty scene,
choose **GameObject > Narrative > Conversation and Barks Demo**, press Play, and use the
Game view buttons. The sample uses built-in IMGUI and needs no UI assets.

Read the report in the conversation, return to the hub, and tell Mara about the experiments.
Request **Enter zone** while in the lab, healthy, and without a boss. Mara's discovery
rule uses the fact set by the conversation and plays only once per bark-session history.

## Integrate

Create an asset with **Assets > Create > Narrative > Fact Registry**. Set each entry's key,
type, and matching initial field. Nonmatching fields are ignored. Create one runtime store
and give it to both systems:

```csharp
var facts = registry.CreateStore();
var conversation = new Videlais.Narrative.ConversationSession(
    Videlais.Narrative.NarrativeJson.LoadStory(storyTextAsset.text), facts);
var barks = new Videlais.Narrative.BarkSession(
    Videlais.Narrative.NarrativeJson.LoadBarks(barkTextAsset.text), facts);
```

Present `conversation.CurrentNode`, bind buttons to `conversation.GetAvailableChoices()`,
and pass a returned Choice to `conversation.Choose(choice)`. Choice Actions run before
navigation and recheck eligibility; blocked nodes are not endings.

Call `barks.TrySelect(trigger, Time.unscaledTimeAsDouble, out var bark)`. False/null means
no eligible bark, not a configuration error. A selection consumes cooldown/play-once
history immediately, even if the host later decides not to display it. Priority wins
first, condition count breaks priority ties, remaining ties and line alternatives are
random. Inject `System.Random` into the session constructor to control randomness.

Only Choice objects have Actions. Both systems share the same Condition schema.
Conditions contain `fact`, `comparison`, and exactly one of `intValue`, `floatValue`,
`stringValue`, `boolValue`. Use `notEquals`, not `notEqual`; do not include `type` or
`specificity`. Facts are externally registered, never embedded in Story/BarkSet JSON.
Unknown keys and mismatched types throw. Deleted values fail every comparison.

`FactStore.Reset()` restores initial values. Conversation restart changes only navigation;
bark-history reset changes only cooldown/play-once/clock history. Assets remain unchanged.
The host owns save/load, audio, UI, queues, and interruption policy.

For your own game state implement `Videlais.Narrative.IFactStore` with strict registered-key
and type checks, distinct deleted values, and validation-before-mutation. Do not silently
return false for an unknown key. Reference the `Videlais.Narrative` assembly; add
`Videlais.Narrative.Unity` to use `FactRegistry`.

See the repository's [README](https://github.com/videlais/narrative-conversation-system#readme)
for full JSON tables, examples, and adaptation guidance for boolean KnowledgeRegistry assets.

## Tests

Install Unity Test Framework and add `"testables": ["com.videlais.narrative"]` at the top
level of your Unity project's package manifest. Run EditMode tests in Test Runner.
The imported sample includes a smoke test that enters and exits Play Mode.
