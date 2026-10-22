const STORAGE_KEY = "narrative-editor-draft";

let registry = [];
let storageError = "";
let doc = loadDraft() || blankDoc();
let fieldId = 0;

const flagsEl = document.getElementById("flags");
const nodesEl = document.getElementById("nodes");
const startEl = document.getElementById("start");
const previewEl = document.getElementById("preview");
const messagesEl = document.getElementById("messages");

function blankDoc() {
  return {
    start: "start",
    nodes: [{ id: "start", speaker: "", text: "", choices: [] }]
  };
}

function blankChoice() {
  return { text: "", target: "", conditions: [], action: null };
}

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!draft) return null;
    // Old drafts embedded their registry and title inside the Story.
    const story = draft.story || { start: draft.start, nodes: draft.nodes };
    const savedRegistry = draft.registry || draft.flags || [];
    savedRegistry.forEach(function (fact) {
      if (fact.type === undefined && typeof fact.initial === "boolean") fact.type = "boolValue";
    });
    story.nodes.forEach(function (node) {
      node.choices.forEach(function (choice) {
        if (typeof choice.conditions === "string") {
          choice.conditions = choice.conditions === "" ? [] :
            [{ fact: choice.conditions, comparison: "equals", boolValue: true }];
        }
        if (typeof choice.action === "string") {
          choice.action = choice.action === "" ? null :
            { fact: choice.action, action: "update", boolValue: true };
        }
      });
      if ("next" in node) {
        if (typeof node.next !== "string" || (node.next !== "" && node.choices.length)) {
          throw new Error("Cannot migrate node `" + node.id + "`: invalid legacy continuation.");
        }
        if (node.next !== "") {
          node.choices.push({ text: "Continue", target: node.next, conditions: [], action: null });
        }
        delete node.next;
      }
    });
    if (!isEditable(story) || Narrative.validateRegistry(savedRegistry).length) {
      throw new Error("The saved draft has an unsupported structure.");
    }
    registry = savedRegistry;
    return story;
  } catch (e) {
    storageError = "Could not restore draft: " + e.message;
    return null;
  }
}

function el(tag, props, children) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  (children || []).forEach(function (child) {
    node.append(child);
  });
  return node;
}

function field(labelText, input) {
  input.id = "field-" + (++fieldId);
  return el("div", {}, [el("label", { textContent: labelText, htmlFor: input.id }), input]);
}

function textInput(value, onInput, onChange) {
  const input = el("input", { type: "text", value: value });
  input.addEventListener("input", function () {
    onInput(input.value);
    update();
  });
  if (onChange) input.addEventListener("change", render);
  return input;
}

function selectInput(options, value, onChange) {
  const select = el("select");
  options.forEach(function (opt) {
    select.append(el("option", { value: opt.value, textContent: opt.label }));
  });
  if (value !== "" && !options.some(function (opt) { return opt.value === value; })) {
    select.append(el("option", { value: value, textContent: value + " (missing)" }));
  }
  select.value = value;
  select.addEventListener("change", function () {
    onChange(select.value);
    render();
  });
  return select;
}

function nodeOptions(includeBlank) {
  const opts = includeBlank ? [{ value: "", label: "(choose a node)" }] : [];
  return opts.concat(doc.nodes.map(function (n) {
    return { value: n.id, label: n.id };
  }));
}

function flagOptions(blankLabel) {
  return [{ value: "", label: blankLabel }].concat(registry.map(function (f) {
    return { value: f.id, label: f.id };
  }));
}

function renderFlags() {
  flagsEl.replaceChildren();
  registry.forEach(function (flag, i) {
    const initial = valueInput(flag.type, flag.initial, function (value) { flag.initial = value; });
    const remove = el("button", { textContent: "Remove", className: "danger" });
    remove.addEventListener("click", function () {
      registry.splice(i, 1);
      render();
    });
    flagsEl.append(el("div", { className: "card" }, [
      el("div", { className: "row" }, [
        field("Fact ID", textInput(flag.id, function (v) { renameFlag(flag, v); }, true)),
        field("Type", selectInput(typeOptions(), flag.type, function (v) {
          flag.type = v;
          flag.initial = Narrative.defaultValue(v);
        })),
        field("Initial value", initial),
        field("Description", textInput(flag.description, function (v) { flag.description = v; })),
        remove
      ])
    ]));
  });
}

function typeOptions() {
  return Narrative.valueTypes.map(function (type) { return { value: type, label: type }; });
}

function valueInput(type, value, onInput) {
  const input = el("input", { type: "text", value: String(value) });
  input.addEventListener("input", function () {
    try {
      const parsed = Narrative.parseValue(type, input.value);
      input.setCustomValidity("");
      onInput(parsed);
      update();
    } catch (err) {
      input.setCustomValidity(err.message);
      input.reportValidity();
      showMessages([err.message + " The last valid value is unchanged."]);
    }
  });
  return input;
}

