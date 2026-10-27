(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.SecondChanceAdventureEventEngine = engine;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function createState(stage) {
    return {
      variables: Object.fromEntries((stage.variables || []).map(variable => [variable.id, variable.initial])),
      fired: new Set(),
      visibleObjects: new Map((stage.objects || []).map(object => [object.id, object.visible !== false]))
    };
  }

  function matchesTrigger(trigger, signal) {
    return trigger?.type === signal.type &&
      (!trigger.objectId || trigger.objectId === signal.objectId) &&
      (!trigger.cardId || trigger.cardId === signal.cardId) &&
      (!trigger.variableId || trigger.variableId === signal.variableId);
  }

  function matchesCondition(condition, state, definitions) {
    const definition = definitions.get(condition.variableId);
    if (!definition) return false;
    let actual = state.variables[condition.variableId];
    let expected = condition.value;
    if (definition.type === 'number') {
      actual = Number(actual); expected = Number(expected);
      if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
    } else if (definition.type === 'boolean') {
      actual = actual === true; expected = expected === true || expected === 'true';
    } else {
      actual = String(actual ?? ''); expected = String(expected ?? '');
    }
    switch (condition.operator) {
      case 'eq': return actual === expected;
      case 'ne': return actual !== expected;
      case 'gt': return actual > expected;
      case 'gte': return actual >= expected;
      case 'lt': return actual < expected;
      case 'lte': return actual <= expected;
      default: return false;
    }
  }

  function dispatch(stage, state, signal) {
    const effects = [];
    const queue = [signal];
    const definitions = new Map((stage.variables || []).map(variable => [variable.id, variable]));
    const events = (stage.events || []).map((event, index) => ({ event, index }))
      .sort((a, b) => (a.event.priority || 0) - (b.event.priority || 0) || a.index - b.index);
    let processed = 0;
    while (queue.length && processed < 64) {
      const current = queue.shift();
      processed++;
      for (const { event } of events) {
        if (event.enabled === false || event.once !== false && state.fired.has(event.id)) continue;
        if (!matchesTrigger(event.trigger, current)) continue;
        const conditions = event.conditions || [];
        const passes = conditions.length === 0 || (event.conditionMode === 'any'
          ? conditions.some(condition => matchesCondition(condition, state, definitions))
          : conditions.every(condition => matchesCondition(condition, state, definitions)));
        if (!passes) continue;
        if (event.once !== false) state.fired.add(event.id);
        for (const action of event.actions || []) {
          if (action.type === 'set-variable' || action.type === 'add-variable') {
            const definition = definitions.get(action.variableId);
            if (!definition) continue;
            const previous = state.variables[action.variableId];
            let next = action.type === 'add-variable'
              ? Number(previous || 0) + Number(action.amount || 0) : action.value;
            if (definition.type === 'number') next = Number.isFinite(Number(next)) ? Number(next) : 0;
            else if (definition.type === 'boolean') next = next === true || next === 'true';
            else next = String(next ?? '');
            state.variables[action.variableId] = next;
            if (previous !== next) queue.push({ type: 'variable-changed', variableId: action.variableId });
          } else if ((action.type === 'show-object' || action.type === 'hide-object') && state.visibleObjects.has(action.objectId)) {
            state.visibleObjects.set(action.objectId, action.type === 'show-object');
          }
          effects.push({ ...action, eventId: event.id });
        }
      }
    }
    return effects;
  }

  return { createState, dispatch, matchesCondition };
});
