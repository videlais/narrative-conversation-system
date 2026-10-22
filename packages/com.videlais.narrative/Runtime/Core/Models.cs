using System.Collections.Generic;

namespace Videlais.Narrative
{
    public enum Comparison { Equals, NotEquals, LessThan, GreaterThan, GreaterThanEqual, LessThanEqual }
    public enum ActionKind { Update, Delete, Add, Subtract }

    public sealed class Condition
    {
        public string Fact { get; }
        public Comparison Comparison { get; }
        public FactValue Value { get; }
        internal Condition(string fact, Comparison comparison, FactValue value)
        { Fact = fact; Comparison = comparison; Value = value; }
    }

    public sealed class FactAction
    {
        public string Fact { get; }
        public ActionKind Kind { get; }
        public FactValue? Value { get; }
        internal FactAction(string fact, ActionKind kind, FactValue? value)
        { Fact = fact; Kind = kind; Value = value; }
    }

    public sealed class Choice
    {
        public string Text { get; }
        public string Target { get; }
        public IReadOnlyList<Condition> Conditions { get; }
        public FactAction Action { get; }
        internal Choice(string text, string target, Condition[] conditions, FactAction action)
        { Text = text; Target = target; Conditions = System.Array.AsReadOnly(conditions); Action = action; }
    }

    public sealed class Node
    {
        public string Id { get; }
        public string Speaker { get; }
        public string Text { get; }
        public IReadOnlyList<Choice> Choices { get; }
        internal Node(string id, string speaker, string text, Choice[] choices)
        { Id = id; Speaker = speaker; Text = text; Choices = System.Array.AsReadOnly(choices); }
    }

    public sealed class Story
    {
        public string Start { get; }
        public IReadOnlyList<Node> Nodes { get; }
        internal Story(string start, Node[] nodes)
        { Start = start; Nodes = System.Array.AsReadOnly(nodes); }
    }

    public sealed class BarkRule
    {
        public string Id { get; }
        public string Trigger { get; }
        public IReadOnlyList<Condition> Conditions { get; }
        public int Priority { get; }
        public int Specificity => Conditions.Count;
        public double CooldownSeconds { get; }
        public bool PlayOnce { get; }
        public IReadOnlyList<string> Lines { get; }
        internal BarkRule(string id, string trigger, Condition[] conditions, int priority,
            double cooldownSeconds, bool playOnce, string[] lines)
        {
            Id = id; Trigger = trigger; Conditions = System.Array.AsReadOnly(conditions);
            Priority = priority; CooldownSeconds = cooldownSeconds; PlayOnce = playOnce;
            Lines = System.Array.AsReadOnly(lines);
        }
    }

    public sealed class BarkSet
    {
        public string CharacterId { get; }
        public string CharacterName { get; }
        public IReadOnlyList<BarkRule> Rules { get; }
        internal BarkSet(string characterId, string characterName, BarkRule[] rules)
        { CharacterId = characterId; CharacterName = characterName; Rules = System.Array.AsReadOnly(rules); }
    }

    public sealed class Bark
    {
        public string CharacterId { get; }
        public string CharacterName { get; }
        public string RuleId { get; }
        public string Text { get; }
        internal Bark(BarkSet set, BarkRule rule, string text)
        { CharacterId = set.CharacterId; CharacterName = set.CharacterName; RuleId = rule.Id; Text = text; }
    }
}
