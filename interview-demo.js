/* Interview demo mode (?demo=1).
 * Loaded before every other script. In demo mode Web Storage is replaced by a
 * per-page in-memory store, so history, snapshots and settings never touch the
 * device and vanish on reload. Account and cloud IO are disabled in index.html.
 * This is a privacy convenience for live demos, not a security boundary. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.location) root.FACE_INTERVIEW_DEMO = api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function isDemo(search) {
    return new URLSearchParams(search || '').get('demo') === '1';
  }

  function installMemoryStorage(StorageCtor) {
    const proto = StorageCtor && StorageCtor.prototype;
    if (!proto) return false;
    const stores = new WeakMap();
    const storeFor = (target) => {
      if (!stores.has(target)) stores.set(target, new Map());
      return stores.get(target);
    };
    const methods = {
      getItem(key) {
        const store = storeFor(this);
        key = String(key);
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) { storeFor(this).set(String(key), String(value)); },
      removeItem(key) { storeFor(this).delete(String(key)); },
      clear() { storeFor(this).clear(); },
      key(index) { return Array.from(storeFor(this).keys())[index] ?? null; },
    };
    for (const [name, fn] of Object.entries(methods)) {
      Object.defineProperty(proto, name, { value: fn, configurable: true, writable: true });
    }
    Object.defineProperty(proto, 'length', {
      configurable: true,
      get() { return storeFor(this).size; },
    });
    return true;
  }

  function install(root) {
    if (!isDemo(root.location && root.location.search)) return false;
    // Fail closed: if storage cannot be isolated, the page still runs in demo
    // mode (no account/cloud) but reports that local isolation failed.
    root.FACE_INTERVIEW_DEMO_STORAGE_ISOLATED = installMemoryStorage(root.Storage);
    return true;
  }

  return Object.freeze({ isDemo, installMemoryStorage, install });
});
