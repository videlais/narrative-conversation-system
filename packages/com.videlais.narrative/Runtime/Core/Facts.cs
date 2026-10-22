using System;
using System.Collections.Generic;

namespace Videlais.Narrative
{
    public enum FactType { Int, Float, String, Bool }

    public readonly struct FactValue
    {
        public const long MaxSafeInteger = 9007199254740991L;
        public FactType Type { get; }
        private readonly object value;

        private FactValue(FactType type, object value)
        {
            Type = type;
            this.value = value;
        }

        public static FactValue Int(long value)
        {
            if (value < -MaxSafeInteger || value > MaxSafeInteger)
                throw new ArgumentOutOfRangeException(nameof(value), "Integer must be JSON-safe.");
            return new FactValue(FactType.Int, value);
        }

        public static FactValue Float(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
                throw new ArgumentOutOfRangeException(nameof(value), "Float must be finite.");
            return new FactValue(FactType.Float, value);
        }

        public static FactValue String(string value) =>
            new FactValue(FactType.String, value ?? throw new ArgumentNullException(nameof(value)));
        public static FactValue Bool(bool value) => new FactValue(FactType.Bool, value);

        public long AsInt() => (long)Require(FactType.Int);
        public double AsFloat() => (double)Require(FactType.Float);
        public string AsString() => (string)Require(FactType.String);
        public bool AsBool() => (bool)Require(FactType.Bool);

        private object Require(FactType type)
        {
            if (value == null || Type != type)
                throw new InvalidOperationException($"Expected an initialized {type} fact value.");
            return value;
        }

        public bool SameValue(FactValue other)
        {
            Require(Type);
            other.Require(other.Type);
            return Type == other.Type && value.Equals(other.value);
        }

        public override string ToString() => Require(Type).ToString();

        internal void Validate() => Require(Type);
    }

    public interface IFactStore
    {
        FactType GetFactType(string key);
        // False means registered but deleted; unknown keys must throw.
        bool TryGet(string key, out FactValue value);
        void Set(string key, FactValue value);
        void Delete(string key);
    }

    public sealed class FactStore : IFactStore
    {
        private readonly Dictionary<string, FactValue> initial;
        private readonly Dictionary<string, FactValue> current;

        public FactStore(IEnumerable<KeyValuePair<string, FactValue>> definitions)
        {
            if (definitions == null) throw new ArgumentNullException(nameof(definitions));
            initial = new Dictionary<string, FactValue>(StringComparer.Ordinal);
            foreach (var entry in definitions)
            {
                ValidateKey(entry.Key);
                entry.Value.Validate();
                if (initial.ContainsKey(entry.Key))
                    throw new ArgumentException($"Duplicate fact '{entry.Key}'.", nameof(definitions));
                initial.Add(entry.Key, entry.Value);
            }
            current = new Dictionary<string, FactValue>(initial, StringComparer.Ordinal);
        }

        public FactType GetFactType(string key)
        {
            ValidateKey(key);
            if (!initial.TryGetValue(key, out var value))
                throw new KeyNotFoundException($"Unknown fact '{key}'.");
            return value.Type;
        }

        public bool TryGet(string key, out FactValue value)
        {
            GetFactType(key);
            return current.TryGetValue(key, out value);
        }

        public void Set(string key, FactValue value)
        {
            var type = GetFactType(key);
            value.Validate();
            if (type != value.Type) throw new ArgumentException($"Type mismatch for fact '{key}'.");
            current[key] = value;
        }

        public void Delete(string key)
        {
            GetFactType(key);
            current.Remove(key);
        }

        public void Reset()
        {
            current.Clear();
            foreach (var entry in initial) current.Add(entry.Key, entry.Value);
        }

        internal static void ValidateKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
                throw new ArgumentException("Fact keys cannot be empty or whitespace.", nameof(key));
        }
    }
}
