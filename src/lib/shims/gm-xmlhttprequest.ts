/**
 * Content-script side shim for GM_xmlhttpRequest.
 * Delegates to background service worker via chrome.runtime.sendMessage.
 */
export const GM_XMLHTTPREQUEST_CONTENT_SHIM = /* js */ `
function GM_xmlhttpRequest(details) {
  var _details = {
    __gmxhr: true,
    url: details.url,
    method: details.method || 'GET',
    headers: details.headers || {},
    data: details.data || null,
    responseType: details.responseType || 'text',
    timeout: details.timeout || 0,
  };
  chrome.runtime.sendMessage(_details, function(response) {
    if (chrome.runtime.lastError) {
      if (typeof details.onerror === 'function') {
        details.onerror({ error: chrome.runtime.lastError.message });
      }
      return;
    }
    if (!response) {
      if (typeof details.onerror === 'function') {
        details.onerror({ error: 'No response from background' });
      }
      return;
    }
    if (response.error) {
      if (typeof details.onerror === 'function') {
        details.onerror({ error: response.error });
      }
      return;
    }
    if (typeof details.onload === 'function') {
      details.onload({
        status: response.status,
        statusText: response.statusText || '',
        responseText: response.responseText || '',
        responseHeaders: response.responseHeaders || '',
        finalUrl: details.url,
        readyState: 4,
        response: response.responseText || '',
      });
    }
  });
  // Return a dummy abort handle
  return { abort: function() {} };
}
`;

/**
 * Background service worker handler for GM_xmlhttpRequest messages.
 */
export const GM_XMLHTTPREQUEST_BACKGROUND_HANDLER = /* js */ `
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (!msg.__gmxhr) return false;
  var fetchOptions = {
    method: msg.method || 'GET',
    headers: msg.headers || {},
  };
  if (msg.data && msg.method !== 'GET' && msg.method !== 'HEAD') {
    fetchOptions.body = msg.data;
  }
  fetch(msg.url, fetchOptions)
    .then(function(r) {
      var headers = '';
      r.headers.forEach(function(v, k) { headers += k + ': ' + v + '\\r\\n'; });
      return r.text().then(function(text) {
        sendResponse({
          status: r.status,
          statusText: r.statusText,
          responseText: text,
          responseHeaders: headers,
        });
      });
    })
    .catch(function(err) {
      sendResponse({ error: err.message });
    });
  return true; // Keep async channel open — required for MV3
});
`;