function renderOperation(operation, isAction) {
  const key = isAction ? "action" : "comparison";
  const type = Narrative.valueType(operation);
  const controls = [
    field("Fact", selectInput(flagOptions("(choose a fact)"), operation.fact, function (v) { operation.fact = v; })),
    field(isAction ? "Action" : "Comparison", selectInput(
      (isAction ? Narrative.actions : Narrative.comparisons).map(function (v) { return { value: v, label: v }; }),
      operation[key], function (v) {
        operation[key] = v;
        if (v === "delete") Narrative.valueTypes.forEach(function (t) { delete operation[t]; });
        else if (!Narrative.valueType(operation)) operation.boolValue = false;
      }))
  ];
  if (operation.action !== "delete") {
    controls.push(field("Value type", selectInput(typeOptions(), type, function (v) {
      Narrative.valueTypes.forEach(function (t) { delete operation[t]; });
      operation[v] = Narrative.defaultValue(v);
    })));
    controls.push(field("Value", valueInput(type, operation[type], function (v) { operation[type] = v; })));
  }
  return el("div", { className: "row" }, controls);
}

function renderChoice(node, choice, j) {
  const remove = el("button", { textContent: "Remove choice", className: "danger" });
  remove.addEventListener("click", function () {
    node.choices.splice(j, 1);
    render();
  });
  const conditions = choice.conditions.map(function (condition, i) {
    const removeCondition = el("button", { textContent: "Remove condition" });
    removeCondition.addEventListener("click", function () {
      choice.conditions.splice(i, 1);
      render();
    });
    return el("div", {}, [renderOperation(condition, false), removeCondition]);
  });
  const addCondition = el("button", { textContent: "+ Add condition" });
  addCondition.addEventListener("click", function () {
    choice.conditions.push({ fact: "", comparison: "equals", boolValue: true });
    render();
  });
  const toggleAction = el("button", { textContent: choice.action === null ? "+ Add action" : "Remove action" });
  toggleAction.addEventListener("click", function () {
    choice.action = choice.action === null ? { fact: "", action: "update", boolValue: true } : null;
    render();
  });
  return el("div", { className: "choice" }, [
    field("Choice " + (j + 1) + " text", textInput(choice.text, function (v) { choice.text = v; })),
    el("div", { className: "row" }, [
      field("Target", selectInput(nodeOptions(true), choice.target, function (v) { choice.target = v; }))
    ]),
    el("p", { textContent: "Conditions (all must pass; none means always available)" }),
    el("div", {}, conditions),
    addCondition,
    el("p", { textContent: "Action" }),
    choice.action === null ? el("span", { textContent: "No action. " }) : renderOperation(choice.action, true),
    toggleAction,
    remove
  ]);
}

function renderNode(node, i) {
  const text = el("textarea", { value: node.text });
  text.addEventListener("input", function () {
    node.text = text.value;
    update();
  });

  const body = node.choices.map(function (choice, j) {
    return renderChoice(node, choice, j);
  });
  if (node.choices.length === 0) {
    body.push(el("p", { className: "muted", textContent: "No choices: this Node ends the Story." }));
  }
  const add = el("button", { textContent: "+ Add choice" });
  add.addEventListener("click", function () {
    node.choices.push(blankChoice());
    render();
  });
  body.push(add);

  const remove = el("button", { textContent: "Remove node", className: "danger" });
  remove.addEventListener("click", function () {
    if (confirm("Remove node \"" + node.id + "\"?")) {
      doc.nodes.splice(i, 1);
      render();
    }
  });

  return el("div", { className: "card" }, [
    el("div", { className: "row" }, [
      field("Node ID", textInput(node.id, function (v) { renameNode(node, v); }, true)),
      field("Speaker", textInput(node.speaker, function (v) { node.speaker = v; }))
    ]),
    field("Text", text),
    el("div", {}, body),
    el("p", {}, [remove])
  ]);
}

// Keep references to a node consistent when its ID is edited.
function renameNode(node, newId) {
  const oldId = node.id;
  node.id = newId;
  if (oldId === "") return;
  if (doc.start === oldId) doc.start = newId;
  doc.nodes.forEach(function (n) {
    n.choices.forEach(function (c) {
      if (c.target === oldId) c.target = newId;
    });
  });
}

function renameFlag(flag, newId) {
  const oldId = flag.id;
  flag.id = newId;
  if (oldId === "") return;
  doc.nodes.forEach(function (n) {
    n.choices.forEach(function (c) {
      c.conditions.forEach(function (condition) {
        if (condition.fact === oldId) condition.fact = newId;
      });
      if (c.action !== null && c.action.fact === oldId) c.action.fact = newId;
    });
  });
}

