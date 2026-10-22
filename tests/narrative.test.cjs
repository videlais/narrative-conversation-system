const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, "docs/narrative.js"), "utf8"), context);
const Narrative = context.window.Narrative;
const example = JSON.parse(fs.readFileSync(path.join(root, "docs/example-conversation.json"), "utf8"));
const registry = ["accepted_task", "read_report"].map(id => ({ id, type: "boolValue", initial: false, description: "" }));

test("Story JSON contains structure only and explicit continuation Choices", () => {
  assert.deepEqual(Object.keys(example), ["start", "nodes"]);
  assert.deepEqual(example.nodes[0].choices, [
    { text: "Continue", target: "offer", conditions: [], action: null }
  ]);
  assert.equal(Narrative.validate(example).length, 0);
  assert.equal(Narrative.validate(example, registry).length, 0);
  example.nodes.forEach(node => {
    assert.deepEqual(Object.keys(node).sort(), ["choices", "id", "speaker", "text"]);
    node.choices.forEach(choice => {
      assert.deepEqual(Object.keys(choice).sort(), ["action", "conditions", "target", "text"]);
    });
  });
});

test("registry resolution is external and never mutates the Story", () => {
  const before = JSON.stringify(example);
  const errors = Narrative.validate(example, []);
  assert.ok(errors.some(error => error.includes("fact `read_report`")));
  assert.ok(errors.some(error => error.includes("fact `accepted_task`")));
  assert.deepEqual(Array.from(Narrative.referencedFacts(example)).sort(), ["accepted_task", "read_report"]);
  assert.equal(JSON.stringify(example), before);
  assert.ok(Narrative.validate({ ...example, flags: registry }).some(error => error.includes("outside")));
});

test("registry IDs and initial values are validated", () => {
  assert.ok(Narrative.validateRegistry(null).length);
  assert.ok(Narrative.validateRegistry([...registry, registry[0]]).some(error => error.includes("Duplicate")));
  assert.ok(Narrative.validateRegistry([{ id: "x", type: "boolValue", initial: "false", description: "" }]).length);
});

function storyWith(conditions = [], action = null) {
  return { start: "start", nodes: [
    { id: "start", speaker: "", text: "", choices: [{ text: "Continue", target: "end", conditions, action }] },
    { id: "end", speaker: "", text: "", choices: [] }
  ] };
}

function fact(type, initial, id = "x") {
  return { id, type, initial, description: "" };
}

test("all six comparisons use exact boundaries, AND, and empty-array eligibility", () => {
  const expected = {
    equals: [false, true, false],
    notEquals: [true, false, true],
    lessThan: [true, false, false],
    greaterThan: [false, false, true],
    greaterThanEqual: [false, true, true],
    lessThanEqual: [true, true, false]
  };
  for (const type of ["intValue", "floatValue"]) {
    for (const [comparison, results] of Object.entries(expected)) {
      for (const [i, current] of [4, 5, 6].entries()) {
        const condition = { fact: "x", comparison, [type]: 5 };
        assert.equal(Narrative.validate(storyWith([condition]), [fact(type, current)]).length, 0);
        assert.equal(Narrative.conditionsMet([condition], new Map([["x", current]])), results[i]);
      }
    }
  }
  const conditions = [
    { fact: "x", comparison: "equals", boolValue: true },
    { fact: "y", comparison: "notEquals", stringValue: "" }
  ];
  assert.equal(Narrative.conditionsMet([], new Map()), true);
  assert.equal(Narrative.conditionsMet(conditions, new Map([["x", true], ["y", "Ilsa"]])), true);
  assert.equal(Narrative.conditionsMet(conditions, new Map([["x", false], ["y", "Ilsa"]])), false);
  assert.equal(Narrative.conditionsMet(conditions, new Map([["x", true]])), false);
  assert.throws(() => Narrative.conditionsMet([{ fact: "x", comparison: "equals", intValue: 1 }], new Map([["x", "1"]])), /Type mismatch/);
});

