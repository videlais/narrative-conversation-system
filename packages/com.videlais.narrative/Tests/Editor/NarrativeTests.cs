using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;
using UnityEngine;
using Videlais.Narrative.Unity;

namespace Videlais.Narrative.Tests
{
    public sealed class NarrativeTests
    {
        private static FactStore Store(FactValue value) =>
            new FactStore(new[] { new KeyValuePair<string, FactValue>("x", value) });

        private static string StoryJson(string conditions = "[]", string action = "null") =>
            "{\"start\":\"start\",\"nodes\":[{\"id\":\"start\",\"speaker\":\"a\",\"text\":\"hello\",\"choices\":[" +
            "{\"text\":\"Go\",\"target\":\"end\",\"conditions\":" + conditions + ",\"action\":" + action + "}]}," +
            "{\"id\":\"end\",\"speaker\":\"b\",\"text\":\"bye\",\"choices\":[]}]}";

        private static string Rule(string id, int priority = 0, string conditions = "[]",
            double cooldown = 0, bool once = false, string trigger = "Enter") =>
            "{\"id\":\"" + id + "\",\"trigger\":\"" + trigger + "\",\"conditions\":" + conditions +
            ",\"priority\":" + priority + ",\"cooldownSeconds\":" +
            cooldown.ToString(System.Globalization.CultureInfo.InvariantCulture) +
            ",\"playOnce\":" + (once ? "true" : "false") + ",\"lines\":[\"one\",\"two\"]}";

        private static BarkSet Barks(params string[] rules) => NarrativeJson.LoadBarks(
            "{\"characterId\":\"mara\",\"characterName\":\"Mara\",\"rules\":[" + string.Join(",", rules) + "]}");

        private static string Condition(string comparison, string operand) =>
            "[{\"fact\":\"x\",\"comparison\":\"" + comparison + "\"," + operand + "}]";

        [Test]
        public void StoreSeparatesDefinitionsDeletedValuesAndInitialValues()
        {
            var facts = Store(FactValue.Bool(false));
            Assert.That(facts.TryGet("x", out var value), Is.True);
            Assert.That(value.AsBool(), Is.False);
            facts.Delete("x");
            facts.Delete("x");
            Assert.That(facts.GetFactType("x"), Is.EqualTo(FactType.Bool));
            Assert.That(facts.TryGet("x", out _), Is.False);
            facts.Set("x", FactValue.Bool(true));
            Assert.That(facts.TryGet("x", out value), Is.True);
            Assert.That(value.AsBool(), Is.True);
            facts.Reset();
            facts.TryGet("x", out value);
            Assert.That(value.AsBool(), Is.False);
            Assert.Throws<KeyNotFoundException>(() => facts.TryGet("X", out _));
            Assert.Throws<KeyNotFoundException>(() => facts.Delete("unknown"));
            Assert.Throws<KeyNotFoundException>(() => facts.Set("unknown", FactValue.Bool(true)));
            Assert.Throws<ArgumentException>(() => facts.Set("x", FactValue.Int(0)));
            Assert.Throws<ArgumentException>(() => new FactStore(new[] {
                new KeyValuePair<string, FactValue>("x", FactValue.Int(0)),
                new KeyValuePair<string, FactValue>("x", FactValue.Int(1)) }));
            Assert.Throws<ArgumentException>(() => new FactStore(new[] {
                new KeyValuePair<string, FactValue>(" ", FactValue.Int(0)) }));
            Assert.Throws<InvalidOperationException>(() => Store(default));
        }

        [TestCase("equals", false, true, false)]
        [TestCase("notEquals", true, false, true)]
        [TestCase("lessThan", true, false, false)]
        [TestCase("greaterThan", false, false, true)]
        [TestCase("greaterThanEqual", false, true, true)]
        [TestCase("lessThanEqual", true, true, false)]
        public void NumericComparisonBoundaries(string comparison, bool below, bool equal, bool above)
        {
            foreach (bool floating in new[] { false, true })
            {
                var story = NarrativeJson.LoadStory(StoryJson(Condition(comparison,
                    floating ? "\"floatValue\":5" : "\"intValue\":5")));
                var expected = new[] { below, equal, above };
                for (int i = 0; i < 3; i++)
                {
                    var facts = Store(floating ? FactValue.Float(i + 4) : FactValue.Int(i + 4));
                    var session = new ConversationSession(story, facts);
                    Assert.That(session.GetAvailableChoices().Count, Is.EqualTo(expected[i] ? 1 : 0));
                    facts.Delete("x");
                    Assert.That(session.Status, Is.EqualTo(ConversationStatus.Blocked));
                }
            }
        }

