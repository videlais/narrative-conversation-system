const STORAGE_KEY = "narrative-editor-draft";

let doc = loadDraft() || blankDoc();
// Per-node UI mode ("next", "choices", or "end"); not exported.
const modes = new WeakMap();

const flagsEl = document.getElementById("flags");
const nodesEl = document.getElementById("nodes");
const titleEl = document.getElementById("title");
const startEl = document.getElementById("start");
const previewEl = document.getElementById("preview");
const messagesEl = document.getElementById("messages");

function blankDoc() {
  return {
    title: "Untitled conversation",
    start: "start",
    flags: [],
    nodes: [{ id: "start", speaker: "", text: "", next: "", choices: [] }]
  };
}

function blankChoice() {
  return { text: "", target: "", conditions: "", action: "" };
}

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return isEditable(draft) ? draft : null;
  } catch (e) {
    return null;
  }
}

function modeOf(node) {
  if (!modes.has(node)) {
    modes.set(node, node.next !== "" ? "next" : node.choices.length ? "choices" : "end");
  }
  return modes.get(node);
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
  return el("div", {}, [el("label", { textContent: labelText }), input]);
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
  return [{ value: "", label: blankLabel }].concat(doc.flags.map(function (f) {
    return { value: f.id, label: f.id };
  }));
}

function renderFlags() {
  flagsEl.replaceChildren();
  doc.flags.forEach(function (flag, i) {
    const initial = el("input", { type: "checkbox", checked: flag.initial });
    initial.addEventListener("change", function () {
      flag.initial = initial.checked;
      update();
    });
    const remove = el("button", { textContent: "Remove", className: "danger" });
    remove.addEventListener("click", function () {
      doc.flags.splice(i, 1);
      render();
    });
    flagsEl.append(el("div", { className: "card" }, [
      el("div", { className: "row" }, [
        field("Flag ID", textInput(flag.id, function (v) { renameFlag(flag, v); }, true)),
        field("Description", textInput(flag.description, function (v) { flag.description = v; })),
        el("div", {}, [el("label", { className: "inline" }, [initial, "Starts true"]), remove])
      ])
    ]));
  });
}

function renderChoice(node, choice, j) {
  const remove = el("button", { textContent: "Remove choice", className: "danger" });
  remove.addEventListener("click", function () {
    node.choices.splice(j, 1);
    render();
  });
  return el("div", { className: "choice" }, [
    field("Choice " + (j + 1) + " text", textInput(choice.text, function (v) { choice.text = v; })),
    el("div", { className: "row" }, [
      field("Target", selectInput(nodeOptions(true), choice.target, function (v) { choice.target = v; })),
      field("Condition (only show if flag is true)", selectInput(flagOptions("(always show)"), choice.conditions, function (v) { choice.conditions = v; })),
      field("Action (set flag to true)", selectInput(flagOptions("(no action)"), choice.action, function (v) { choice.action = v; }))
    ]),
    remove
  ]);
}

function renderNode(node, i) {
  const mode = modeOf(node);
  const text = el("textarea", { value: node.text });
  text.addEventListener("input", function () {
    node.text = text.value;
    update();
  });

  const modeSelect = selectInput([
    { value: "next", label: "Continue to another node" },
    { value: "choices", label: "Offer choices" },
    { value: "end", label: "End the conversation" }
  ], mode, function (v) {
    modes.set(node, v);
    if (v !== "next") node.next = "";
    if (v !== "choices") node.choices = [];
    if (v === "choices" && node.choices.length === 0) node.choices.push(blankChoice());
  });

  const body = [];
  if (mode === "next") {
    body.push(field("Next node", selectInput(nodeOptions(true), node.next, function (v) { node.next = v; })));
  } else if (mode === "choices") {
    node.choices.forEach(function (choice, j) {
      body.push(renderChoice(node, choice, j));
    });
    const add = el("button", { textContent: "+ Add choice" });
    add.addEventListener("click", function () {
      node.choices.push(blankChoice());
      render();
    });
    body.push(add);
  }

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
      field("Speaker", textInput(node.speaker, function (v) { node.speaker = v; })),
      field("After this line", modeSelect)
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
  if (doc.start === oldId) doc.start = newId;
  doc.nodes.forEach(function (n) {
    if (n.next === oldId) n.next = newId;
    n.choices.forEach(function (c) {
      if (c.target === oldId) c.target = newId;
    });
  });
}

