const fs = require('fs');
const path = require('path');
const dir = 'c:\\Users\\anush\\Downloads\\VASTRALUU-master\\VASTRALUU-master';

const scriptContent = `
<script>
  window._debugLogs = [];
  const oldLog = console.log;
  const oldWarn = console.warn;
  const oldErr = console.error;
  
  function updateDebugPanel() {
    let panel = document.getElementById('debug-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'debug-panel';
      panel.style.cssText = 'position:fixed;bottom:0;right:0;width:400px;height:300px;background:rgba(0,0,0,0.8);color:lime;font-family:monospace;font-size:12px;overflow-y:auto;z-index:999999;padding:10px;pointer-events:none;';
      document.body.appendChild(panel);
    }
    panel.innerHTML = window._debugLogs.join('<br>');
    panel.scrollTop = panel.scrollHeight;
  }

  function addLog(type, args) {
    const msg = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    window._debugLogs.push('[' + type + '] ' + msg);
    updateDebugPanel();
  }

  console.log = function() { addLog('LOG', arguments); oldLog.apply(console, arguments); };
  console.warn = function() { addLog('WARN', arguments); oldWarn.apply(console, arguments); };
  console.error = function() { addLog('ERR', arguments); oldErr.apply(console, arguments); };
  
  window.addEventListener('error', function(e) { addLog('ERR', [e.message, e.filename, e.lineno]); });
  window.addEventListener('unhandledrejection', function(e) { addLog('PROMISE', [e.reason]); });
</script>
`;

['shop.html', 'index.html'].forEach(page => {
    const p = path.join(dir, page);
    if (fs.existsSync(p)) {
        let c = fs.readFileSync(p, 'utf8');
        if (!c.includes('debug-panel')) {
            c = c.replace('</body>', scriptContent + '\n</body>');
            fs.writeFileSync(p, c, 'utf8');
            console.log('Injected debug into ' + page);
        }
    }
});

// Also add console logs to shopify.js flow
let shopify = fs.readFileSync(path.join(dir, 'shopify.js'), 'utf8');
if (!shopify.includes('DEBUG:')) {
    shopify = shopify.replace('function renderFallbackProducts(grid) {', "function renderFallbackProducts(grid) {\\n  console.log('DEBUG: renderFallbackProducts started');\\n  try {");
    shopify = shopify.replace('    var countEl = document.getElementById(\\'product - count\\');\\n    if (countEl) countEl.textContent = FALLBACK_PRODUCTS.length;\\n  }', "    var countEl = document.getElementById('product-count');\\n    if (countEl) countEl.textContent = FALLBACK_PRODUCTS.length;\\n  } catch (err) { console.error('DEBUG: renderFallbackProducts ERROR', err); }\\n}");

    // Also log result of Shopify Fetch
    shopify = shopify.replace('res = await fetch(SHOPIFY_ENDPOINT', "console.log('DEBUG: Starting fetch to', SHOPIFY_ENDPOINT); res = await fetch(SHOPIFY_ENDPOINT");
    shopify = shopify.replace('if (!products.length) {', "if (!products.length) {\n    console.log('DEBUG: products.length is 0');");
    shopify = shopify.replace('renderFallbackProducts(grid);', "console.log('DEBUG: calling renderFallbackProducts');\n      renderFallbackProducts(grid);");
    fs.writeFileSync(path.join(dir, 'shopify.js'), shopify, 'utf8');
    console.log('Injected debug into shopify.js');
}