        [TestCase("\"boolValue\":false", false)]
        [TestCase("\"stringValue\":\"\"", true)]
        public void NonNumericEqualityAndMissingValues(string operand, bool isString)
        {
            var facts = Store(isString ? FactValue.String("") : FactValue.Bool(false));
            var story = NarrativeJson.LoadStory(StoryJson(Condition("equals", operand)));
            var session = new ConversationSession(story, facts);
            Assert.That(session.GetAvailableChoices().Count, Is.EqualTo(1));
            facts.Delete("x");
            Assert.That(session.GetAvailableChoices(), Is.Empty);
        }

        [Test]
        public void ConditionsAreAndAndValidateEveryReference()
        {
            var conditions = "[{\"fact\":\"x\",\"comparison\":\"equals\",\"boolValue\":false}," +
                "{\"fact\":\"y\",\"comparison\":\"equals\",\"boolValue\":true}]";
            var story = NarrativeJson.LoadStory(StoryJson(conditions));
            Assert.Throws<KeyNotFoundException>(() => new ConversationSession(story, Store(FactValue.Bool(true))));
            var facts = new FactStore(new[] {
                new KeyValuePair<string, FactValue>("x", FactValue.Bool(false)),
                new KeyValuePair<string, FactValue>("y", FactValue.Bool(true)) });
            var session = new ConversationSession(story, facts);
            Assert.That(session.Status, Is.EqualTo(ConversationStatus.Ready));
            facts.Set("y", FactValue.Bool(false));
            Assert.That(session.Status, Is.EqualTo(ConversationStatus.Blocked));
        }

        [TestCase("{\"fact\":\"x\",\"action\":\"update\",\"boolValue\":true}")]
        [TestCase("{\"fact\":\"x\",\"action\":\"delete\"}")]
        public void ActionsApplyBeforeNavigationAndRestartKeepsFacts(string action)
        {
            var facts = Store(FactValue.Bool(false));
            var session = new ConversationSession(NarrativeJson.LoadStory(StoryJson(action: action)), facts);
            session.Choose(session.GetAvailableChoices()[0]);
            Assert.That(session.Status, Is.EqualTo(ConversationStatus.Ended));
            bool exists = facts.TryGet("x", out var value);
            Assert.That(exists, Is.EqualTo(!action.Contains("delete")));
            if (exists) Assert.That(value.AsBool(), Is.True);
            session.Restart();
            Assert.That(session.CurrentNode.Id, Is.EqualTo("start"));
            Assert.That(facts.TryGet("x", out value), Is.EqualTo(exists));
            if (exists) Assert.That(value.AsBool(), Is.True);
        }

        [TestCase("intValue", "add", "5", "2", "7")]
        [TestCase("intValue", "subtract", "5", "2", "3")]
        [TestCase("floatValue", "add", "0.25", "0.5", "0.75")]
        [TestCase("floatValue", "subtract", "0.75", "0.5", "0.25")]
        [TestCase("stringValue", "add", "\"a\"", "\"b\"", "\"ab\"")]
        public void Arithmetic(string type, string action, string initial, string operand, string expected)
        {
            var facts = Store(Value(type, initial));
            var session = new ConversationSession(NarrativeJson.LoadStory(StoryJson(action:
                "{\"fact\":\"x\",\"action\":\"" + action + "\",\"" + type + "\":" + operand + "}")), facts);
            session.Choose(session.GetAvailableChoices()[0]);
            facts.TryGet("x", out var value);
            Assert.That(value.SameValue(Value(type, expected)), Is.True);
        }