function renameFlag(flag, newId) {
  const oldId = flag.id;
  flag.id = newId;
  doc.nodes.forEach(function (n) {
    n.choices.forEach(function (c) {
      if (c.conditions === oldId) c.conditions = newId;
      if (c.action === oldId) c.action = newId;
    });
  });
}

function render() {
  titleEl.value = doc.title;
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
  localStorage.setItem(STORAGE_KEY, exportText());
}

function showMessages(errors) {
  messagesEl.className = "messages " + (errors.length ? "error" : "ok");
  messagesEl.textContent = errors.length ? errors.join("\n") : "No problems found.";
}

// Files with reference problems can still be loaded and fixed, but the basic shape must be renderable.
function isEditable(data) {
  return data && typeof data === "object" &&
    typeof data.title === "string" && typeof data.start === "string" &&
    Array.isArray(data.flags) && data.flags.every(function (f) {
      return f && typeof f.id === "string" && typeof f.description === "string";
    }) &&
    Array.isArray(data.nodes) && data.nodes.every(function (n) {
      return n && ["id", "speaker", "text", "next"].every(function (k) { return typeof n[k] === "string"; }) &&
        Array.isArray(n.choices) && n.choices.every(function (c) {
          return c && ["text", "target", "conditions", "action"].every(function (k) { return typeof c[k] === "string"; });
        });
    });
}

function setDoc(data) {
  const errors = Narrative.validate(data);
  if (!isEditable(data)) {
    showMessages(["This file cannot be opened in the editor:"].concat(errors));
    return;
  }
  doc = data;
  render();
  showMessages(errors);
}

titleEl.addEventListener("input", function () {
  doc.title = titleEl.value;
  update();
});

startEl.addEventListener("change", function () {
  doc.start = startEl.value;
  update();
});

document.getElementById("add-flag-btn").addEventListener("click", function () {
  doc.flags.push({ id: "flag_" + (doc.flags.length + 1), initial: false, description: "" });
  render();
});

document.getElementById("add-node-btn").addEventListener("click", function () {
  let n = doc.nodes.length + 1;
  const ids = new Set(doc.nodes.map(function (node) { return node.id; }));
  while (ids.has("node_" + n)) n++;
  doc.nodes.push({ id: "node_" + n, speaker: "", text: "", next: "", choices: [] });
  render();
});

document.getElementById("new-btn").addEventListener("click", function () {
  if (confirm("Start a new conversation? Unsaved changes will be lost.")) {
    doc = blankDoc();
    messagesEl.textContent = "";
    render();
  }
});

document.getElementById("example-btn").addEventListener("click", function () {
  fetch("../example-conversation.json")
    .then(function (res) { return res.json(); })
    .then(setDoc)
    .catch(function (err) { showMessages(["Could not load example: " + err.message]); });
});

document.getElementById("import-file").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (!file) return;
  file.text().then(function (text) {
    try {
      setDoc(JSON.parse(text));
    } catch (err) {
      showMessages(["Invalid JSON: " + err.message]);
    }
    event.target.value = "";
  });
});

document.getElementById("validate-btn").addEventListener("click", function () {
  showMessages(Narrative.validate(doc));
});

document.getElementById("export-btn").addEventListener("click", function () {
  const errors = Narrative.validate(doc);
  showMessages(errors);
  if (errors.length && !confirm("The conversation has problems. Export anyway?")) return;
  const blob = new Blob([exportText()], { type: "application/json" });
  const link = el("a", {
    href: URL.createObjectURL(blob),
    download: (doc.title || "conversation").trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json"
  });
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
});

render();
