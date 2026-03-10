const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\anush\\Downloads\\VASTRALUU-master\\VASTRALUU-master';
const pages = ['index.html', 'shop.html', 'product.html', 'about.html', 'contact.html', 'cart.html'];

console.log('--- STARTING STORE FIXES ---');

pages.forEach(page => {
    const filePath = path.join(dir, page);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    if (!content.includes('preconnect')) {
        content = content.replace(/<link rel="stylesheet"/, '  <link rel="preconnect" href="https://images.unsplash.com">\n  <link rel="preconnect" href="https://vastraluu.myshopify.com">\n  <link rel="dns-prefetch" href="https://vastraluu.myshopify.com">\n    <link rel="stylesheet"');
    }

    content = content.replace(/<script src="main\.js"><\/script>/g, '<script src="main.js" defer></script>');
    content = content.replace(/<script src="shopify\.js"><\/script>/g, '<script src="shopify.js" defer></script>');
    content = content.replace(/\?w=1600&q=80/g, '?w=1200&q=80');

    content = content.replace(/(<div class="page-hero"[^>]*>[\s\S]*?<img)([^>]*)(>)/, (match, start, attrs, end) => {
        if (attrs.includes('fetchpriority')) return match;
        return start + attrs + ' fetchpriority="high" decoding="async"' + end;
    });

    if (page === 'cart.html') {
        content = content.replace(/\s*<script>\s*\/\/ Clear old pre-Shopify cart[\s\S]*?<\/script>/m, '');
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed HTML optimizations in: ' + page);
});

const mainPath = path.join(dir, 'main.js');
if (fs.existsSync(mainPath)) {
    let main = fs.readFileSync(mainPath, 'utf8');
    main = main.replace(/localStorage\.removeItem\('anaya-cart'\);\r?\n?/g, '');
    fs.writeFileSync(mainPath, main, 'utf8');
    console.log('Fixed main.js: Removed localStorage wipe!');
}

const shopifyPath = path.join(dir, 'shopify.js');
if (fs.existsSync(shopifyPath)) {
    let shopify = fs.readFileSync(shopifyPath, 'utf8');

    const lines = shopify.split('\n');
    let patchedFetch = false;
    for (let i = 0; i < lines.length; i++) {
        if (!patchedFetch && lines[i].includes('const res = await fetch(SHOPIFY_ENDPOINT')) {
            let endIdx = i;
            let braceDepth = 0;
            let started = false;
            for (let j = i; j < Math.min(i + 20, lines.length); j++) {
                for (const ch of lines[j]) {
                    if (ch === '{') { braceDepth++; started = true; }
                    if (ch === '}') braceDepth--;
                }
                if (started && braceDepth <= 0) { endIdx = j; break; }
            }
            const newBlock = [
                '    const _abortCtrl = new AbortController();',
                '    const _timeoutId = setTimeout(function() { _abortCtrl.abort(); }, 8000);',
                '    let res;',
                '    try {',
                '      res = await fetch(SHOPIFY_ENDPOINT, {',
                "        method: 'POST',",
                '        headers: {',
                "          'Content-Type': 'application/json',",
                "          'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontAccessToken,",
                '        },',
                '        body: JSON.stringify({ query, variables }),',
                '        signal: _abortCtrl.signal,',
                '      });',
                '      clearTimeout(_timeoutId);',
                '    } catch (_fetchErr) {',
                '      clearTimeout(_timeoutId);',
                "      console.warn('Shopify fetch failed/timed out:', _fetchErr.message);",
                '      return null;',
                '    }'
            ].join('\n');
            lines.splice(i, endIdx - i + 1, ...newBlock.split('\n'));
            patchedFetch = true;
            console.log('shopify.js: Timeout logic applied.');
            break;
        }
    }
    shopify = lines.join('\n');

    // Patch loadCartPage
    const oldEarlyReturn = "if (!cartId) {\r\n    if (emptyState) emptyState.style.display = 'block';\r\n    if (cartWrapper) cartWrapper.style.display = 'none';\r\n    return;\r\n  }";
    const oldEarlyReturnLF = "if (!cartId) {\n    if (emptyState) emptyState.style.display = 'block';\n    if (cartWrapper) cartWrapper.style.display = 'none';\n    return;\n  }";
    const newEarlyReturn = `if (!cartId) {
    const localItems = JSON.parse(localStorage.getItem('anaya-cart') || '[]');
    if (localItems.length > 0) { renderLocalCart(localItems, emptyState, cartWrapper, tbody); return; }
    if (emptyState) emptyState.style.display = 'block';
    if (cartWrapper) cartWrapper.style.display = 'none';
    return;
  }`;

    if (shopify.includes(oldEarlyReturn)) shopify = shopify.replace(oldEarlyReturn, newEarlyReturn);
    else if (shopify.includes(oldEarlyReturnLF)) shopify = shopify.replace(oldEarlyReturnLF, newEarlyReturn);

    // Patch loadShopProducts to show fallback
    const lines2 = shopify.split('\n');
    for (let i = 0; i < lines2.length; i++) {
        if (lines2[i].includes('if (!products.length)') && lines2[i + 1] && lines2[i + 1].includes('grid.innerHTML')) {
            lines2[i] = "  if (!products.length) {\n    const hasActiveFilters = window._shopFilters && (window._shopFilters.colors.length > 0 || window._shopFilters.fabrics.length > 0 || window._shopFilters.occasions.length > 0 || window._shopFilters.categories.length > 0 || window._shopFilters.priceMin > 0 || window._shopFilters.priceMax < 50000);\n    if (hasActiveFilters) {";
            lines2[i + 1] = "      grid.innerHTML = '<div style=\"grid-column:1/-1;text-align:center;padding:60px 20px;\"><p style=\"font-family:var(--font-body);color:var(--light-text);\">No products found matching your filters.</p><button onclick=\"clearAllFilters()\" style=\"margin-top:16px;padding:10px 24px;background:var(--dark-text);color:white;border:none;font-family:var(--font-body);font-size:0.8rem;cursor:pointer;letter-spacing:0.08em;\">CLEAR FILTERS</button></div>';";
            lines2[i + 2] = "    } else { renderFallbackProducts(grid); }";
            lines2[i + 3] = "    return;";
            lines2[i + 4] = "  }";
            break;
        }
    }
    shopify = lines2.join('\n');

    // Append Local Cart and Fallback renderers
    if (!shopify.includes('function renderLocalCart(')) {
        const appendCode = `
// ============================================================
// LOCAL CART RENDER (for items added from static product cards)
// ============================================================
function renderLocalCart(items, emptyState, cartWrapper, tbody) {
  if (!items || items.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (cartWrapper) cartWrapper.style.display = 'none';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';
  if (cartWrapper) cartWrapper.style.display = 'grid';
  if (tbody) {
    tbody.innerHTML = items.map(function(item) {
      var safeId = String(item.id).replace(/[^a-zA-Z0-9]/g, '_');
      return '<tr data-local-id="' + item.id + '">' +
        '<td class="cart-product-cell"><div class="cart-product-info">' +
        '<img src="' + (item.image || 'https://placehold.co/80x107/f5e6cc/8B0000?text=Saree') + '" alt="' + item.name + '" class="cart-thumb">' +
        '<div><div class="cart-product-name">' + item.name + '</div><div class="cart-product-tags">Pure Silk \\u2022 Kanchipuram</div></div></div></td>' +
        '<td class="cart-color-cell"><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#C0392B;"></span></td>' +
        '<td class="cart-qty-cell"><div class="qty-stepper cart-qty-stepper">' +
        '<button onclick="changeLocalCartQty(\\'' + item.id + '\\', -1)">\\u2212</button>' +
        '<span class="qty-input" id="lqty-' + safeId + '">' + item.quantity + '</span>' +
        '<button onclick="changeLocalCartQty(\\'' + item.id + '\\', 1)">+</button></div></td>' +
        '<td class="cart-price-cell">\\u20b9' + (parseInt(item.price) * item.quantity).toLocaleString('en-IN') + '</td>' +
        '<td class="cart-remove-cell"><button class="cart-remove-btn" onclick="removeLocalCartItem(\\'' + item.id + '\\')">\\u00d7</button></td>' +
        '</tr>';
    }).join('');
  }
  var subtotal = items.reduce(function(s, i) { return s + (parseInt(i.price) * i.quantity); }, 0);
  var shipping = subtotal >= 5000 ? 0 : 199;
  var subtotalEl = document.getElementById('order-subtotal');
  var shippingEl = document.getElementById('order-shipping');
  var totalEl = document.getElementById('order-total');
  if (subtotalEl) subtotalEl.textContent = '\\u20b9' + subtotal.toLocaleString('en-IN');
  if (shippingEl) shippingEl.textContent = shipping === 0 ? 'FREE' : '\\u20b9199';
  if (totalEl) totalEl.textContent = '\\u20b9' + (subtotal + shipping).toLocaleString('en-IN');
}

function changeLocalCartQty(id, delta) {
  var items = JSON.parse(localStorage.getItem('anaya-cart') || '[]');
  var item = items.find(function(i) { return i.id === id; });
  if (!item) return;
  item.quantity = Math.max(1, item.quantity + delta);
  localStorage.setItem('anaya-cart', JSON.stringify(items));
  loadCartPage();
}

function removeLocalCartItem(id) {
  var items = JSON.parse(localStorage.getItem('anaya-cart') || '[]');
  items = items.filter(function(i) { return i.id !== id; });
  localStorage.setItem('anaya-cart', JSON.stringify(items));
  loadCartPage();
}

// ============================================================
// SHOP FALLBACK — Static products shown when API unavailable
// ============================================================
var FALLBACK_PRODUCTS = [
  { id:'p1', title:'Ruby Red Kanchipuram Silk Saree', handle:'ruby-red', price:'4200', compareAt:'5999', img:'https://placehold.co/400x533/c0392b/ffffff?text=Ruby+Silk+Saree', tags:['Pure Silk','Kanchipuram','Samudrika Pattu'] },
  { id:'p2', title:'Emerald Green Bridal Kanchipuram Pure Silk', handle:'emerald-green', price:'6800', compareAt:'9099', img:'https://placehold.co/400x533/4a7c59/ffffff?text=Emerald+Silk+Saree', tags:['Pure Silk','Bridal','Kalyana Pattu'] },
  { id:'p3', title:'Ivory Cream Pure Silk Heavy Zari Masterpiece', handle:'ivory-cream', price:'5499', compareAt:'6874', img:'https://placehold.co/400x533/f5e6cc/8B0000?text=Ivory+Silk+Saree', tags:['Pure Silk','Festival','Vastrakala Pattu'] },
  { id:'p4', title:'Royal Blue Kanchipuram Grand Silk Pattu Saree', handle:'royal-blue', price:'7200', compareAt:'8470', img:'https://placehold.co/400x533/234b7a/ffffff?text=Royal+Blue+Saree', tags:['Pure Silk','Samudrika Pattu'] },
  { id:'p5', title:'Magenta Festival Kanchipuram Pure Silk', handle:'magenta', price:'3800', compareAt:'5850', img:'https://placehold.co/400x533/8B0050/ffffff?text=Magenta+Silk+Saree', tags:['Pure Silk','Festival','Vastrakala Pattu'] },
  { id:'p6', title:'Saffron Bridal Kanchi Silk Saree', handle:'saffron', price:'5200', compareAt:'6500', img:'https://placehold.co/400x533/E07B00/ffffff?text=Saffron+Silk+Saree', tags:['Pure Silk','Bridal','Kalyana Pattu'] },
];

function renderFallbackProducts(grid) {
  grid.innerHTML = FALLBACK_PRODUCTS.map(function(p) {
    var discount = Math.round((1 - parseInt(p.price)/parseInt(p.compareAt))*100);
    return '<div class="product-card" data-product data-product-id="' + p.id + '" data-product-name="' + p.title + '" data-product-price="' + p.price + '" onclick="location.href=\\'product.html?handle=' + p.handle + '\\'">' +
      '<div class="product-card-img">' +
      '<span class="product-badge">' + discount + '% off</span>' +
      '<button class="product-wishlist" onclick="event.stopPropagation()"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg></button>' +
      '<img src="' + p.img + '" alt="' + p.title + '" loading="lazy">' +
      '<div class="product-add-overlay" data-add-cart onclick="event.stopPropagation()">Add to Cart</div>' +
      '</div><div class="product-card-info">' +
      '<div class="product-name">' + p.title + '</div>' +
      '<div class="product-pricing"><span class="product-price-old">\\u20b9' + parseInt(p.compareAt).toLocaleString('en-IN') + '</span><span class="product-price-new">\\u20b9' + parseInt(p.price).toLocaleString('en-IN') + '</span></div>' +
      '<div class="product-tags">' + p.tags.join(' \\u2022 ') + '</div>' +
      '</div></div>';
  }).join('');
  document.querySelectorAll('#product-grid .product-card').forEach(function(el) { el.classList.add('reveal','visible'); });
  initWishlist();
  if (typeof initAddToCartButtons === 'function') initAddToCartButtons();
  var countEl = document.getElementById('product-count');
  if (countEl) countEl.textContent = FALLBACK_PRODUCTS.length;
}
`;
        shopify += appendCode;
        console.log('shopify.js: Appended Local Cart & Fallback renderers.');
    }

    fs.writeFileSync(shopifyPath, shopify, 'utf8');
}

console.log('--- ALL FIXES APPLIED ---');
