let story = null;
let nodesById = new Map();
let flags = new Map();
const registry = [];

const messagesEl = document.getElementById("messages");
const flagsEl = document.getElementById("flags");
const choicesEl = document.getElementById("choices");
const transcriptEl = document.getElementById("transcript");

function show(id, visible) {
  document.getElementById(id).classList.toggle("hidden", !visible);
}

function load(data) {
  const errors = Narrative.validate(data);
  if (errors.length) {
    messagesEl.className = "messages error";
    messagesEl.textContent = "This Story has problems:\n" + errors.join("\n");
    story = null;
    document.getElementById("start-btn").disabled = true;
    show("stage", false);
    show("log", false);
    return;
  }
  story = data;
  nodesById = new Map();
  story.nodes.forEach(function (node) {
    nodesById.set(node.id, node);
  });
  flags = new Map();
  registry.forEach(function (flag) {
    flags.set(flag.id, flag.initial);
  });
  messagesEl.className = "messages ok";
  messagesEl.textContent = "Loaded Story (" + story.nodes.length + " nodes).";
  renderFlags();
  show("setup", true);
  show("stage", false);
  show("log", false);
  checkRegistry();
}

function loadText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    messagesEl.className = "messages error";
    messagesEl.textContent = "Invalid JSON: " + err.message;
    story = null;
    document.getElementById("start-btn").disabled = true;
    show("stage", false);
    show("log", false);
    return;
  }
  load(data);
}

function checkRegistry() {
  const errors = story ? Narrative.validate(story, registry) : ["Load a valid Story first."];
  document.getElementById("start-btn").disabled = errors.length > 0;
  messagesEl.className = "messages " + (errors.length ? "error" : "ok");
  messagesEl.textContent = errors.length ? errors.join("\n") : "Story and player registry are ready.";
}

function renderFlags() {
  flagsEl.replaceChildren();
  if (registry.length === 0) {
    flagsEl.textContent = "The player registry is empty.";
    return;
  }
  registry.forEach(function (flag) {
    const box = document.createElement("input");
    box.type = "text";
    box.value = flags.has(flag.id) ? String(flags.get(flag.id)) : "";
    box.placeholder = flags.has(flag.id) ? "" : "(deleted)";
    box.setAttribute("aria-label", flag.id + " value (" + flag.type + ")");
    box.addEventListener("change", function () {
      try {
        const value = Narrative.parseValue(flag.type, box.value);
        box.setCustomValidity("");
        flags.set(flag.id, value);
        flag.initial = value;
        checkRegistry();
        if (!document.getElementById("stage").classList.contains("hidden")) renderNode(currentId);
      } catch (err) {
        box.setCustomValidity(err.message);
        box.reportValidity();
        messagesEl.className = "messages error";
        messagesEl.textContent = err.message + " The last valid value is unchanged.";
      }
    });
    const label = document.createElement("label");
    label.className = "inline";
    label.title = flag.description;
    label.append(flag.id + " (" + flag.type + ")", box);
    const desc = document.createElement("span");
    desc.className = "muted";
    desc.textContent = flag.description;
    const row = document.createElement("div");
    row.append(label, desc);
    flagsEl.append(row);
  });
}

function addTranscript(speaker, text, isPlayer) {
  const line = document.createElement("p");
  line.className = "line" + (isPlayer ? " player-line" : "");
  const who = document.createElement("span");
  who.className = "speaker";
  who.textContent = speaker + ": ";
  line.append(who, text);
  transcriptEl.append(line);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

let currentId = null;

function goTo(id) {
  currentId = id;
  const node = nodesById.get(id);
  addTranscript(node.speaker, node.text, false);
  renderNode(id);
}

function button(text, onClick) {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function renderNode(id) {
  const node = nodesById.get(id);
  document.getElementById("speaker").textContent = node.speaker;
  document.getElementById("text").textContent = node.text;
  document.getElementById("node-id").textContent = "Node: " + node.id;
  choicesEl.replaceChildren();

  // Unmet conditions hide the choice entirely.
  const visible = node.choices.filter(function (choice) {
    return Narrative.conditionsMet(choice.conditions, flags);
  });

  if (node.choices.length === 0) {
    choicesEl.append(document.createTextNode("— End of conversation —"));
  } else if (visible.length === 0) {
    choicesEl.append(document.createTextNode("— No choices are currently available (check the facts) —"));
  }

  visible.forEach(function (choice) {
    choicesEl.append(button(choice.text, function () {
      try {
        Narrative.applyAction(choice.action, flags);
      } catch (err) {
        messagesEl.className = "messages error";
        messagesEl.textContent = "Could not apply action: " + err.message;
        return;
      }
      checkRegistry();
      addTranscript("You", choice.text, true);
      renderFlags();
      goTo(choice.target);
    }));
  });

  if (node.choices.length === 0 || visible.length === 0) {
    choicesEl.append(button("↺ Restart", restart));
  }
}

let startingFlags = new Map();

function restart() {
  flags = new Map(startingFlags);
  renderFlags();
  start();
}

function start() {
  transcriptEl.replaceChildren();
  show("stage", true);
  show("log", true);
  goTo(story.start);
}

document.getElementById("start-btn").addEventListener("click", function () {
  if (!story || Narrative.validate(story, registry).length) {
    checkRegistry();
    return;
  }
  startingFlags = new Map(flags);
  start();
});

document.getElementById("file").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (file) file.text().then(loadText).catch(function (err) {
    messagesEl.className = "messages error";
    messagesEl.textContent = "Could not read file: " + err.message;
  });
  event.target.value = "";
});

document.getElementById("paste-btn").addEventListener("click", function () {
  loadText(document.getElementById("paste").value);
});

document.getElementById("example-btn").addEventListener("click", function () {
  fetch("../example-conversation.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(loadText)
    .catch(function (err) {
      messagesEl.className = "messages error";
      messagesEl.textContent = "Could not load example: " + err.message;
    });
});

function register(fact) {
  registry.push(fact);
  flags.set(fact.id, fact.initial);
}

document.getElementById("add-flag-btn").addEventListener("click", function () {
  const input = document.getElementById("flag-id");
  const id = input.value.trim();
  if (!id || registry.some(function (flag) { return flag.id === id; })) {
    messagesEl.className = "messages error";
    messagesEl.textContent = "Enter a nonempty, unique fact ID.";
    return;
  }
  const type = document.getElementById("fact-type").value;
  register({ id: id, type: type, initial: Narrative.defaultValue(type), description: "" });
  input.value = "";
  renderFlags();
  checkRegistry();
});

document.getElementById("register-btn").addEventListener("click", function () {
  if (!story) {
    checkRegistry();
    return;
  }
  try {
    Narrative.registerReferenced(story, registry).forEach(register);
  } catch (err) {
    messagesEl.className = "messages error";
    messagesEl.textContent = err.message;
    return;
  }
  renderFlags();
  checkRegistry();
});

Narrative.valueTypes.forEach(function (type) {
  const option = document.createElement("option");
  option.value = type;
  option.textContent = type;
  document.getElementById("fact-type").append(option);
});
document.getElementById("fact-type").value = "boolValue";
renderFlags();