test("typed Conditions and Actions reject malformed schemas and illegal operations", () => {
  const invalidConditions = [
    "", null, [], {}, { fact: "", comparison: "equals", intValue: 1 },
    { fact: "x", comparsion: "equals", intValue: 1 },
    { fact: "x", comparison: "equals" },
    { fact: "x", comparison: "equals", intValue: 1, floatValue: 1 },
    { fact: "x", comparison: "equals", intValue: 1.5 },
    { fact: "x", comparison: "equals", intValue: Number.MAX_SAFE_INTEGER + 1 },
    { fact: "x", comparison: "equals", floatValue: Infinity },
    { fact: "x", comparison: "equals", boolValue: "true" },
    { fact: "x", comparison: "lessThan", stringValue: "a" },
    { fact: "x", comparison: "greaterThan", boolValue: false }
  ];
  invalidConditions.forEach(condition => assert.ok(Narrative.validate(storyWith([condition])).length, JSON.stringify(condition)));
  assert.ok(Narrative.validate(storyWith("")).length);
  for (const action of [
    "", undefined, [], {}, { fact: "x", action: "multiply", intValue: 2 },
    { fact: "x", action: "delete", boolValue: false },
    { fact: "x", action: "add", boolValue: true },
    { fact: "x", action: "subtract", stringValue: "a" },
    { fact: "x", action: "update" }
  ]) {
    const data = storyWith([], null);
    data.nodes[0].choices[0].action = action;
    assert.ok(Narrative.validate(data).length, JSON.stringify(action));
  }
  assert.ok(Narrative.validate(storyWith([{ fact: "x", comparison: "equals", floatValue: 1 }]), [fact("intValue", 1)]).some(e => e.includes("type mismatch")));
  assert.ok(Narrative.validate(storyWith([], { fact: "x", action: "delete" }), []).some(e => e.includes("not registered")));
});

test("update, delete, numeric arithmetic, and string concatenation preserve typed state", () => {
  for (const [type, value] of [["intValue", 4], ["floatValue", 0.5], ["stringValue", "Ilsa"], ["boolValue", false]]) {
    const values = new Map();
    const action = { fact: "x", action: "update", [type]: value };
    assert.equal(Narrative.validate(storyWith([], action), [fact(type, value)]).length, 0);
    Narrative.applyAction(action, values);
    assert.equal(values.get("x"), value);
    Narrative.applyAction({ fact: "x", action: "delete" }, values);
    assert.equal(values.has("x"), false);
    assert.equal(Narrative.conditionsMet([{ fact: "x", comparison: "notEquals", [type]: value }], values), false);
    Narrative.applyAction({ fact: "x", action: "delete" }, values);
    Narrative.applyAction(action, values);
    assert.equal(values.get("x"), value);
  }
  for (const type of ["intValue", "floatValue"]) {
    const values = new Map([["x", 5]]);
    Narrative.applyAction({ fact: "x", action: "add", [type]: 3 }, values);
    assert.equal(values.get("x"), 8);
    Narrative.applyAction({ fact: "x", action: "subtract", [type]: 10 }, values);
    assert.equal(values.get("x"), -2);
  }
  const values = new Map([["x", "Ilsa"]]);
  Narrative.applyAction({ fact: "x", action: "add", stringValue: " Varn" }, values);
  assert.equal(values.get("x"), "Ilsa Varn");
  Narrative.applyAction(null, values);
  assert.equal(values.get("x"), "Ilsa Varn");
});

test("arithmetic errors leave state unchanged", () => {
  for (const [type, initial, amount] of [
    ["intValue", Number.MAX_SAFE_INTEGER, 1],
    ["floatValue", Number.MAX_VALUE, Number.MAX_VALUE],
    ["intValue", "1", 1]
  ]) {
    const values = new Map([["x", initial]]);
    assert.throws(() => Narrative.applyAction({ fact: "x", action: "add", [type]: amount }, values));
    assert.equal(values.get("x"), initial);
  }
  assert.throws(() => Narrative.applyAction({ fact: "x", action: "subtract", intValue: 1 }, new Map()), /no current value/);
});

test("typed registry defaults and inferred registrations are external and atomic", () => {
  const data = storyWith([
    { fact: "i", comparison: "equals", intValue: 1 },
    { fact: "f", comparison: "lessThan", floatValue: 0.5 },
    { fact: "s", comparison: "notEquals", stringValue: "a" },
    { fact: "b", comparison: "equals", boolValue: true }
  ]);
  const entries = Narrative.registerReferenced(data, []);
  assert.deepEqual(Array.from(entries, entry => [entry.id, entry.type, entry.initial]), [
    ["i", "intValue", 0], ["f", "floatValue", 0], ["s", "stringValue", ""], ["b", "boolValue", false]
  ]);
  assert.equal(Narrative.validate(data, entries).length, 0);
  assert.equal(Narrative.registerReferenced(data, entries).length, 0);
  const deleteOnly = storyWith([], { fact: "x", action: "delete" });
  assert.throws(() => Narrative.registerReferenced(deleteOnly, []), /delete-only/);
  assert.equal(Narrative.registerReferenced(deleteOnly, [fact("boolValue", false)]).length, 0);
  const conflict = storyWith([{ fact: "x", comparison: "equals", intValue: 1 }], { fact: "x", action: "update", floatValue: 1 });
  assert.throws(() => Narrative.registerReferenced(conflict, []), /Conflicting types/);
  for (const [type, value] of [["intValue", 1.1], ["floatValue", NaN], ["boolValue", 0], ["stringValue", false], ["bad", 1]]) {
    assert.ok(Narrative.validateRegistry([fact(type, value)]).length);
  }
});

