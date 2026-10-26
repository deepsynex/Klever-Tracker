/**
 * Development-only inline script that undoes what browser extensions add to the page before React
 * hydrates, so they don't flood the console with hydration-mismatch errors:
 *   - Attributes: Bitdefender (bis_skin_checked, bis_register, __processed_<uuid>__) and
 *     Grammarly (data-new-gr-c-s-check-loaded, data-gr-ext-installed).
 *   - Elements loaded from an extension URL (e.g. <script src="chrome-extension://…">) that an
 *     extension inserts into <head> or <body>. A script that has already been inserted still runs
 *     after it's removed, so the extension keeps working.
 *
 * It never runs in production builds, so it can't mask a real mismatch for users. Real mismatches
 * from our own code still show in development, because only extension-owned changes are touched.
 * The observer disconnects after 15 seconds, well after hydration has finished.
 */
export const stripExtensionAttributesScript = `(function(){
var exact={"data-new-gr-c-s-check-loaded":1,"data-gr-ext-installed":1};
var schemes=/^(chrome|moz|safari-web|ms-browser)?-?extension:\\/\\//i;
function bad(n){return n.indexOf("bis_")===0||n.indexOf("__processed_")===0||exact[n]===1}
function fromExtension(el){var u=el.getAttribute&&(el.getAttribute("src")||el.getAttribute("href"));return !!u&&schemes.test(u)}
function clean(el){if(!el.attributes)return;for(var i=el.attributes.length-1;i>=0;i--){var n=el.attributes[i].name;if(bad(n))el.removeAttribute(n)}}
function cleanTree(el){clean(el);if(el.querySelectorAll){var all=el.querySelectorAll("*");for(var i=0;i<all.length;i++)clean(all[i])}}
function handleAdded(node){if(node.nodeType!==1)return;if(fromExtension(node)&&node.parentNode){node.parentNode.removeChild(node);return}cleanTree(node)}
var mo=new MutationObserver(function(list){for(var i=0;i<list.length;i++){var m=list[i];
if(m.type==="attributes"){if(m.attributeName&&bad(m.attributeName))m.target.removeAttribute(m.attributeName)}
else{for(var j=0;j<m.addedNodes.length;j++)handleAdded(m.addedNodes[j])}}});
mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true});
cleanTree(document.documentElement);
var injected=document.querySelectorAll("script[src],link[href]");for(var k=0;k<injected.length;k++){if(fromExtension(injected[k]))injected[k].parentNode.removeChild(injected[k])}
setTimeout(function(){mo.disconnect()},15000);
})();`;
