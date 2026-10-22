using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Videlais.Narrative.Sample.Editor
{
    public static class CreateDemo
    {
        [MenuItem("GameObject/Narrative/Conversation and Barks Demo", false, 10)]
        public static void Create()
        {
            var scripts = AssetDatabase.FindAssets("CreateDemo t:MonoScript", new[] { "Assets" });
            string folder = null;
            foreach (var guid in scripts)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (AssetDatabase.LoadAssetAtPath<MonoScript>(path).GetClass() == typeof(CreateDemo))
                {
                    folder = Path.GetDirectoryName(Path.GetDirectoryName(path)).Replace('\\', '/');
                    break;
                }
            }
            if (folder == null) throw new InvalidOperationException("Import the Conversation and Barks sample first.");
            var conversation = Load<TextAsset>(folder + "/conversation.json");
            var barks = Load<TextAsset>(folder + "/mara.json");
            var registry = Load<Unity.FactRegistry>(folder + "/DemoFacts.asset");
            var go = new GameObject("Conversation and Barks Demo");
            Undo.RegisterCreatedObjectUndo(go, "Create narrative demo");
            var demo = go.AddComponent<NarrativeDemo>();
            var serialized = new SerializedObject(demo);
            serialized.FindProperty("conversationJson").objectReferenceValue = conversation;
            serialized.FindProperty("barkJson").objectReferenceValue = barks;
            serialized.FindProperty("registry").objectReferenceValue = registry;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            Selection.activeGameObject = go;
        }

        private static T Load<T>(string path) where T : UnityEngine.Object =>
            AssetDatabase.LoadAssetAtPath<T>(path) ?? throw new InvalidOperationException($"Missing demo asset: {path}");
    }
}
