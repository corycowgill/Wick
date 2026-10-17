// Tiny event emitter shared by gameplay and presentation.
// Events: 'death', 'relight', 'pickup', 'levelComplete', plus juice events
// ('jump', 'land', 'drip', 'dripFail', 'reabsorb', 'steam', 'ignite', 'melt').
const handlers = new Map();

export const Events = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, []);
    handlers.get(name).push(fn);
  },
  off(name, fn) {
    const list = handlers.get(name);
    if (list) handlers.set(name, list.filter((f) => f !== fn));
  },
  emit(name, data) {
    if (Events.muted) return;
    const list = handlers.get(name);
    if (list) for (const fn of list) fn(data);
  },
  clear() { handlers.clear(); },
  muted: false,
};
