using System;
using System.Collections.Generic;
using UnityEngine;

namespace Videlais.Narrative.Unity
{
    [CreateAssetMenu(fileName = "FactRegistry", menuName = "Narrative/Fact Registry")]
    public sealed class FactRegistry : ScriptableObject
    {
        [Serializable]
        private sealed class Entry
        {
            [SerializeField] private string key;
            [SerializeField] private FactType type;
            [SerializeField] private long intValue;
            [SerializeField] private double floatValue;
            [SerializeField] private string stringValue = "";
            [SerializeField] private bool boolValue;

            public string Key => key;
            public FactValue Initial
            {
                get
                {
                    switch (type)
                    {
                        case FactType.Int: return FactValue.Int(intValue);
                        case FactType.Float: return FactValue.Float(floatValue);
                        case FactType.String: return FactValue.String(stringValue);
                        case FactType.Bool: return FactValue.Bool(boolValue);
                        default: throw new InvalidOperationException($"Unsupported type for fact '{key}'.");
                    }
                }
            }
        }

        [SerializeField] private List<Entry> entries = new List<Entry>();

        public FactStore CreateStore()
        {
            var definitions = new List<KeyValuePair<string, FactValue>>();
            foreach (var entry in entries)
            {
                if (entry == null) throw new InvalidOperationException($"Null fact entry in '{name}'.");
                definitions.Add(new KeyValuePair<string, FactValue>(entry.Key, entry.Initial));
            }
            return new FactStore(definitions);
        }
    }
}