        private static FactValue Value(string type, string json)
        {
            var story = NarrativeJson.LoadStory(StoryJson(Condition("equals", "\"" + type + "\":" + json)));
            return story.Nodes[0].Choices[0].Conditions[0].Value;
        }

        [TestCase("intValue", "9007199254740991", "1")]
        [TestCase("floatValue", "1e308", "1e308")]
        public void FailedArithmeticIsAtomic(string type, string initial, string operand)
        {
            var original = Value(type, initial);
            var facts = Store(original);
            var session = new ConversationSession(NarrativeJson.LoadStory(StoryJson(action:
                "{\"fact\":\"x\",\"action\":\"add\",\"" + type + "\":" + operand + "}")), facts);
            Assert.Throws<ArgumentOutOfRangeException>(() => session.Choose(session.GetAvailableChoices()[0]));
            Assert.That(session.CurrentNode.Id, Is.EqualTo("start"));
            facts.TryGet("x", out var value);
            Assert.That(value.SameValue(original), Is.True);
            facts.Delete("x");
            Assert.Throws<InvalidOperationException>(() => session.Choose(session.GetAvailableChoices()[0]));
            Assert.That(facts.TryGet("x", out _), Is.False);
            Assert.That(session.CurrentNode.Id, Is.EqualTo("start"));
        }

        [Test]
        public void ChoicesMustBeCurrentAndStillEligible()
        {
            var facts = Store(FactValue.Bool(true));
            var story = NarrativeJson.LoadStory(StoryJson(Condition("equals", "\"boolValue\":true")));
            var session = new ConversationSession(story, facts);
            var choice = session.GetAvailableChoices()[0];
            facts.Set("x", FactValue.Bool(false));
            Assert.Throws<InvalidOperationException>(() => session.Choose(choice));
            facts.Set("x", FactValue.Bool(true));
            session.Choose(choice);
            Assert.Throws<ArgumentException>(() => session.Choose(choice));
        }

        [TestCase("{\"fact\":\"x\",\"comparison\":\"notEqual\",\"intValue\":0}")]
        [TestCase("{\"fact\":\"x\",\"type\":\"int\",\"comparison\":\"equals\",\"intValue\":0}")]
        [TestCase("{\"fact\":\"x\",\"comparison\":\"equals\",\"intValue\":0,\"boolValue\":false}")]
        [TestCase("{\"fact\":\"x\",\"comparison\":\"equals\"}")]
        [TestCase("{\"fact\":\"x\",\"comparison\":\"lessThan\",\"boolValue\":false}")]
        [TestCase("{\"fact\":\"x\",\"comparison\":\"equals\",\"intValue\":9007199254740992}")]
        [TestCase("{\"fact\":\"x\",\"comparison\":\"equals\",\"intValue\":1.5}")]
        [TestCase("{\"fact\":\"x\",\"comparison\":\"equals\",\"floatValue\":1e999}")]
        [TestCase("{\"fact\":\"x\",\"comparison\":\"equals\",\"boolValue\":\"true\"}")]
        public void MalformedConditionsFail(string condition) =>
            Assert.Throws<FormatException>(() => NarrativeJson.LoadStory(StoryJson("[" + condition + "]")));

        [TestCase("{\"fact\":\"x\",\"action\":\"delete\",\"intValue\":0}")]
        [TestCase("{\"fact\":\"x\",\"action\":\"add\",\"boolValue\":true}")]
        [TestCase("{\"fact\":\"x\",\"action\":\"subtract\",\"stringValue\":\"a\"}")]
        [TestCase("{\"fact\":\"x\",\"action\":\"update\"}")]
        [TestCase("\"legacy\"")]
        public void MalformedActionsFail(string action) =>
            Assert.Throws<FormatException>(() => NarrativeJson.LoadStory(StoryJson(action: action)));

