/**
 * Shims for miscellaneous GM_* APIs.
 */

export const GM_NOTIFICATION_SHIM = /* js */ `
function GM_notification(details, ondone) {
  var opts = typeof details === 'string'
    ? { text: details, title: 'Notification', image: '' }
    : details;
  chrome.runtime.sendMessage({
    __gmnotify: true,
    title: opts.title || 'Script Notification',
    message: opts.text || opts.message || '',
    iconUrl: opts.image || '',
  }, function() {
    if (typeof (opts.onclick || ondone) === 'function') {
      // ondone called immediately as a best-effort
      (opts.ondone || ondone || function(){})();
    }
  });
}
`;

export const GM_NOTIFICATION_BACKGROUND_HANDLER = /* js */ `
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (!msg.__gmnotify) return false;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: msg.iconUrl || 'icons/icon48.png',
    title: msg.title,
    message: msg.message,
  }, function(id) {
    sendResponse({ id: id });
  });
  return true;
});
`;

export const GM_SET_CLIPBOARD_SHIM = /* js */ `
function GM_setClipboard(data, info) {
  // Use the modern Clipboard API if available
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(data).catch(function(err) {
      console.warn('[GM_setClipboard] Failed:', err);
    });
  } else {
    // Fallback: execCommand (deprecated but still works in many cases)
    var el = document.createElement('textarea');
    el.value = data;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}
`;

export const GM_OPEN_IN_TAB_SHIM = /* js */ `
function GM_openInTab(url, options) {
  var active = true;
  if (typeof options === 'boolean') active = !options; // openInBackground
  else if (options && typeof options === 'object') active = !options.active === false;
  chrome.runtime.sendMessage({ __gmopenTab: true, url: url, active: active });
}
`;

export const GM_OPEN_IN_TAB_BACKGROUND_HANDLER = /* js */ `
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (!msg.__gmopenTab) return false;
  chrome.tabs.create({ url: msg.url, active: msg.active !== false });
  return false;
});
`;

export const GM_INFO_SHIM = /* js */ `
var GM_info = {
  script: {
    name: document.currentScript && document.currentScript.dataset.name || 'Unknown',
    version: '1.0.0',
    description: '',
  },
  scriptMetaStr: '',
  version: '4.0',
};
`;

export const GM_LOG_SHIM = /* js */ `
function GM_log() {
  console.log.apply(console, arguments);
}
`;
