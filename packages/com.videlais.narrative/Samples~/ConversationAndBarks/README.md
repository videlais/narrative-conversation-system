# Conversation and Barks sample

After importing this sample through Package Manager:

1. In an empty scene choose **GameObject > Narrative > Conversation and Barks Demo**.
2. Press Play and use the Game view. No camera, Canvas, or UI package is required.
3. Read the report, return to the hub, and tell Mara about the experiments.
4. Press **Enter zone** with `zone = lab`, full health, and no boss.
   The dialogue-unlocked discovery bark plays once; subsequent requests fall back to
   eligible lab/general rules.
5. Toggle the other facts to test boss priority, hurt/supplies rules, cooldowns, and resets.

The menu assigns `conversation.json`, `mara.json`, and `DemoFacts.asset` to `NarrativeDemo`.
You can instead add that component manually and assign these three assets in the Inspector.
Save the generated scene normally if you want to reuse it in your project or a build.

Both systems receive the same runtime store. The registry asset defines initial values only
and is never modified by play. Restarting the conversation preserves facts; the full-reset
button restores facts and resets both sessions. The sample is an integration demonstration,
not a production dialogue UI. It requires Unity's built-in IMGUI module.