        [Test]
        public void InvalidStoryStructureAndRegistryMismatchFail()
        {
            Assert.Throws<FormatException>(() => NarrativeJson.LoadStory(StoryJson().Replace("\"start\":\"start\"", "\"start\":\"missing\"")));
            Assert.Throws<FormatException>(() => NarrativeJson.LoadStory(StoryJson().Replace("\"target\":\"end\"", "\"target\":\"missing\"")));
            Assert.Throws<FormatException>(() => NarrativeJson.LoadStory(StoryJson().Replace("\"id\":\"end\"", "\"id\":\"start\"")));
            Assert.Throws<FormatException>(() => NarrativeJson.LoadStory(StoryJson().Replace("\"start\":\"start\"", "\"registry\":[],\"start\":\"start\"")));
            Assert.That(() => NarrativeJson.LoadStory(
                StoryJson().Replace("\"start\":\"start\"", "\"start\":\"start\",\"start\":\"end\"")),
                Throws.Exception.With.Message.Contains("already exists"));
            var story = NarrativeJson.LoadStory(StoryJson(Condition("equals", "\"intValue\":0")));
            Assert.Throws<ArgumentException>(() => new ConversationSession(story, Store(FactValue.Float(0))));
            Assert.Throws<KeyNotFoundException>(() => new BarkSession(Barks(Rule("x", conditions:
                Condition("equals", "\"boolValue\":false"))), new FactStore(Array.Empty<KeyValuePair<string, FactValue>>())));
        }

        [Test]
        public void BarkRankingCooldownBoundaryAndPlayOnce()
        {
            var facts = Store(FactValue.Bool(true));
            var condition = Condition("equals", "\"boolValue\":true");
            var set = Barks(Rule("general"), Rule("specific", conditions: condition, cooldown: 8),
                Rule("priority", 10, cooldown: 10), Rule("once", 20, once: true));
            var session = new BarkSession(set, facts, new System.Random(7));
            Assert.That(session.TrySelect("Enter", 0, out var bark), Is.True);
            Assert.That(bark.RuleId, Is.EqualTo("once"));
            session.TrySelect("Enter", 0, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("priority"));
            session.TrySelect("Enter", 0, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("specific"));
            session.TrySelect("Enter", 0, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("general"));
            session.TrySelect("Enter", 7.999, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("general"));
            session.TrySelect("Enter", 8, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("specific"));
            session.TrySelect("Enter", 10, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("priority"));
            session.ResetHistory();
            session.TrySelect("Enter", 0, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("once"));
            var independent = new BarkSession(set, facts);
            independent.TrySelect("Enter", 0, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("once"));
        }

        [Test]
        public void BarkNoMatchClockAndLiveFacts()
        {
            var facts = Store(FactValue.Bool(false));
            var session = new BarkSession(Barks(Rule("only", conditions: Condition("equals", "\"boolValue\":true"), cooldown: 2)), facts);
            Assert.That(session.TrySelect("Other", 0, out var bark), Is.False);
            Assert.That(bark, Is.Null);
            Assert.That(session.TrySelect("Enter", 0, out _), Is.False);
            facts.Set("x", FactValue.Bool(true));
            Assert.That(session.TrySelect("Enter", 0, out _), Is.True);
            Assert.That(session.TrySelect("Enter", 1.999, out _), Is.False);
            Assert.That(session.TrySelect("Enter", 2, out _), Is.True);
            Assert.Throws<ArgumentOutOfRangeException>(() => session.TrySelect("Enter", 1, out _));
            Assert.Throws<ArgumentOutOfRangeException>(() => session.TrySelect("Enter", double.NaN, out _));
            Assert.Throws<ArgumentOutOfRangeException>(() => session.TrySelect("Enter", double.PositiveInfinity, out _));
            Assert.Throws<ArgumentException>(() => session.TrySelect(" ", 3, out _));
        }

        [Test]
        public void BarkTiesAndLineSelectionUseInjectedRandom()
        {
            var set = Barks(Rule("a"), Rule("b"));
            var first = new BarkSession(set, Store(FactValue.Bool(true)), new System.Random(42));
            var second = new BarkSession(set, Store(FactValue.Bool(true)), new System.Random(42));
            var seen = new HashSet<string>();
            for (int i = 0; i < 100; i++)
            {
                first.TrySelect("Enter", i, out var a);
                second.TrySelect("Enter", i, out var b);
                Assert.That(a.RuleId + a.Text, Is.EqualTo(b.RuleId + b.Text));
                seen.Add(a.RuleId + a.Text);
            }
            Assert.That(seen.Count, Is.EqualTo(4));
        }