test("typed text parsing does not silently coerce invalid input", () => {
  assert.equal(Narrative.parseValue("intValue", "2"), 2);
  assert.equal(Narrative.parseValue("floatValue", "0.25"), 0.25);
  assert.equal(Narrative.parseValue("stringValue", ""), "");
  assert.equal(Narrative.parseValue("boolValue", "false"), false);
  for (const [type, text] of [["intValue", ""], ["intValue", "1.2"], ["floatValue", "Infinity"], ["boolValue", "yes"]]) {
    assert.throws(() => Narrative.parseValue(type, text));
  }
});

function editorContext(draft) {
  const elements = new Map();
  const storage = new Map(draft ? [["narrative-editor-draft", JSON.stringify(draft)]] : []);
  function element() {
    return {
      children: [],
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener() {}
    };
  }
  const browser = vm.createContext({
    window: {},
    document: {
      createElement: element,
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      }
    },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, "docs/narrative.js"), "utf8"), browser);
  browser.Narrative = browser.window.Narrative;
  vm.runInContext(fs.readFileSync(path.join(root, "docs/editor/editor.js"), "utf8"), browser);
  return { browser, elements, read: () => JSON.parse(storage.get("narrative-editor-draft")) };
}

test("editor migrates legacy boolean drafts and continuations without embedding the registry", () => {
  const draft = {
    start: "start", flags: [{ id: "ready", initial: false, description: "" }],
    nodes: [
      { id: "start", speaker: "", text: "", next: "end", choices: [] },
      { id: "end", speaker: "", text: "", choices: [
        { text: "Again", target: "end", conditions: "ready", action: "ready" }
      ] }
    ]
  };
  const editor = editorContext(draft);
  const saved = editor.read();
  assert.equal(saved.registry[0].type, "boolValue");
  assert.deepEqual(saved.story.nodes[0].choices[0], { text: "Continue", target: "end", conditions: [], action: null });
  assert.deepEqual(saved.story.nodes[1].choices[0].conditions, [{ fact: "ready", comparison: "equals", boolValue: true }]);
  assert.deepEqual(saved.story.nodes[1].choices[0].action, { fact: "ready", action: "update", boolValue: true });
  assert.equal("flags" in saved.story, false);
  assert.equal("next" in saved.story.nodes[0], false);
  assert.equal(Narrative.validate(saved.story, saved.registry).length, 0);
  assert.deepEqual(editorContext(saved).read(), saved);
});

test("editor renames all fact references and preserves typed objects across draft reloads", () => {
  const story = storyWith([
    { fact: "x", comparison: "greaterThanEqual", intValue: 2 },
    { fact: "x", comparison: "lessThan", intValue: 10 }
  ], { fact: "x", action: "subtract", intValue: 1 });
  const editor = editorContext({ story, registry: [fact("intValue", 5)] });
  vm.runInContext('renameFlag(registry[0], "renamed"); update();', editor.browser);
  const saved = editor.read();
  assert.equal(saved.registry[0].id, "renamed");
  assert.ok(saved.story.nodes[0].choices[0].conditions.every(c => c.fact === "renamed"));
  assert.equal(saved.story.nodes[0].choices[0].action.fact, "renamed");
  assert.equal(Narrative.validate(saved.story, saved.registry).length, 0);
  assert.deepEqual(editorContext(saved).read(), saved);
});

test("malformed saved drafts report restore errors rather than crashing the editor", () => {
  const editor = editorContext({ story: { start: "x", nodes: null }, registry: [] });
  assert.match(editor.elements.get("messages").textContent, /Could not restore draft/);
  assert.equal(editor.read().story.start, "start");
});

test("legacy next is rejected and Choice destinations, endings, and malformed content are validated", () => {
  const story = () => structuredClone(example);
  let data = story();
  data.nodes[0].next = "missing";
  assert.ok(Narrative.validate(data).some(error => error.includes("no longer supported")));
  data.nodes[0].next = "";
  assert.ok(Narrative.validate(data).some(error => error.includes("no longer supported")));
  data = story();
  data.nodes[1].choices[0].target = "missing";
  assert.ok(Narrative.validate(data).some(error => error.includes("missing node")));
  data = story();
  data.nodes[0].choices[0].target = "";
  assert.ok(Narrative.validate(data).some(error => error.includes("missing node")));
  data = story();
  data.nodes.push(null);
  assert.ok(Narrative.validate(data).length);
  assert.equal(Narrative.validate({ start: "end", nodes: [
    { id: "end", speaker: "", text: "", choices: [] }
  ] }, []).length, 0);
});
