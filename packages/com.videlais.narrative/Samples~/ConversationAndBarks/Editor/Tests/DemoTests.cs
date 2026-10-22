using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Videlais.Narrative.Sample.Editor;

namespace Videlais.Narrative.Sample.Tests
{
    public sealed class DemoTests
    {
        [UnityTest]
        public IEnumerator MenuCreatesConfiguredDemoAndInitializesBothSystems()
        {
            yield return new EnterPlayMode();
            CreateDemo.Create();
            var go = UnityEditor.Selection.activeGameObject;
            try
            {
                Assert.That(go.GetComponent<NarrativeDemo>(), Is.Not.Null);
                yield return null;
                LogAssert.NoUnexpectedReceived();
            }
            finally { Object.DestroyImmediate(go); }
            yield return new ExitPlayMode();
        }
    }
}