        [Test]
        public void InvalidBarkStructuresFail()
        {
            foreach (var rule in new[] {
                Rule("a").Replace("\"lines\":[\"one\",\"two\"]", "\"lines\":[]"),
                Rule("a").Replace("\"cooldownSeconds\":0", "\"cooldownSeconds\":-1"),
                Rule("a").Replace("\"priority\":0", "\"priority\":0,\"specificity\":0"),
                Rule("a").Replace("\"priority\":0", "\"priority\":0.5") })
                Assert.Throws<FormatException>(() => Barks(rule));
            Assert.Throws<FormatException>(() => Barks(Rule("a"), Rule("a")));
        }

        [Test]
        public void RegistryCreatesIsolatedRuntimeStores()
        {
            var registry = ScriptableObject.CreateInstance<FactRegistry>();
            try
            {
                var serialized = new SerializedObject(registry);
                var entries = serialized.FindProperty("entries");
                entries.arraySize = 1;
                var entry = entries.GetArrayElementAtIndex(0);
                entry.FindPropertyRelative("key").stringValue = "x";
                entry.FindPropertyRelative("type").enumValueIndex = (int)FactType.Bool;
                entry.FindPropertyRelative("boolValue").boolValue = false;
                serialized.ApplyModifiedPropertiesWithoutUndo();
                var first = registry.CreateStore();
                var second = registry.CreateStore();
                first.Set("x", FactValue.Bool(true));
                second.TryGet("x", out var value);
                Assert.That(value.AsBool(), Is.False);
                registry.CreateStore().TryGet("x", out value);
                Assert.That(value.AsBool(), Is.False);
            }
            finally { UnityEngine.Object.DestroyImmediate(registry); }
        }

        [Test]
        public void ShippedConversationAndBarksShareDiscoveryFact()
        {
            var path = PackageInfo.FindForAssembly(typeof(FactRegistry).Assembly).resolvedPath;
            var sample = Path.Combine(path, "Samples~/ConversationAndBarks");
            var facts = new FactStore(new[] {
                new KeyValuePair<string, FactValue>("accepted_task", FactValue.Bool(false)),
                new KeyValuePair<string, FactValue>("read_report", FactValue.Bool(false)),
                new KeyValuePair<string, FactValue>("experimentsDiscovered", FactValue.Bool(false)),
                new KeyValuePair<string, FactValue>("zone", FactValue.String("lab")),
                new KeyValuePair<string, FactValue>("healthFraction", FactValue.Float(1)),
                new KeyValuePair<string, FactValue>("supplies", FactValue.Int(0)),
                new KeyValuePair<string, FactValue>("bossPresent", FactValue.Bool(false)) });
            var conversation = new ConversationSession(NarrativeJson.LoadStory(File.ReadAllText(Path.Combine(sample, "conversation.json"))), facts);
            var barks = new BarkSession(NarrativeJson.LoadBarks(File.ReadAllText(Path.Combine(sample, "mara.json"))), facts);
            conversation.Choose(conversation.GetAvailableChoices()[0]);
            Assert.That(conversation.GetAvailableChoices().Any(c => c.Target == "discovery"), Is.False);
            conversation.Choose(conversation.GetAvailableChoices().Single(c => c.Target == "report"));
            conversation.Choose(conversation.GetAvailableChoices()[0]);
            conversation.Choose(conversation.GetAvailableChoices().Single(c => c.Target == "discovery"));
            barks.TrySelect("EnterZone", 0, out var bark);
            Assert.That(bark.RuleId, Is.EqualTo("enter_discovery"));
            barks.TrySelect("EnterZone", 0, out bark);
            Assert.That(bark.RuleId, Is.EqualTo("enter_lab"));
            conversation.Choose(conversation.GetAvailableChoices()[0]);
            conversation.Choose(conversation.GetAvailableChoices().Single(c => c.Target == "end"));
            Assert.That(conversation.Status, Is.EqualTo(ConversationStatus.Ended));
        }
    }
}
