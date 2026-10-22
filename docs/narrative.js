// Shared validation and runtime for the narrative conversation JSON format.
(function () {
  const valueTypes = ["intValue", "floatValue", "stringValue", "boolValue"];
  const comparisons = ["equals", "notEquals", "lessThan", "greaterThan", "greaterThanEqual", "lessThanEqual"];
  const actions = ["update", "delete", "add", "subtract"];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function matchesType(type, value) {
    if (type === "intValue") return Number.isSafeInteger(value);
    if (type === "floatValue") return typeof value === "number" && Number.isFinite(value);
    if (type === "stringValue") return typeof value === "string";
    if (type === "boolValue") return typeof value === "boolean";
    return false;
  }

  function defaultValue(type) {
    if (type === "boolValue") return false;
    if (type === "stringValue") return "";
    if (type === "intValue" || type === "floatValue") return 0;
    throw new Error("Unknown value type `" + type + "`.");
  }

  function parseValue(type, text) {
    const value = type === "stringValue" ? text :
      type === "boolValue" ? (text === "true" ? true : text === "false" ? false : null) :
      text.trim() === "" ? NaN : Number(text);
    if (!matchesType(type, value)) throw new Error("Enter a valid " + type + " value.");
    return value;
  }

  function valueType(operation) {
    return valueTypes.find(function (key) { return Object.hasOwn(operation, key); });
  }

  function validateOperation(operation, isAction) {
    const label = isAction ? "Action" : "Condition";
    if (!isObject(operation)) return [label + " must be an object."];
    const errors = [];
    if (typeof operation.fact !== "string" || !operation.fact.trim()) errors.push(label + " needs a nonempty `fact`.");
    const key = isAction ? "action" : "comparison";
    if (!(isAction ? actions : comparisons).includes(operation[key])) errors.push(label + " has an unsupported `" + key + "`.");
    const keys = valueTypes.filter(function (type) { return Object.hasOwn(operation, type); });
    const deleting = isAction && operation.action === "delete";
    if (keys.length !== (deleting ? 0 : 1)) errors.push(label + (deleting ? " delete must not have a value." : " needs exactly one typed value."));
    keys.forEach(function (type) {
      if (!matchesType(type, operation[type])) errors.push(label + " has an invalid `" + type + "`.");
    });
    const type = keys[0];
    const numeric = type === "intValue" || type === "floatValue";
    if (!isAction && comparisons.includes(operation.comparison) &&
        !["equals", "notEquals"].includes(operation.comparison) && !numeric) {
      errors.push("Ordered comparisons require a numeric value.");
    }
    if (isAction && operation.action === "subtract" && !numeric) errors.push("Subtract requires a numeric value.");
    if (isAction && operation.action === "add" && !numeric && type !== "stringValue") errors.push("Add requires a numeric or string value.");
    Object.keys(operation).forEach(function (property) {
      if (!["fact", key].concat(valueTypes).includes(property)) errors.push(label + " has an unsupported property `" + property + "`.");
    });
    return errors;
  }

  function validateRegistry(registry) {
    if (!Array.isArray(registry)) return ["The external registry must be an array."];
    const errors = [];
    const ids = new Set();
    registry.forEach(function (fact, i) {
      if (!isObject(fact) || typeof fact.id !== "string" || !fact.id.trim()) {
        errors.push("Registry entry " + (i + 1) + " needs a nonempty fact ID.");
        return;
      }
      if (ids.has(fact.id)) errors.push("Duplicate registry fact `" + fact.id + "`.");
      ids.add(fact.id);
      if (!matchesType(fact.type, fact.initial)) errors.push("Fact `" + fact.id + "` needs a valid type and matching initial value.");
      if (typeof fact.description !== "string") errors.push("Fact `" + fact.id + "` needs a description string.");
    });
    return errors;
  }

  function operations(data) {
    return data.nodes.flatMap(function (node) {
      return node.choices.flatMap(function (choice) {
        return choice.conditions.concat(choice.action === null ? [] : [choice.action]);
      });
    });
  }

  function referencedFacts(data) {
    return Array.from(new Set(operations(data).map(function (op) { return op.fact; })));
  }

  function registerReferenced(data, registry) {
    const errors = validate(data);
    if (errors.length) throw new Error(errors.join("\n"));
    const types = new Map();
    operations(data).forEach(function (op) {
      const type = valueType(op);
      if (!type) return;
      if (types.has(op.fact) && types.get(op.fact) !== type) throw new Error("Conflicting types for fact `" + op.fact + "`.");
      types.set(op.fact, type);
    });
    const additions = referencedFacts(data).filter(function (id) {
      return !registry.some(function (fact) { return fact.id === id; });
    }).map(function (id) {
      const type = types.get(id);
      if (!type) throw new Error("Choose a registry type for delete-only fact `" + id + "` manually.");
      return { id: id, type: type, initial: defaultValue(type), description: "" };
    });
    return additions;
  }

  function validate(data, registry) {
    const errors = [];
    if (!isObject(data)) return ["The file must contain a JSON object."];
    if ("flags" in data || "registry" in data) errors.push("Fact registries belong outside the Story JSON.");
    if (typeof data.start !== "string") errors.push("`start` must be a string.");
    if (!Array.isArray(data.nodes)) errors.push("`nodes` must be an array.");
    if (errors.length) return errors;
    if (registry !== undefined) errors.push.apply(errors, validateRegistry(registry));
    const facts = registry === undefined ? null : new Map(
      Array.isArray(registry) ? registry.filter(isObject).map(function (fact) { return [fact.id, fact]; }) : []);
    const nodeIds = new Set();
    data.nodes.forEach(function (node) {
      if (isObject(node) && typeof node.id === "string" && node.id) {
        if (nodeIds.has(node.id)) errors.push("Duplicate node id `" + node.id + "`.");
        nodeIds.add(node.id);
      }
    });
    if (!nodeIds.has(data.start)) errors.push("`start` must name an existing node.");
    data.nodes.forEach(function (node, i) {
      const where = "Node " + (node && node.id || i);
      if (!isObject(node)) { errors.push(where + " must be an object."); return; }
      ["id", "speaker", "text"].forEach(function (key) {
        if (typeof node[key] !== "string" || (key === "id" && !node[key])) errors.push(where + ": invalid `" + key + "`.");
      });
      if ("next" in node) errors.push(where + ": `next` is no longer supported. Use a Choice with a target.");
      if (!Array.isArray(node.choices)) { errors.push(where + ": `choices` must be an array."); return; }
      node.choices.forEach(function (choice, j) {
        const cw = where + " choice " + (j + 1);
        if (!isObject(choice)) { errors.push(cw + " must be an object."); return; }
        ["text", "target"].forEach(function (key) {
          if (typeof choice[key] !== "string") errors.push(cw + ": `" + key + "` must be a string.");
        });
        if (!nodeIds.has(choice.target)) errors.push(cw + ": `target` points to missing node `" + choice.target + "`.");
        if (!Array.isArray(choice.conditions)) errors.push(cw + ": `conditions` must be an array of Condition objects. Replace a legacy flag string with [{fact: ID, comparison: \"equals\", boolValue: true}], or [] for no condition.");
        if (typeof choice.action === "string") errors.push(cw + ": replace a legacy action string with {fact: ID, action: \"update\", boolValue: true}, or null for no action.");
        const ops = Array.isArray(choice.conditions) ? choice.conditions.map(function (op) { return [op, false]; }) : [];
        if (choice.action !== null) ops.push([choice.action, true]);
        ops.forEach(function (entry) {
          const op = entry[0];
          const opErrors = validateOperation(op, entry[1]);
          opErrors.forEach(function (error) { errors.push(cw + ": " + error); });
          if (!facts || opErrors.length) return;
          if (!facts.has(op.fact)) errors.push(cw + ": fact `" + op.fact + "` is not registered.");
          else if (valueType(op) && facts.get(op.fact).type !== valueType(op)) errors.push(cw + ": type mismatch for fact `" + op.fact + "`.");
        });
      });
    });
    return errors;
  }

  function conditionsMet(conditions, values) {
    return conditions.every(function (condition) {
      const errors = validateOperation(condition, false);
      if (errors.length) throw new Error(errors.join("\n"));
      if (!values.has(condition.fact)) return false;
      const type = valueType(condition);
      const current = values.get(condition.fact);
      if (!matchesType(type, current)) throw new Error("Type mismatch for fact `" + condition.fact + "`.");
      const expected = condition[type];
      switch (condition.comparison) {
        case "equals": return current === expected;
        case "notEquals": return current !== expected;
        case "lessThan": return current < expected;
        case "greaterThan": return current > expected;
        case "greaterThanEqual": return current >= expected;
        case "lessThanEqual": return current <= expected;
      }
    });
  }

  function applyAction(action, values) {
    if (action === null) return;
    const errors = validateOperation(action, true);
    if (errors.length) throw new Error(errors.join("\n"));
    if (action.action === "delete") { values.delete(action.fact); return; }
    const type = valueType(action);
    let result = action[type];
    if (action.action !== "update") {
      if (!values.has(action.fact)) throw new Error("Fact `" + action.fact + "` has no current value.");
      const current = values.get(action.fact);
      if (!matchesType(type, current)) throw new Error("Type mismatch for fact `" + action.fact + "`.");
      result = action.action === "add" ? current + result : current - result;
    }
    if (!matchesType(type, result)) throw new Error("Action result is outside the range of " + type + ".");
    values.set(action.fact, result);
  }

  window.Narrative = {
    valueTypes: valueTypes, comparisons: comparisons, actions: actions,
    matchesType: matchesType, defaultValue: defaultValue, parseValue: parseValue, valueType: valueType,
    validateOperation: validateOperation, validate: validate, validateRegistry: validateRegistry,
    referencedFacts: referencedFacts, registerReferenced: registerReferenced,
    conditionsMet: conditionsMet, applyAction: applyAction
  };
})();
