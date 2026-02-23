/**
 * Shims for GM_setValue / GM_getValue / GM_deleteValue / GM_listValues.
 * Uses chrome.storage.local (synchronous-style wrapper via a pre-loaded cache).
 *
 * Note: The GM API is synchronous but chrome.storage is async.
 * We use a synchronous in-memory cache that is populated at script load time.
 * This covers the common use-case; for scripts that rely on reading values
 * set by other tabs/contexts in real-time, a fully async approach would be needed.
 */
export const GM_STORAGE_SHIM = /* js */ `
var __gmStorage = {};
// Load all storage values synchronously-ish via a blocking XHR trick is not
// possible in MV3. We use an async init and queue calls until ready.
var __gmStorageReady = false;
var __gmStorageQueue = [];

chrome.storage.local.get(null, function(items) {
  __gmStorage = items || {};
  __gmStorageReady = true;
  __gmStorageQueue.forEach(function(fn) { fn(); });
  __gmStorageQueue = [];
});

function GM_setValue(key, value) {
  __gmStorage[key] = value;
  chrome.storage.local.set({ [key]: value });
}

function GM_getValue(key, defaultValue) {
  if (key in __gmStorage) return __gmStorage[key];
  return defaultValue !== undefined ? defaultValue : null;
}

function GM_deleteValue(key) {
  delete __gmStorage[key];
  chrome.storage.local.remove(key);
}

function GM_listValues() {
  return Object.keys(__gmStorage);
}
`;
