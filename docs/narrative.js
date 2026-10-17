// Shared validation for the narrative conversation JSON format.
// Loaded with a plain <script> tag; exposes window.Narrative.
(function () {
  function isString(value) {
    return typeof value === "string";
  }

  function validate(data) {
    const errors = [];

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return ["The file must contain a JSON object."];
    }
    if (!isString(data.title)) errors.push("`title` must be a string.");
    if (!isString(data.start)) errors.push("`start` must be a string.");
    if (!Array.isArray(data.flags)) errors.push("`flags` must be an array.");
    if (!Array.isArray(data.nodes)) errors.push("`nodes` must be an array.");
    if (errors.length) return errors;

    const flagIds = new Set();
    data.flags.forEach(function (flag, i) {
      const where = "flags[" + i + "]";
      if (!flag || typeof flag !== "object") {
        errors.push(where + " must be an object.");
        return;
      }
      if (!isString(flag.id) || flag.id === "") errors.push(where + ".id must be a nonempty string.");
      else if (flagIds.has(flag.id)) errors.push("Duplicate flag id `" + flag.id + "`.");
      else flagIds.add(flag.id);
      if (typeof flag.initial !== "boolean") errors.push(where + ".initial must be true or false.");
      if (!isString(flag.description)) errors.push(where + ".description must be a string.");
    });

    const nodeIds = new Set();
    data.nodes.forEach(function (node) {
      if (node && isString(node.id) && node.id !== "") {
        if (nodeIds.has(node.id)) errors.push("Duplicate node id `" + node.id + "`.");
        nodeIds.add(node.id);
      }
    });

    if (data.start === "" || !nodeIds.has(data.start)) {
      errors.push("`start` must name an existing node (got `" + data.start + "`).");
    }

    data.nodes.forEach(function (node, i) {
      if (!node || typeof node !== "object") {
        errors.push("nodes[" + i + "] must be an object.");
        return;
      }
      const where = isString(node.id) && node.id ? "Node `" + node.id + "`" : "nodes[" + i + "]";
      if (!isString(node.id) || node.id === "") errors.push(where + ": `id` must be a nonempty string.");
      if (!isString(node.speaker)) errors.push(where + ": `speaker` must be a string.");
      if (!isString(node.text)) errors.push(where + ": `text` must be a string.");
      if (!isString(node.next)) errors.push(where + ": `next` must be a string.");
      if (!Array.isArray(node.choices)) {
        errors.push(where + ": `choices` must be an array.");
        return;
      }
      if (isString(node.next) && node.next !== "" && node.choices.length > 0) {
        errors.push(where + ": cannot have both `next` and `choices`.");
      }
      if (isString(node.next) && node.next !== "" && !nodeIds.has(node.next)) {
        errors.push(where + ": `next` points to missing node `" + node.next + "`.");
      }
      node.choices.forEach(function (choice, j) {
        const cw = where + " choice " + (j + 1);
        if (!choice || typeof choice !== "object") {
          errors.push(cw + " must be an object.");
          return;
        }
        ["text", "target", "conditions", "action"].forEach(function (key) {
          if (!isString(choice[key])) errors.push(cw + ": `" + key + "` must be a string.");
        });
        if (isString(choice.target) && !nodeIds.has(choice.target)) {
          errors.push(cw + ": `target` points to missing node `" + choice.target + "`.");
        }
        if (isString(choice.conditions) && choice.conditions !== "" && !flagIds.has(choice.conditions)) {
          errors.push(cw + ": condition `" + choice.conditions + "` is not a registered flag.");
        }
        if (isString(choice.action) && choice.action !== "" && !flagIds.has(choice.action)) {
          errors.push(cw + ": action `" + choice.action + "` is not a registered flag.");
        }
      });
    });

    return errors;
  }

  window.Narrative = { validate: validate };
})();
