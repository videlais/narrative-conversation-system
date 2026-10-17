let story = null;
let nodesById = {};
let flags = {};

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
    messagesEl.textContent = "This conversation has problems:\n" + errors.join("\n");
    show("setup", false);
    show("stage", false);
    show("log", false);
    return;
  }
  story = data;
  nodesById = {};
  story.nodes.forEach(function (node) {
    nodesById[node.id] = node;
  });
  flags = {};
  story.flags.forEach(function (flag) {
    flags[flag.id] = flag.initial;
  });
  messagesEl.className = "messages ok";
  messagesEl.textContent = "Loaded \"" + story.title + "\" (" + story.nodes.length + " nodes).";
  renderFlags();
  show("setup", true);
  show("stage", false);
  show("log", false);
}

function loadText(text) {
  try {
    load(JSON.parse(text));
  } catch (err) {
    messagesEl.className = "messages error";
    messagesEl.textContent = "Invalid JSON: " + err.message;
  }
}

function renderFlags() {
  flagsEl.replaceChildren();
  if (story.flags.length === 0) {
    flagsEl.textContent = "This conversation has no flags.";
    return;
  }
  story.flags.forEach(function (flag) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = flags[flag.id];
    box.addEventListener("change", function () {
      flags[flag.id] = box.checked;
      if (!document.getElementById("stage").classList.contains("hidden")) {
        renderNode(currentId);
      }
    });
    const label = document.createElement("label");
    label.className = "inline";
    label.title = flag.description;
    label.append(box, flag.id);
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
  const node = nodesById[id];
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
  const node = nodesById[id];
  document.getElementById("speaker").textContent = node.speaker;
  document.getElementById("text").textContent = node.text;
  document.getElementById("node-id").textContent = "Node: " + node.id;
  choicesEl.replaceChildren();

  if (node.next !== "") {
    choicesEl.append(button("Continue ▸", function () { goTo(node.next); }));
    return;
  }

  // Unmet conditions hide the choice entirely.
  const visible = node.choices.filter(function (choice) {
    return choice.conditions === "" || flags[choice.conditions] === true;
  });

  if (node.choices.length === 0) {
    choicesEl.append(document.createTextNode("— End of conversation —"));
  } else if (visible.length === 0) {
    choicesEl.append(document.createTextNode("— No choices are currently available (check the flags) —"));
  }

  visible.forEach(function (choice) {
    choicesEl.append(button(choice.text, function () {
      addTranscript("You", choice.text, true);
      if (choice.action !== "") {
        flags[choice.action] = true;
        renderFlags();
      }
      goTo(choice.target);
    }));
  });

  if (node.choices.length === 0 || visible.length === 0) {
    choicesEl.append(button("↺ Restart", restart));
  }
}

let startingFlags = {};

function restart() {
  flags = Object.assign({}, startingFlags);
  renderFlags();
  start();
}

function start() {
  transcriptEl.replaceChildren();
  document.getElementById("title").textContent = story.title;
  show("stage", true);
  show("log", true);
  goTo(story.start);
}

document.getElementById("start-btn").addEventListener("click", function () {
  startingFlags = Object.assign({}, flags);
  start();
});

document.getElementById("file").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (file) file.text().then(loadText);
});

document.getElementById("paste-btn").addEventListener("click", function () {
  loadText(document.getElementById("paste").value);
});

document.getElementById("example-btn").addEventListener("click", function () {
  fetch("../example-conversation.json")
    .then(function (res) { return res.text(); })
    .then(loadText)
    .catch(function (err) {
      messagesEl.className = "messages error";
      messagesEl.textContent = "Could not load example: " + err.message;
    });
});