function render() {
  startEl.replaceChildren();
  nodeOptions(false).forEach(function (opt) {
    startEl.append(el("option", { value: opt.value, textContent: opt.label }));
  });
  startEl.value = doc.start;
  renderFlags();
  nodesEl.replaceChildren.apply(nodesEl, doc.nodes.map(renderNode));
  update();
}

function exportText() {
  return JSON.stringify(doc, null, 2);
}

function update() {
  previewEl.textContent = exportText();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ story: doc, registry: registry }));
  } catch (err) {
    showMessages(["Could not save draft: " + err.message]);
  }
}

function showMessages(errors) {
  messagesEl.className = "messages " + (errors.length ? "error" : "ok");
  messagesEl.textContent = errors.length ? errors.join("\n") : "No problems found.";
}

// Files with reference problems can still be loaded and fixed, but the basic shape must be renderable.
function isEditable(data) {
  return data && typeof data === "object" &&
    !("flags" in data) && !("registry" in data) && typeof data.start === "string" &&
    Array.isArray(data.nodes) && data.nodes.every(function (n) {
      return n && ["id", "speaker", "text"].every(function (k) { return typeof n[k] === "string"; }) &&
        Array.isArray(n.choices) && n.choices.every(function (c) {
          return c && ["text", "target"].every(function (k) { return typeof c[k] === "string"; }) &&
            Array.isArray(c.conditions) && c.conditions.every(function (condition) {
              return condition && typeof condition.fact === "string" && typeof condition.comparison === "string" &&
                Narrative.valueType(condition) !== undefined;
            }) && (c.action === null || (c.action && typeof c.action.fact === "string" &&
              typeof c.action.action === "string" && (c.action.action === "delete" || Narrative.valueType(c.action) !== undefined)));
        });
    });
}

function setDoc(data) {
  const errors = Narrative.validate(data);
  if (!isEditable(data) || data.nodes.some(function (node) { return "next" in node; })) {
    showMessages(["This file cannot be opened in the editor:"].concat(errors));
    return;
  }
  doc = {
    start: data.start,
    nodes: data.nodes.map(function (node) {
      return { id: node.id, speaker: node.speaker, text: node.text,
        choices: node.choices.map(function (choice) {
          return { text: choice.text, target: choice.target, conditions: choice.conditions, action: choice.action };
        }) };
    })
  };
  render();
  showMessages(Narrative.validate(doc, registry));
}

startEl.addEventListener("change", function () {
  doc.start = startEl.value;
  update();
});

document.getElementById("add-flag-btn").addEventListener("click", function () {
  let n = registry.length + 1;
  while (registry.some(function (flag) { return flag.id === "fact_" + n; })) n++;
  registry.push({ id: "fact_" + n, type: "boolValue", initial: false, description: "" });
  render();
});

document.getElementById("register-btn").addEventListener("click", function () {
  try {
    registry.push.apply(registry, Narrative.registerReferenced(doc, registry));
  } catch (err) {
    showMessages([err.message]);
    return;
  }
  render();
  showMessages(Narrative.validate(doc, registry));
});

document.getElementById("add-node-btn").addEventListener("click", function () {
  let n = doc.nodes.length + 1;
  const ids = new Set(doc.nodes.map(function (node) { return node.id; }));
  while (ids.has("node_" + n)) n++;
  doc.nodes.push({ id: "node_" + n, speaker: "", text: "", choices: [] });
  render();
});

document.getElementById("new-btn").addEventListener("click", function () {
  if (confirm("Start a new Story? The current Story will be replaced; the external registry will be kept.")) {
    doc = blankDoc();
    messagesEl.textContent = "";
    render();
  }
});

document.getElementById("example-btn").addEventListener("click", function () {
  fetch("../example-conversation.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(setDoc)
    .catch(function (err) { showMessages(["Could not load example: " + err.message]); });
});

document.getElementById("import-file").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (!file) return;
  file.text().then(function (text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      showMessages(["Invalid JSON: " + err.message]);
      return;
    }
    setDoc(data);
    event.target.value = "";
  }).catch(function (err) { showMessages(["Could not read file: " + err.message]); });
});

document.getElementById("validate-btn").addEventListener("click", function () {
  showMessages(Narrative.validate(doc, registry));
});

document.getElementById("export-btn").addEventListener("click", function () {
  const errors = Narrative.validate(doc, registry);
  showMessages(errors);
  if (errors.length && !confirm("The conversation has problems. Export anyway?")) return;
  const blob = new Blob([exportText()], { type: "application/json" });
  const link = el("a", {
    href: URL.createObjectURL(blob),
    download: "story.json"
  });
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
});

render();
if (storageError) showMessages([storageError]);
