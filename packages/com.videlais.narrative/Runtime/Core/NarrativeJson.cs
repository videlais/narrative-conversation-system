using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Videlais.Narrative
{
    public static class NarrativeJson
    {
        private static readonly string[] ValueKeys = { "intValue", "floatValue", "stringValue", "boolValue" };
        private static readonly string[] ComparisonNames =
            { "equals", "notEquals", "lessThan", "greaterThan", "greaterThanEqual", "lessThanEqual" };
        private static readonly string[] ActionNames = { "update", "delete", "add", "subtract" };

        public static Story LoadStory(string json)
        {
            var root = Root(json);
            Fields(root, "start", "nodes");
            var nodes = Array(root, "nodes", token =>
            {
                var node = Object(token);
                Fields(node, "id", "speaker", "text", "choices");
                return new Node(Text(node, "id", true), Text(node, "speaker"), Text(node, "text"),
                    Array(node, "choices", choiceToken =>
                    {
                        var choice = Object(choiceToken);
                        Fields(choice, "text", "target", "conditions", "action");
                        return new Choice(Text(choice, "text"), Text(choice, "target", true),
                            Array(choice, "conditions", ReadCondition),
                            choice["action"].Type == JTokenType.Null ? null : ReadAction(choice["action"]));
                    }));
            });
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var node in nodes)
                if (!ids.Add(node.Id)) throw Invalid(root, $"Duplicate node '{node.Id}'.");
            var start = Text(root, "start", true);
            if (!ids.Contains(start)) throw Invalid(root, "Start must name an existing node.");
            foreach (var node in nodes)
                foreach (var choice in node.Choices)
                    if (!ids.Contains(choice.Target)) throw Invalid(root, $"Missing target '{choice.Target}'.");
            return new Story(start, nodes);
        }

        public static BarkSet LoadBarks(string json)
        {
            var root = Root(json);
            Fields(root, "characterId", "characterName", "rules");
            var rules = Array(root, "rules", token =>
            {
                var rule = Object(token);
                Fields(rule, "id", "trigger", "conditions", "priority", "cooldownSeconds", "playOnce", "lines");
                var priority = Integer(rule["priority"]);
                if (priority < int.MinValue || priority > int.MaxValue) throw Invalid(rule, "Priority is outside Int32 range.");
                var cooldown = Number(rule["cooldownSeconds"]);
                if (cooldown < 0) throw Invalid(rule, "Cooldown cannot be negative.");
                var lines = Array(rule, "lines", line => StringToken(line, true));
                if (lines.Length == 0) throw Invalid(rule, "A rule needs at least one line.");
                return new BarkRule(Text(rule, "id", true), Text(rule, "trigger", true),
                    Array(rule, "conditions", ReadCondition), (int)priority, cooldown,
                    Boolean(rule["playOnce"]), lines);
            });
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var rule in rules)
                if (!ids.Add(rule.Id)) throw Invalid(root, $"Duplicate rule '{rule.Id}'.");
            return new BarkSet(Text(root, "characterId", true), Text(root, "characterName", true), rules);
        }

        private static Condition ReadCondition(JToken token)
        {
            var condition = Object(token);
            OperationFields(condition, "comparison");
            int comparison = System.Array.IndexOf(ComparisonNames, Text(condition, "comparison"));
            if (comparison < 0) throw Invalid(condition, "Unknown comparison; use 'notEquals', not 'notEqual'.");
            var value = Operand(condition, true).Value;
            if (comparison > 1 && value.Type != FactType.Int && value.Type != FactType.Float)
                throw Invalid(condition, "Ordered comparisons require numbers.");
            return new Condition(Text(condition, "fact", true), (Comparison)comparison, value);
        }

        private static FactAction ReadAction(JToken token)
        {
            var action = Object(token);
            OperationFields(action, "action");
            int kind = System.Array.IndexOf(ActionNames, Text(action, "action"));
            if (kind < 0) throw Invalid(action, "Unknown action.");
            var value = Operand(action, kind != (int)ActionKind.Delete);
            if (kind == (int)ActionKind.Add && value.Value.Type == FactType.Bool)
                throw Invalid(action, "Add requires a number or string.");
            if (kind == (int)ActionKind.Subtract &&
                value.Value.Type != FactType.Int && value.Value.Type != FactType.Float)
                throw Invalid(action, "Subtract requires a number.");
            return new FactAction(Text(action, "fact", true), (ActionKind)kind, value);
        }

        private static FactValue? Operand(JObject operation, bool required)
        {
            var keys = ValueKeys.Where(key => operation.Property(key) != null).ToArray();
            if (keys.Length != (required ? 1 : 0))
                throw Invalid(operation, required ? "Exactly one typed value is required." : "Delete must have no value.");
            if (!required) return null;
            var token = operation[keys[0]];
            switch (keys[0])
            {
                case "intValue": return FactValue.Int(Integer(token));
                case "floatValue": return FactValue.Float(Number(token));
                case "stringValue": return FactValue.String(StringToken(token, false));
                case "boolValue": return FactValue.Bool(Boolean(token));
                default: throw Invalid(operation, "Unsupported operand.");
            }
        }

        private static JObject Root(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            try
            {
                using (var text = new StringReader(json))
                using (var reader = new JsonTextReader(text) { DateParseHandling = DateParseHandling.None, MaxDepth = 64 })
                {
                    if (!reader.Read() || reader.TokenType != JsonToken.StartObject)
                        throw new FormatException("JSON must begin with an object.");
                    var root = JObject.Load(reader, new JsonLoadSettings
                    {
                        DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error,
                        CommentHandling = CommentHandling.Load
                    });
                    if (root.Descendants().Any(token => token.Type == JTokenType.Comment))
                        throw new FormatException("Comments are not supported in Story/Bark JSON.");
                    if (reader.Read()) throw new FormatException("Unexpected content after the JSON object.");
                    return root;
                }
            }
            catch (JsonException error)
            {
                throw new FormatException("Invalid narrative JSON: " + error.Message, error);
            }
        }

        private static JObject Object(JToken token) =>
            token as JObject ?? throw Invalid(token, "Expected an object.");

        private static void Fields(JObject obj, params string[] required)
        {
            foreach (var key in required)
                if (obj.Property(key) == null) throw Invalid(obj, $"Missing '{key}'.");
            foreach (var property in obj.Properties())
                if (!required.Contains(property.Name)) throw Invalid(property, $"Unsupported property '{property.Name}'.");
        }

        private static void OperationFields(JObject obj, string operation)
        {
            if (obj.Property("fact") == null || obj.Property(operation) == null)
                throw Invalid(obj, $"Operation needs 'fact' and '{operation}'.");
            foreach (var property in obj.Properties())
                if (property.Name != "fact" && property.Name != operation && !ValueKeys.Contains(property.Name))
                    throw Invalid(property, $"Unsupported property '{property.Name}'; remove legacy 'type' fields.");
        }

        private static T[] Array<T>(JObject obj, string key, Func<JToken, T> read)
        {
            if (!(obj[key] is JArray array)) throw Invalid(obj[key], $"'{key}' must be an array.");
            return array.Select(read).ToArray();
        }

        private static string Text(JObject obj, string key, bool nonempty = false) => StringToken(obj[key], nonempty);

        private static string StringToken(JToken token, bool nonempty)
        {
            if (token == null || token.Type != JTokenType.String) throw Invalid(token, "Expected a string.");
            var value = token.Value<string>();
            if (nonempty && string.IsNullOrWhiteSpace(value)) throw Invalid(token, "String cannot be blank.");
            return value;
        }

        private static bool Boolean(JToken token)
        {
            if (token == null || token.Type != JTokenType.Boolean) throw Invalid(token, "Expected a boolean.");
            return token.Value<bool>();
        }

        private static double Number(JToken token)
        {
            if (token == null || (token.Type != JTokenType.Integer && token.Type != JTokenType.Float))
                throw Invalid(token, "Expected a number.");
            var number = token.Value<double>();
            if (double.IsNaN(number) || double.IsInfinity(number)) throw Invalid(token, "Number must be finite.");
            return number;
        }

        private static long Integer(JToken token)
        {
            var number = Number(token);
            if (number != Math.Truncate(number) || number < -FactValue.MaxSafeInteger || number > FactValue.MaxSafeInteger)
                throw Invalid(token, "Expected a JSON-safe integer.");
            // Compare the original integer as well: double conversion can round huge JSON integers.
            if (token.Type == JTokenType.Integer &&
                (token.Value<decimal>() < -FactValue.MaxSafeInteger || token.Value<decimal>() > FactValue.MaxSafeInteger))
                throw Invalid(token, "Expected a JSON-safe integer.");
            return (long)number;
        }

        private static FormatException Invalid(JToken token, string message) =>
            new FormatException($"{message} Path: '{token?.Path ?? "<root>"}'.");
    }
}
