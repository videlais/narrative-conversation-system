using System;
using UnityEngine;
using Videlais.Narrative.Unity;

namespace Videlais.Narrative.Sample
{
    public sealed class NarrativeDemo : MonoBehaviour
    {
        [SerializeField] private TextAsset conversationJson;
        [SerializeField] private TextAsset barkJson;
        [SerializeField] private FactRegistry registry;
        private FactStore facts;
        private ConversationSession conversation;
        private BarkSession barks;
        private string lastBark = "Press Enter zone to request a bark.";
        private Vector2 scroll;

        private void Start()
        {
            if (conversationJson == null || barkJson == null || registry == null)
                throw new InvalidOperationException("Assign both JSON TextAssets and a FactRegistry to the demo.");
            facts = registry.CreateStore();
            conversation = new ConversationSession(NarrativeJson.LoadStory(conversationJson.text), facts);
            barks = new BarkSession(NarrativeJson.LoadBarks(barkJson.text), facts, new System.Random(7));
        }

        private void OnGUI()
        {
            if (conversation == null) return;
            GUILayout.BeginArea(new Rect(10, 10, Mathf.Min(720, Screen.width - 20), Screen.height - 20), GUI.skin.box);
            scroll = GUILayout.BeginScrollView(scroll);
            GUILayout.Label("Shared facts: conversation + Mara's barks");
            GUILayout.Label(conversation.CurrentNode.Speaker + ": " + conversation.CurrentNode.Text);
            foreach (var choice in conversation.GetAvailableChoices())
                if (GUILayout.Button(choice.Text)) conversation.Choose(choice);
            GUILayout.Label("Conversation: " + conversation.Status);
            GUILayout.Label("accepted_task = " + Read("accepted_task") + "; read_report = " + Read("read_report"));
            if (GUILayout.Button("Restart conversation (keep shared facts)")) conversation.Restart();
            GUILayout.Space(20);
            GUILayout.Label("Barks: EnterZone trigger (cooldowns use unscaled time)");
            SetBoolButton("bossPresent", "Boss present");
            SetBoolButton("experimentsDiscovered", "Experiments discovered");
            facts.TryGet("healthFraction", out var health);
            if (GUILayout.Button("Health: " + health + " (toggle hurt/healthy)"))
                facts.Set("healthFraction", FactValue.Float(health.AsFloat() < 0.4 ? 1 : 0.3));
            facts.TryGet("zone", out var zone);
            if (GUILayout.Button("Zone: " + zone + " (toggle lab/hall)"))
                facts.Set("zone", FactValue.String(zone.AsString() == "lab" ? "hall" : "lab"));
            facts.TryGet("supplies", out var supplies);
            if (GUILayout.Button("Supplies: " + supplies + " (toggle 0/3)"))
                facts.Set("supplies", FactValue.Int(supplies.AsInt() == 0 ? 3 : 0));
            if (GUILayout.Button("Enter zone"))
                lastBark = barks.TrySelect("EnterZone", Time.unscaledTimeAsDouble, out var bark)
                    ? bark.CharacterName + " [" + bark.RuleId + "]: " + bark.Text
                    : "No eligible bark (including cooldown/play-once checks).";
            GUILayout.Label(lastBark);
            if (GUILayout.Button("Reset bark history only")) barks.ResetHistory();
            if (GUILayout.Button("Reset all facts, conversation, and bark history"))
            {
                facts.Reset();
                conversation.Restart();
                barks.ResetHistory();
                lastBark = "Reset complete.";
            }
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        private bool Read(string key)
        {
            if (!facts.TryGet(key, out var value)) throw new InvalidOperationException($"Demo fact '{key}' was deleted.");
            return value.AsBool();
        }

        private void SetBoolButton(string key, string label)
        {
            bool current = Read(key);
            if (GUILayout.Button(label + ": " + current)) facts.Set(key, FactValue.Bool(!current));
        }
    }
}
