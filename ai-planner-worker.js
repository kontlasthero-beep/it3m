importScripts('ai-planner.js');

self.onmessage = event => {
  const { id, snapshot, difficulty } = event.data;
  try {
    self.postMessage({ id, plan: self.UCCAiPlanner.plan(snapshot, difficulty) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
