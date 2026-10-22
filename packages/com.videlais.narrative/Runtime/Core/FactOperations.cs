using System;
using System.Collections.Generic;

namespace Videlais.Narrative
{
    public static class FactOperations
    {
        public static void Validate(Condition condition, IFactStore facts)
        {
            if (condition == null) throw new ArgumentNullException(nameof(condition));
            ValidateType(condition.Fact, condition.Value.Type, facts);
        }

        public static void Validate(FactAction action, IFactStore facts)
        {
            if (action == null) return;
            if (facts == null) throw new ArgumentNullException(nameof(facts));
            var type = facts.GetFactType(action.Fact);
            if (action.Value.HasValue && type != action.Value.Value.Type)
                throw new ArgumentException($"Type mismatch for fact '{action.Fact}'.");
        }

        private static void ValidateType(string key, FactType expected, IFactStore facts)
        {
            if (facts == null) throw new ArgumentNullException(nameof(facts));
            if (facts.GetFactType(key) != expected)
                throw new ArgumentException($"Type mismatch for fact '{key}'.");
        }

        public static bool ConditionsMet(IReadOnlyList<Condition> conditions, IFactStore facts)
        {
            if (conditions == null) throw new ArgumentNullException(nameof(conditions));
            if (facts == null) throw new ArgumentNullException(nameof(facts));
            foreach (var condition in conditions) Validate(condition, facts);
            foreach (var condition in conditions)
            {
                if (!facts.TryGet(condition.Fact, out var current)) return false;
                if (current.Type != condition.Value.Type)
                    throw new InvalidOperationException($"Invalid store value for '{condition.Fact}'.");
                var expected = condition.Value;
                bool met;
                if (condition.Comparison == Comparison.Equals) met = current.SameValue(expected);
                else if (condition.Comparison == Comparison.NotEquals) met = !current.SameValue(expected);
                else
                {
                    int order = current.Type == FactType.Int
                        ? current.AsInt().CompareTo(expected.AsInt())
                        : current.AsFloat().CompareTo(expected.AsFloat());
                    switch (condition.Comparison)
                    {
                        case Comparison.LessThan: met = order < 0; break;
                        case Comparison.GreaterThan: met = order > 0; break;
                        case Comparison.GreaterThanEqual: met = order >= 0; break;
                        case Comparison.LessThanEqual: met = order <= 0; break;
                        default: throw new InvalidOperationException("Unsupported comparison.");
                    }
                }
                if (!met) return false;
            }
            return true;
        }

        public static void Apply(FactAction action, IFactStore facts)
        {
            if (action == null) return;
            Validate(action, facts);
            if (action.Kind == ActionKind.Delete) { facts.Delete(action.Fact); return; }
            var result = action.Value.Value;
            if (action.Kind != ActionKind.Update)
            {
                if (!facts.TryGet(action.Fact, out var current))
                    throw new InvalidOperationException($"Fact '{action.Fact}' has no current value.");
                if (current.Type != result.Type)
                    throw new InvalidOperationException($"Invalid store value for '{action.Fact}'.");
                bool add = action.Kind == ActionKind.Add;
                switch (result.Type)
                {
                    case FactType.Int:
                        result = FactValue.Int(add ? current.AsInt() + result.AsInt() : current.AsInt() - result.AsInt());
                        break;
                    case FactType.Float:
                        result = FactValue.Float(add ? current.AsFloat() + result.AsFloat() : current.AsFloat() - result.AsFloat());
                        break;
                    case FactType.String:
                        result = FactValue.String(current.AsString() + result.AsString());
                        break;
                    default: throw new InvalidOperationException("Unsupported arithmetic.");
                }
            }
            facts.Set(action.Fact, result);
        }
    }
}
