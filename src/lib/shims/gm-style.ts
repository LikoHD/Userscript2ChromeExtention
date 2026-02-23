/**
 * Shim for GM_addStyle.
 * Injects a <style> element into the document head.
 */
export const GM_STYLE_SHIM = /* js */ `
function GM_addStyle(css) {
  var style = document.createElement('style');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  return style;
}
`;
