using System;
using System.Collections.Generic;

namespace Videlais.Narrative
{
    public sealed class BarkSession
    {
        private readonly BarkSet set;
        private readonly IFactStore facts;
        private readonly Random random;
        private readonly Dictionary<string, double> lastPlayed = new Dictionary<string, double>(StringComparer.Ordinal);
        private double lastTime = double.NegativeInfinity;

        public BarkSession(BarkSet set, IFactStore facts, Random random = null)
        {
            this.set = set ?? throw new ArgumentNullException(nameof(set));
            this.facts = facts ?? throw new ArgumentNullException(nameof(facts));
            this.random = random ?? new Random();
            foreach (var rule in set.Rules)
                foreach (var condition in rule.Conditions) FactOperations.Validate(condition, facts);
        }

        public bool TrySelect(string trigger, double nowSeconds, out Bark bark)
        {
            if (string.IsNullOrWhiteSpace(trigger)) throw new ArgumentException("Trigger cannot be blank.", nameof(trigger));
            if (double.IsNaN(nowSeconds) || double.IsInfinity(nowSeconds) || nowSeconds < 0 || nowSeconds < lastTime)
                throw new ArgumentOutOfRangeException(nameof(nowSeconds), "Supply finite, nonnegative, monotonic seconds.");
            var best = new List<BarkRule>();
            foreach (var rule in set.Rules)
            {
                if (!string.Equals(trigger, rule.Trigger, StringComparison.Ordinal)) continue;
                if (lastPlayed.TryGetValue(rule.Id, out var last) &&
                    (rule.PlayOnce || nowSeconds - last < rule.CooldownSeconds)) continue;
                if (!FactOperations.ConditionsMet(rule.Conditions, facts)) continue;
                if (best.Count > 0)
                {
                    var first = best[0];
                    if (rule.Priority < first.Priority ||
                        (rule.Priority == first.Priority && rule.Specificity < first.Specificity)) continue;
                    if (rule.Priority > first.Priority || rule.Specificity > first.Specificity) best.Clear();
                }
                best.Add(rule);
            }
            lastTime = nowSeconds;
            if (best.Count == 0) { bark = null; return false; }
            var selected = best[random.Next(best.Count)];
            var line = selected.Lines[random.Next(selected.Lines.Count)];
            bark = new Bark(set, selected, line);
            lastPlayed[selected.Id] = nowSeconds;
            return true;
        }

        public void ResetHistory()
        {
            lastPlayed.Clear();
            lastTime = double.NegativeInfinity;
        }
    }
}
