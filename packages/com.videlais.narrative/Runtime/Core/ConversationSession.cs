using System;
using System.Collections.Generic;

namespace Videlais.Narrative
{
    public enum ConversationStatus { Ready, Blocked, Ended }

    public sealed class ConversationSession
    {
        private readonly Story story;
        private readonly IFactStore facts;
        private readonly Dictionary<string, Node> nodes = new Dictionary<string, Node>(StringComparer.Ordinal);
        public Node CurrentNode { get; private set; }
        public ConversationStatus Status => CurrentNode.Choices.Count == 0 ? ConversationStatus.Ended :
            GetAvailableChoices().Count == 0 ? ConversationStatus.Blocked : ConversationStatus.Ready;

        public ConversationSession(Story story, IFactStore facts)
        {
            this.story = story ?? throw new ArgumentNullException(nameof(story));
            this.facts = facts ?? throw new ArgumentNullException(nameof(facts));
            foreach (var node in story.Nodes)
            {
                nodes.Add(node.Id, node);
                foreach (var choice in node.Choices)
                {
                    foreach (var condition in choice.Conditions) FactOperations.Validate(condition, facts);
                    FactOperations.Validate(choice.Action, facts);
                }
            }
            CurrentNode = nodes[story.Start];
        }

        public IReadOnlyList<Choice> GetAvailableChoices()
        {
            var choices = new List<Choice>();
            foreach (var choice in CurrentNode.Choices)
                if (FactOperations.ConditionsMet(choice.Conditions, facts)) choices.Add(choice);
            return choices.AsReadOnly();
        }

        public void Choose(Choice choice)
        {
            if (choice == null) throw new ArgumentNullException(nameof(choice));
            bool belongs = false;
            foreach (var candidate in CurrentNode.Choices)
                if (ReferenceEquals(candidate, choice)) belongs = true;
            if (!belongs) throw new ArgumentException("Choice does not belong to the current node.", nameof(choice));
            if (!FactOperations.ConditionsMet(choice.Conditions, facts))
                throw new InvalidOperationException("Choice is no longer eligible.");
            var target = nodes[choice.Target];
            FactOperations.Apply(choice.Action, facts);
            CurrentNode = target;
        }

        // Navigation only: shared world state belongs to the host.
        public void Restart() => CurrentNode = nodes[story.Start];
    }
}
