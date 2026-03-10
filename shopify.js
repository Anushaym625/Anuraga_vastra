/* ============================================================
   Anuraga Vastra — SHOPIFY STOREFRONT API INTEGRATION
   Store: pycdeu-ex.myshopify.com
   ============================================================ */

const SHOPIFY_CONFIG = {
  storeDomain: 'vastraluu.myshopify.com',
  storefrontAccessToken: 'e6e796481662f11784c036ffcb9d86f2',
  apiVersion: '2024-01',
};

const SHOPIFY_ENDPOINT = `https://${SHOPIFY_CONFIG.storeDomain}/api/${SHOPIFY_CONFIG.apiVersion}/graphql.json`;

// ============================================================
// CORE GRAPHQL FETCHER
// ============================================================
async function shopifyFetch(query, variables = {}) {
  try {
    const fetchPromise = (async () => {
      const res = await fetch(SHOPIFY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontAccessToken,
        },
        body: JSON.stringify({ query, variables })
      });
      if (!res.ok) {
        console.error('Shopify API error:', res.status, res.statusText);
        return null;
      }
      const json = await res.json();
      if (json.errors) {
        console.error('Shopify GraphQL errors:', json.errors);
        return null;
      }
      return json.data;
    })();

    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Shopify fetch timed out strictly after 8 seconds')), 8000);
    });

    const data = await Promise.race([fetchPromise, timeoutPromise]);
    return data;
  } catch (err) {
    console.warn('Shopify fetch failed/timed out:', err.message);
    return null;
  }
}

// ============================================================
// PRODUCT QUERIES
// ============================================================
const PRODUCT_CARD_FRAGMENT = `
  fragment ProductCard on Product {
    id
    title
    description
    handle
    availableForSale
    tags
    priceRange {
      minVariantPrice { amount currencyCode }
    }
    compareAtPriceRange {
      minVariantPrice { amount currencyCode }
    }
    images(first: 2) {
      edges { node { url altText } }
    }
    variants(first: 10) {
      edges {
        node {
          id
          title
          availableForSale
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          selectedOptions { name value }
        }
      }
    }
  }
`;

// Fetch all products (for shop page)
async function getProducts({ first = 12, after = null, query = '' } = {}) {
  const gql = `
    ${PRODUCT_CARD_FRAGMENT}
    query GetProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query, sortKey: BEST_SELLING) {
        pageInfo { hasNextPage endCursor hasPreviousPage startCursor }
        edges { node { ...ProductCard } }
      }
    }
  `;
  const data = await shopifyFetch(gql, { first, after, query });
  return data?.products || null;
}

// Fetch single product by handle (standalone query — no fragment to avoid field conflicts)
async function getProduct(handle) {
  const gql = `
    query GetProduct($handle: String!) {
      product(handle: $handle) {
        id title handle availableForSale tags
        description descriptionHtml vendor productType
        priceRange { minVariantPrice { amount currencyCode } }
        compareAtPriceRange { minVariantPrice { amount currencyCode } }
        options { name values }
        images(first: 10) {
          edges { node { url altText } }
        }
        variants(first: 50) {
          edges {
            node {
              id title availableForSale quantityAvailable
              price { amount currencyCode }
              compareAtPrice { amount currencyCode }
              selectedOptions { name value }
              image { url altText }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyFetch(gql, { handle });
  return data?.product || null;
}

// Fetch collections
async function getCollections(first = 10) {
  const gql = `
    query GetCollections($first: Int!) {
      collections(first: $first) {
        edges {
          node {
            id title handle description
            image { url altText }
            products(first: 1) {
              edges { node { images(first:1){ edges { node { url } } } } }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyFetch(gql, { first });
  return data?.collections?.edges?.map(e => e.node) || [];
}

// Fetch products by collection handle
async function getProductsByCollection(collectionHandle, first = 12) {
  const gql = `
    ${PRODUCT_CARD_FRAGMENT}
    query GetCollectionProducts($handle: String!, $first: Int!) {
      collection(handle: $handle) {
        id title description
        products(first: $first) {
          edges { node { ...ProductCard } }
        }
      }
    }
  `;
  const data = await shopifyFetch(gql, { handle: collectionHandle, first });
  return data?.collection || null;
}

// ============================================================
// CART / CHECKOUT (Shopify Cart API)
// ============================================================
const CART_FRAGMENT = `
  fragment CartFields on Cart {
    id checkoutUrl
    totalQuantity
    cost {
      totalAmount { amount currencyCode }
      subtotalAmount { amount currencyCode }
    }
    lines(first: 50) {
      edges {
        node {
          id quantity
          cost { totalAmount { amount currencyCode } }
          merchandise {
            ... on ProductVariant {
              id title availableForSale
              price { amount currencyCode }
              compareAtPrice { amount currencyCode }
              image { url altText }
              product { title handle }
              selectedOptions { name value }
            }
          }
        }
      }
    }
  }
`;

// Create cart
async function cartCreate(lines = []) {
  const gql = `
    ${CART_FRAGMENT}
    mutation CartCreate($lines: [CartLineInput!]) {
      cartCreate(input: { lines: $lines }) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;
  const data = await shopifyFetch(gql, { lines });
  return data?.cartCreate?.cart || null;
}

// Add to cart
async function cartLinesAdd(cartId, lines) {
  const gql = `
    ${CART_FRAGMENT}
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;
  const data = await shopifyFetch(gql, { cartId, lines });
  return data?.cartLinesAdd?.cart || null;
}

// Update cart line quantity
async function cartLinesUpdate(cartId, lines) {
  const gql = `
    ${CART_FRAGMENT}
    mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;
  const data = await shopifyFetch(gql, { cartId, lines });
  return data?.cartLinesUpdate?.cart || null;
}

// Remove cart line
async function cartLinesRemove(cartId, lineIds) {
  const gql = `
    ${CART_FRAGMENT}
    mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;
  const data = await shopifyFetch(gql, { cartId, lineIds });
  return data?.cartLinesRemove?.cart || null;
}

// Get cart
async function getCart(cartId) {
  const gql = `
    ${CART_FRAGMENT}
    query GetCart($cartId: ID!) {
      cart(id: $cartId) { ...CartFields }
    }
  `;
  const data = await shopifyFetch(gql, { cartId });
  return data?.cart || null;
}

// ============================================================
// CART STATE MANAGER (localStorage-backed Shopify cart)
// ============================================================
const ShopifyCart = {
  getCartId() { return localStorage.getItem('shopify-cart-id'); },
  setCartId(id) { localStorage.setItem('shopify-cart-id', id); },
  clearCartId() { localStorage.removeItem('shopify-cart-id'); },

  async getOrCreateCart() {
    const id = this.getCartId();
    if (id) {
      const cart = await getCart(id);
      if (cart) return cart;
      // Cart expired — create new one
      this.clearCartId();
    }
    const cart = await cartCreate([]);
    if (cart) this.setCartId(cart.id);
    return cart;
  },

  async addItem(variantId, quantity = 1) {
    let cart = await this.getOrCreateCart();
    if (!cart) return null;
    cart = await cartLinesAdd(cart.id, [{ merchandiseId: variantId, quantity }]);
    if (cart) {
      this.setCartId(cart.id);
      updateShopifyCartBadge(cart.totalQuantity);
      showToast('Added to your bag!');
    }
    return cart;
  },

  async updateItem(lineId, quantity) {
    const cartId = this.getCartId();
    if (!cartId) return null;
    const cart = await cartLinesUpdate(cartId, [{ id: lineId, quantity }]);
    if (cart) updateShopifyCartBadge(cart.totalQuantity);
    return cart;
  },

  async removeItem(lineId) {
    const cartId = this.getCartId();
    if (!cartId) return null;
    const cart = await cartLinesRemove(cartId, [lineId]);
    if (cart) updateShopifyCartBadge(cart.totalQuantity);
    return cart;
  },

  async checkout() {
    const cart = await this.getOrCreateCart();
    if (cart?.checkoutUrl) {
      window.location.href = cart.checkoutUrl;
    } else {
      showToast('Unable to start checkout. Please try again.');
    }
  },

  async getCount() {
    const id = this.getCartId();
    if (!id) return 0;
    const cart = await getCart(id);
    return cart?.totalQuantity || 0;
  },
};

// ============================================================
// UI HELPERS
// ============================================================
function updateShopifyCartBadge(count) {
  document.querySelectorAll('.cart-badge').forEach(b => {
    b.textContent = count;
    b.style.display = count > 0 ? 'flex' : 'none';
  });
}

function formatPrice(amount, currencyCode = 'INR') {
  const num = parseFloat(amount || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(num);
}

function getDiscountPercent(price, compareAt) {
  if (!compareAt || parseFloat(compareAt) <= parseFloat(price)) return null;
  const pct = Math.round((1 - parseFloat(price) / parseFloat(compareAt)) * 100);
  return pct > 0 ? pct : null;
}

// ============================================================
// PRODUCT CARD RENDERER
// ============================================================
function renderProductCard(product, clickUrl = null) {
  const img = product.images?.edges?.[0]?.node;
  const imgSrc = img?.url || `https://placehold.co/400x533/f5e6cc/8B0000?text=${encodeURIComponent(product.title)}`;
  const imgAlt = img?.altText || product.title;

  const price = product.priceRange?.minVariantPrice?.amount;
  const compareAt = product.compareAtPriceRange?.minVariantPrice?.amount;
  const currency = product.priceRange?.minVariantPrice?.currencyCode || 'INR';
  const discount = getDiscountPercent(price, compareAt);

  const firstVariantId = product.variants?.edges?.[0]?.node?.id;
  const productUrl = clickUrl || `product.html?handle=${product.handle}`;

  const wishlist = typeof getWishlist === 'function' ? getWishlist() : [];
  const inWishlist = wishlist.includes(product.handle) || wishlist.includes(product.id);

  return `
    <div class="product-card" data-product
         data-handle="${product.handle}"
         data-product-id="${product.id}"
         data-variant-id="${firstVariantId || ''}"
         data-product-name="${product.title}"
         data-product-price="${price}"
         onclick="sessionStorage.setItem('av_current_product', '${product.handle}'); location.href='${productUrl}'">
      <div class="product-card-img">
        ${discount ? `<span class="product-badge">${discount}% off</span>` : ''}
        <button class="product-wishlist ${inWishlist ? 'active-wishlist' : ''}" onclick="event.stopPropagation()">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <img src="${imgSrc}" alt="${imgAlt}" loading="lazy">
        <div class="product-add-overlay shopify-add-to-cart"
             data-variant-id="${firstVariantId || ''}"
             onclick="event.stopPropagation(); shopifyAddToCart(this)">
          Add to Cart
        </div>
      </div>
      <div class="product-card-info">
        <div class="product-name">${product.title}</div>
        <div class="product-pricing">
          ${compareAt && parseFloat(compareAt) > parseFloat(price)
      ? `<span class="product-price-old">${formatPrice(compareAt, currency)}</span>` : ''}
          <span class="product-price-new">${formatPrice(price, currency)}</span>
        </div>
        <div class="product-tags">${product.tags?.slice(0, 3).join(' • ') || 'Pure Silk • Kanchipuram'}</div>
      </div>
    </div>
  `;
}

// ============================================================
// ADD TO CART (called from HTML onclick)
// ============================================================
async function shopifyAddToCart(btn) {
  const variantId = btn?.dataset?.variantId;
  if (!variantId) {
    showToast('Please select a variant first.');
    return;
  }
  btn.textContent = 'Adding...';
  btn.style.pointerEvents = 'none';
  const cart = await ShopifyCart.addItem(variantId, 1);
  btn.textContent = cart ? '✓ Added!' : 'Add to Cart';
  setTimeout(() => {
    btn.textContent = 'Add to Cart';
    btn.style.pointerEvents = '';
  }, 2000);
}

// ============================================================
// NEWSLETTER SIGNUP via Shopify (customer create)
// ============================================================
async function shopifyNewsletterSignup(email) {
  const gql = `
    mutation CustomerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        customer { id email }
        customerUserErrors { field message code }
      }
    }
  `;
  const data = await shopifyFetch(gql, {
    input: { email, acceptsMarketing: true },
  });
  const errors = data?.customerCreate?.customerUserErrors;
  if (errors?.length > 0) {
    const alreadyExists = errors.some(e => e.code === 'TAKEN');
    return alreadyExists ? { success: true, alreadyExists: true } : { success: false, error: errors[0].message };
  }
  return { success: true };
}

// ============================================================
// INIT CART BADGE ON PAGE LOAD
// ============================================================
async function initShopifyCartBadge() {
  const id = ShopifyCart.getCartId();
  if (!id) return;
  const cart = await getCart(id);
  if (cart) updateShopifyCartBadge(cart.totalQuantity);
}

// ============================================================
// SHOP PAGE — Interactive Filters
// ============================================================

// Global filter state
window._shopFilters = { categories: [], colors: [], priceMin: 0, priceMax: 50000, fabrics: [], occasions: [] };
// Color palette for filter swatches
const FILTER_COLORS = [
  { name: 'Red', hex: '#C0392B' }, { name: 'Maroon', hex: '#800000' },
  { name: 'Pink', hex: '#E91E8C' }, { name: 'Orange', hex: '#E07B00' },
  { name: 'Saffron', hex: '#FF9933' }, { name: 'Gold', hex: '#D4A017' },
  { name: 'Yellow', hex: '#F4C430' }, { name: 'Cream', hex: '#F5E6CC' },
  { name: 'Ivory', hex: '#FDF6EC' }, { name: 'Green', hex: '#4a7c59' },
  { name: 'Teal', hex: '#008080' }, { name: 'Blue', hex: '#234b7a' },
  { name: 'Navy', hex: '#000080' }, { name: 'Purple', hex: '#6A0DAD' },
  { name: 'Black', hex: '#1A1A1A' }, { name: 'White', hex: '#FFFFFF' },
];

async function loadShopFilters() {
  // Load color swatches
  const colorContainer = document.getElementById('filter-color-swatches');
  if (colorContainer) {
    colorContainer.innerHTML = FILTER_COLORS.map(c => {
      const isLight = ['#F5E6CC', '#FDF6EC', '#FFFFFF', '#F4C430'].includes(c.hex);
      return `<span class="filter-swatch"
                    style="background:${c.hex};${isLight ? 'border:1.5px solid #d4c4b0;' : ''}
                           width:28px;height:28px;border-radius:50%;display:inline-block;cursor:pointer;
                           transition:transform 0.15s,box-shadow 0.15s;position:relative;"
                    title="${c.name}"
                    data-color="${c.name.toLowerCase()}"
                    onclick="toggleFilterColor(this, '${c.name.toLowerCase()}')">
              </span>`;
    }).join('');
  }

  // Load collections into Category filter from Shopify
  const catContainer = document.getElementById('filter-category-options');
  try {
    const collections = await getCollections(20);
    if (catContainer && collections?.length > 0) {
      catContainer.innerHTML = collections.map(col => `
        <label class="filter-checkbox">
          <input type="checkbox" value="${col.handle}" data-title="${col.title}" onchange="toggleFilterCategory(this)">
          ${col.title}
        </label>
      `).join('');
    } else if (catContainer) {
      catContainer.innerHTML = '<div style="font-size:0.78rem;color:var(--light-text);">No collections found</div>';
    }
  } catch (e) {
    if (catContainer) catContainer.innerHTML = '<div style="font-size:0.78rem;color:var(--light-text);">Could not load collections</div>';
  }

  // Price range
  const minEl = document.getElementById('price-range-min');
  const maxEl = document.getElementById('price-range-max');
  if (minEl) minEl.addEventListener('change', applyFilters);
  if (maxEl) maxEl.addEventListener('change', applyFilters);

  // Clear all
  document.getElementById('clear-all-filters')?.addEventListener('click', clearAllFilters);
}

function toggleFilterColor(el, colorName) {
  el.classList.toggle('active');
  if (el.classList.contains('active')) {
    el.style.outline = '2px solid var(--dark-text)';
    el.style.outlineOffset = '2px';
    el.style.transform = 'scale(1.15)';
    if (!window._shopFilters.colors.includes(colorName)) window._shopFilters.colors.push(colorName);
  } else {
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.transform = '';
    window._shopFilters.colors = window._shopFilters.colors.filter(c => c !== colorName);
  }
  applyFilters();
}

function toggleFilterCategory(cb) {
  const handle = cb.value;
  if (cb.checked) {
    if (!window._shopFilters.categories.includes(handle)) window._shopFilters.categories.push(handle);
  } else {
    window._shopFilters.categories = window._shopFilters.categories.filter(c => c !== handle);
  }
  applyFilters();
}

function syncPriceRange(el, which) {
  if (!window._shopFilters) return;
  const minEl = document.getElementById('price-range-min');
  const maxEl = document.getElementById('price-range-max');
  let min = parseInt(minEl.value), max = parseInt(maxEl.value);
  if (min > max - 500) {
    if (which === 'min') { min = max - 500; minEl.value = min; }
    else { max = min + 500; maxEl.value = max; }
  }
  window._shopFilters.priceMin = min;
  window._shopFilters.priceMax = max;
  const lMin = document.getElementById('price-min-label');
  const lMax = document.getElementById('price-max-label');
  if (lMin) lMin.textContent = min.toLocaleString('en-IN');
  if (lMax) lMax.textContent = max.toLocaleString('en-IN');
}

function applyFilters() {
  const f = window._shopFilters;
  // Update from checkboxes (fabric + occasion)
  f.fabrics = [...document.querySelectorAll('#filter-fabric-options input:checked')].map(i => i.value);
  f.occasions = [...document.querySelectorAll('#filter-occasion-options input:checked')].map(i => i.value);

  updateActiveFilterChips();

  // Pick up search query if present
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || '';

  const queryParams = q ? { query: q } : {};

  // If collection(s) selected, load from first collection with query
  if (f.categories.length > 0) {
    loadShopProducts({ collectionHandle: f.categories[0], ...queryParams });
  } else {
    loadShopProducts(queryParams);
  }
}

function updateActiveFilterChips() {
  const f = window._shopFilters;
  const container = document.getElementById('active-filters');
  if (!container) return;

  const chips = [];
  f.colors.forEach(c => chips.push({
    label: `Color: ${c}`, remove: () => {
      f.colors = f.colors.filter(x => x !== c);
      document.querySelectorAll('#filter-color-swatches .filter-swatch').forEach(el => {
        if (el.dataset.color === c) { el.classList.remove('active'); el.style.outline = ''; el.style.transform = ''; }
      });
      applyFilters();
    }
  }));
  f.fabrics.forEach(fab => chips.push({
    label: `Fabric: ${fab}`, remove: () => {
      document.querySelectorAll('#filter-fabric-options input:checked').forEach(cb => { if (cb.value === fab) cb.checked = false; });
      f.fabrics = f.fabrics.filter(x => x !== fab);
      applyFilters();
    }
  }));
  f.occasions.forEach(occ => chips.push({
    label: `Occasion: ${occ}`, remove: () => {
      document.querySelectorAll('#filter-occasion-options input:checked').forEach(cb => { if (cb.value === occ) cb.checked = false; });
      f.occasions = f.occasions.filter(x => x !== occ);
      applyFilters();
    }
  }));
  f.categories.forEach(cat => {
    const label = document.querySelector(`#filter-category-options input[value="${cat}"]`)?.dataset?.title || cat;
    chips.push({
      label: `Collection: ${label}`, remove: () => {
        document.querySelectorAll('#filter-category-options input:checked').forEach(cb => { if (cb.value === cat) cb.checked = false; });
        f.categories = f.categories.filter(x => x !== cat);
        applyFilters();
      }
    });
  });
  if (f.priceMin > 0 || f.priceMax < 50000) {
    chips.push({
      label: `Price: ₹${f.priceMin.toLocaleString('en-IN')}–₹${f.priceMax.toLocaleString('en-IN')}`, remove: () => {
        f.priceMin = 0; f.priceMax = 50000;
        document.getElementById('price-range-min').value = 0;
        document.getElementById('price-range-max').value = 50000;
        document.getElementById('price-min-label').textContent = '0';
        document.getElementById('price-max-label').textContent = '50,000';
        applyFilters();
      }
    });
  }

  if (chips.length > 0) {
    container.style.display = 'flex';
    container.innerHTML = chips.map((chip, i) => `
      <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:var(--soft-bg);border:1px solid var(--border-light);border-radius:20px;font-family:var(--font-body);font-size:0.73rem;color:var(--medium-text);">
        ${chip.label}
        <span onclick="window._filterChipRemovers[${i}]()" style="cursor:pointer;color:var(--light-text);font-weight:700;">×</span>
      </span>
    `).join('');
    window._filterChipRemovers = chips.map(c => c.remove);
  } else {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function clearAllFilters() {
  window._shopFilters = { categories: [], colors: [], priceMin: 0, priceMax: 50000, fabrics: [], occasions: [] };
  document.querySelectorAll('#filter-category-options input, #filter-fabric-options input, #filter-occasion-options input').forEach(cb => cb.checked = false);
  document.querySelectorAll('#filter-color-swatches .filter-swatch').forEach(el => {
    el.classList.remove('active'); el.style.outline = ''; el.style.transform = '';
  });
  const minEl = document.getElementById('price-range-min'); if (minEl) minEl.value = 0;
  const maxEl = document.getElementById('price-range-max'); if (maxEl) maxEl.value = 50000;
  document.getElementById('price-min-label') && (document.getElementById('price-min-label').textContent = '0');
  document.getElementById('price-max-label') && (document.getElementById('price-max-label').textContent = '50,000');
  const ac = document.getElementById('active-filters'); if (ac) { ac.style.display = 'none'; ac.innerHTML = ''; }
  loadShopProducts();
}

// ============================================================
// SHOP PAGE — Load & Render Products
// ============================================================
async function loadShopProducts({ query = '', collectionHandle = '', after = null } = {}) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  grid.innerHTML = '<div id="shop-loading" style="grid-column:1/-1;text-align:center;padding:60px 20px;font-family:var(--font-body);color:var(--light-text);font-size:0.9rem;"><div style="width:32px;height:32px;border:2px solid var(--border-light);border-top-color:var(--dark-text);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div>Loading...</div>';

  let result;
  if (collectionHandle) {
    // Load by collection handle
    const gql = `query CollectionProducts($handle:String!,$first:Int!){
      collection(handle:$handle){
        products(first:$first){
          pageInfo{hasNextPage endCursor}
          edges{node{id title handle availableForSale productType tags
            images(first:1){edges{node{url altText}}}
            variants(first:1){edges{node{id price{amount currencyCode} compareAtPrice{amount currencyCode} availableForSale selectedOptions{name value}}}}
            options{name values}
          }}
        }
      }
    }`;
    const data = await shopifyFetch(gql, { handle: collectionHandle, first: 100 });
    result = data?.collection?.products;
  } else {
    result = await getProducts({ first: 100, after, query });
  }

  let products = result?.edges?.map(e => e.node) || [];

  // JS Fallback Filtering for Collections + Tag combos
  const f = window._shopFilters;
  if (f) {
    if (f.colors.length > 0) {
      products = products.filter(p => (p.tags || []).some(t => f.colors.some(c => t.toLowerCase().includes(c.toLowerCase()))));
    }

    if (f.fabrics.length > 0) {
      products = products.filter(p => {
        const titleDesc = (p.title + ' ' + (p.description || '')).toLowerCase();
        const hasTag = (p.tags || []).some(t => f.fabrics.some(fab => t.toLowerCase().includes(fab.toLowerCase())));
        const hasText = f.fabrics.some(fab => titleDesc.includes(fab.toLowerCase()));
        return hasTag || hasText;
      });
    }

    if (f.occasions.length > 0) {
      products = products.filter(p => {
        const titleDesc = (p.title + ' ' + (p.description || '')).toLowerCase();
        const hasTag = (p.tags || []).some(t => f.occasions.some(occ => t.toLowerCase().includes(occ.toLowerCase())));
        const hasText = f.occasions.some(occ => titleDesc.includes(occ.toLowerCase()));
        return hasTag || hasText;
      });
    }

    if (f.priceMin > 0 || f.priceMax < 50000) {
      products = products.filter(p => {
        const price = parseFloat(p.variants?.edges?.[0]?.node?.price?.amount || 0);
        return price >= f.priceMin && price <= f.priceMax;
      });
    }
  }

  // Sort
  const sortVal = document.getElementById('sort-select')?.value || '';
  if (sortVal === 'Price: Low to High') products.sort((a, b) => parseFloat(a.variants?.edges?.[0]?.node?.price?.amount || 0) - parseFloat(b.variants?.edges?.[0]?.node?.price?.amount || 0));
  else if (sortVal === 'Price: High to Low') products.sort((a, b) => parseFloat(b.variants?.edges?.[0]?.node?.price?.amount || 0) - parseFloat(a.variants?.edges?.[0]?.node?.price?.amount || 0));

  if (!products.length) {
    const hasActiveFilters = window._shopFilters && (window._shopFilters.colors.length > 0 || window._shopFilters.fabrics.length > 0 || window._shopFilters.occasions.length > 0 || window._shopFilters.categories.length > 0 || window._shopFilters.priceMin > 0 || window._shopFilters.priceMax < 50000);
    if (hasActiveFilters) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;"><p style="font-family:var(--font-body);color:var(--light-text);">No products found matching your filters.</p><button onclick="clearAllFilters()" style="margin-top:16px;padding:10px 24px;background:var(--dark-text);color:white;border:none;font-family:var(--font-body);font-size:0.8rem;cursor:pointer;letter-spacing:0.08em;">CLEAR FILTERS</button></div>';
    } else { renderFallbackProducts(grid); }
    return;
  }
  grid.innerHTML = products.map(p => renderProductCard(p)).join('');
  document.querySelectorAll('.product-card').forEach(el => el.classList.add('reveal', 'visible'));
  initWishlist();

  const countEl = document.getElementById('product-count');
  if (countEl) countEl.textContent = products.length;

  const pageInfo = result?.pageInfo;
  const nextBtn = document.getElementById('pagination-next');
  if (nextBtn) {
    nextBtn.style.display = pageInfo?.hasNextPage ? '' : 'none';
    nextBtn.dataset.cursor = pageInfo?.endCursor || '';
  }
}
// ============================================================
// PRODUCT DETAIL PAGE — Load Product
// ============================================================
async function loadProductDetail() {
  const params = new URLSearchParams(window.location.search);
  let handle = params.get('handle') || sessionStorage.getItem('av_current_product');

  if (!handle) {
    const products = await getProducts({ first: 1 });
    handle = products?.edges?.[0]?.node?.handle;
    if (!handle) return;
  }

  const product = await getProduct(handle);
  if (!product) {
    document.querySelector('.product-detail-layout').innerHTML =
      '<p style="padding:60px;text-align:center;font-family:var(--font-body);">Product not found. <a href="shop.html">Browse our collection</a></p>';
    return;
  }

  // --- Page title & meta ---
  document.title = `${product.title} | Anuraga Vastra`;
  document.querySelector('meta[name="description"]')?.setAttribute('content',
    product.description?.slice(0, 160) || product.title);

  // --- Breadcrumb ---
  const catLabel = product.productType || product.tags?.[0] || 'Sarees';
  const bCat = document.getElementById('breadcrumb-category');
  const bName = document.getElementById('breadcrumb-product-name');
  if (bCat) bCat.textContent = catLabel;
  if (bName) bName.textContent = product.title;

  // --- Category & Title ---
  const catEl = document.getElementById('product-type-label') || document.querySelector('.product-detail-category');
  if (catEl) catEl.textContent = product.productType || catLabel;
  const titleEl = document.getElementById('product-title-el') || document.querySelector('.product-detail-name');
  if (titleEl) titleEl.textContent = product.title;

  // --- Description ---
  const descEl = document.querySelector('.product-description-content');
  if (descEl) descEl.innerHTML = product.descriptionHtml || product.description || 'No description available.';

  // --- Images & Thumbnails ---
  const images = product.images?.edges?.map(e => e.node) || [];
  const mainImg = document.getElementById('main-product-img');
  if (mainImg && images[0]) {
    mainImg.src = images[0].url;
    mainImg.alt = images[0].altText || product.title;
  }
  const thumbsContainer = document.getElementById('gallery-thumbs-container') || document.querySelector('.gallery-thumbs');
  if (thumbsContainer && images.length > 0) {
    thumbsContainer.innerHTML = images.slice(0, 6).map((img, i) => `
  <div class="gallery-thumb ${i === 0 ? 'active' : ''}" onclick="switchGalleryImage('${img.url}', this)">
    <img src="${img.url}" alt="${img.altText || product.title}" loading="lazy">
  </div>
`).join('');
  }

  // --- Variants ---
  const variants = product.variants?.edges?.map(e => e.node) || [];
  window._shopifyVariants = variants;
  const firstAvailable = variants.find(v => v.availableForSale) || variants[0];
  window._selectedVariantId = firstAvailable?.id;

  // --- Stock Status ---
  const stockEl = document.getElementById('product-stock-status');
  if (stockEl) {
    if (product.availableForSale) {
      stockEl.textContent = '✓ In Stock — Ships in 3–5 business days';
      stockEl.style.color = '#4a9e4a';
    } else {
      stockEl.textContent = '✕ Currently Out of Stock';
      stockEl.style.color = '#c0392b';
      const addBtn = document.getElementById('detail-add-cart');
      if (addBtn) { addBtn.textContent = 'OUT OF STOCK'; addBtn.disabled = true; addBtn.style.opacity = '0.5'; }
    }
  }

  // --- Color Options ---
  const colorOption = product.options?.find(o => ['color', 'colour'].includes(o.name.toLowerCase()));
  const colorSection = document.getElementById('color-section');
  const colorContainer = document.getElementById('color-options-container') || document.querySelector('.color-options');

  // Extended color map — name fragment → hex
  const COLOR_MAP = {
    'red': '#C0392B', 'ruby': '#9B111E', 'crimson': '#8B0000', 'maroon': '#800000',
    'pink': '#E91E8C', 'rose': '#FF007F', 'magenta': '#8B0050', 'fuchsia': '#FF00FF',
    'orange': '#E07B00', 'saffron': '#FF9933', 'yellow': '#F4C430', 'gold': '#D4A017',
    'mustard': '#FFDB58', 'cream': '#F5E6CC', 'ivory': '#FDF6EC', 'white': '#FFFFFF',
    'beige': '#F5F0E8', 'off-white': '#FAF5EE',
    'green': '#4a7c59', 'emerald': '#007A3D', 'mint': '#98FF98', 'teal': '#008080',
    'peacock': '#1a6b6b', 'turquoise': '#30D5C8',
    'blue': '#234b7a', 'navy': '#000080', 'royal': '#4169E1', 'cerulean': '#2A52BE',
    'purple': '#6A0DAD', 'violet': '#EE82EE', 'lavender': '#B57EDC', 'wine': '#722F37',
    'black': '#1A1A1A', 'grey': '#808080', 'gray': '#808080', 'silver': '#C0C0C0',
    'brown': '#8B4513', 'copper': '#B87333', 'bronze': '#CD7F32',
  };

  if (colorOption && colorSection && colorContainer) {
    const colors = colorOption.values;
    colorSection.style.display = '';
    colorContainer.innerHTML = colors.map((c, i) => {
      const cLow = c.toLowerCase();
      const hexKey = Object.keys(COLOR_MAP).find(k => cLow.includes(k));
      const bg = hexKey ? COLOR_MAP[hexKey] : null;
      // Use CSS color() or just the name as a CSS color if no map match
      const swatchStyle = bg
        ? `background:${bg};`
        : `background:${cLow}; border: 1.5px solid #ccc;`;
      const isLight = bg && ['#FDF6EC', '#F5E6CC', '#FAF5EE', '#FFFFFF', '#F5F0E8', '#98FF98'].includes(bg);
      const matchingVariant = variants.find(v =>
        v.selectedOptions?.some(o => ['color', 'colour'].includes(o.name.toLowerCase()) && o.value === c)
      );
      const available = matchingVariant?.availableForSale !== false;
      return `<span class="color-swatch-lg ${i === 0 ? 'active' : ''} ${!available ? 'sold-out' : ''}"
                style="${swatchStyle}${isLight ? 'border:1.5px solid #E8D5B7;' : ''}"
                title="${c}"
                data-color="${c}"
                onclick="selectColor(this, '${c}')"
                ${!available ? 'title="' + c + ' (Sold Out)"' : ''}>
                ${!available ? '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px;color:#fff;font-weight:700;">✕</span>' : ''}
          </span>`;
    }).join('');

    // Selected color label
    const colorLabel = document.getElementById('selected-color-name');
    if (colorLabel) colorLabel.textContent = colors[0];
  }

  // --- Size/Other Options ---
  product.options?.forEach(opt => {
    if (['color', 'colour'].includes(opt.name.toLowerCase())) return;
    const sizeSection = document.getElementById('size-section');
    const sizeContainer = document.getElementById('size-options-container');
    if (sizeSection && sizeContainer && opt.values.length > 1) {
      sizeSection.style.display = '';
      const label = sizeSection.querySelector('.option-label');
      if (label) label.textContent = opt.name;
      sizeContainer.innerHTML = opt.values.map((v, i) => `
    <button class="size-option-btn ${i === 0 ? 'active' : ''}"
            onclick="selectSize(this, '${opt.name}', '${v}')"
            style="padding:6px 16px; border:1.5px solid var(--border-light); background:${i === 0 ? 'var(--dark-text)' : 'white'}; color:${i === 0 ? 'white' : 'var(--dark-text)'}; font-family:var(--font-body); font-size:0.8rem; cursor:pointer; transition:all 0.2s;">${v}</button>
  `).join('');
    }
  });

  // --- Pricing ---
  updateProductPricing(firstAvailable);

  // --- Qty Stepper wiring (price preview) ---
  const qtyMinus = document.getElementById('qty-minus-btn');
  const qtyPlus = document.getElementById('qty-plus-btn');
  const qtyDisplay = document.getElementById('qty-display');
  if (qtyMinus && qtyPlus && qtyDisplay) {
    qtyMinus.onclick = () => {
      const cur = parseInt(qtyDisplay.textContent) || 1;
      if (cur > 1) { qtyDisplay.textContent = cur - 1; _updateQtyPreview(cur - 1); }
    };
    qtyPlus.onclick = () => {
      const cur = parseInt(qtyDisplay.textContent) || 1;
      qtyDisplay.textContent = cur + 1;
      _updateQtyPreview(cur + 1);
    };
  }

  // --- Add to Cart button ---
  const addBtn = document.getElementById('detail-add-cart');
  if (addBtn && product.availableForSale) {
    addBtn.onclick = async () => {
      if (!window._selectedVariantId) { showToast('Please select a variant.'); return; }
      const qty = parseInt(document.getElementById('qty-display')?.textContent || '1');
      addBtn.textContent = 'ADDING...';
      addBtn.disabled = true;
      await ShopifyCart.addItem(window._selectedVariantId, qty);
      addBtn.textContent = '✓ ADDED TO BAG';
      addBtn.style.backgroundColor = '#4a7c59';
      addBtn.style.borderColor = '#4a7c59';
      addBtn.style.color = '#fff';
      addBtn.disabled = false;
    };
  }

  // --- Wishlist Link ---
  const wishLink = document.querySelector('.wishlist-link');
  if (wishLink) {
    const currentList = typeof getWishlist === 'function' ? getWishlist() : [];
    const isSaved = currentList.includes(product.handle) || currentList.includes(product.id);
    
    if (isSaved) {
      wishLink.classList.add('active');
      wishLink.innerHTML = `<svg viewBox="0 0 24 24" style="fill:var(--primary); stroke:var(--primary);"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg> Saved to Wishlist`;
    }
    
    wishLink.onclick = () => {
      let list = typeof getWishlist === 'function' ? getWishlist() : [];
      const isActive = list.includes(product.handle) || list.includes(product.id);
      
      if (isActive) {
        list = list.filter(h => h !== product.handle && h !== product.id);
        wishLink.classList.remove('active');
        wishLink.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg> Add to Wishlist`;
        if(typeof showToast === 'function') showToast('Removed from wishlist');
      } else {
        list.push(product.handle);
        wishLink.classList.add('active');
        wishLink.innerHTML = `<svg viewBox="0 0 24 24" style="fill:var(--primary); stroke:var(--primary);"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg> Saved to Wishlist`;
        if(typeof showToast === 'function') showToast('Added to wishlist ♡');
      }
      if(typeof saveWishlist === 'function') saveWishlist(list);
    };
  }

  // --- Related Products ---
  const tag = product.productType || product.tags?.[0] || '';
  loadRelatedProducts(tag, product.handle);
}

function _updateQtyPreview(qty) {
  const priceEl = document.querySelector('.detail-price-new');
  const preview = document.getElementById('qty-price-preview');
  if (!priceEl || !preview) return;
  const rawPrice = parseFloat(priceEl.dataset.rawPrice || 0);
  const currency = priceEl.dataset.currency || 'INR';
  if (!rawPrice || qty <= 1) { preview.textContent = ''; return; }
  preview.textContent = '= ' + formatPrice(rawPrice * qty, currency);
}

function updateProductPricing(variant) {
  if (!variant) return;
  const priceOld = document.querySelector('.detail-price-old');
  const priceNew = document.querySelector('.detail-price-new');
  const badge = document.querySelector('.detail-discount-badge');

  const price = variant.price?.amount;
  const compareAt = variant.compareAtPrice?.amount;
  const currency = variant.price?.currencyCode || 'INR';

  if (priceNew) {
    priceNew.textContent = formatPrice(price, currency);
    priceNew.dataset.rawPrice = price;
    priceNew.dataset.currency = currency;
  }
  if (priceOld) {
    if (compareAt && parseFloat(compareAt) > parseFloat(price)) {
      priceOld.textContent = formatPrice(compareAt, currency);
      priceOld.style.display = '';
    } else { priceOld.style.display = 'none'; }
  }
  const pct = getDiscountPercent(price, compareAt);
  if (badge) { badge.textContent = pct ? `${pct}% OFF` : ''; badge.style.display = pct ? '' : 'none'; }
  // Reset qty preview
  document.getElementById('qty-display') && (document.getElementById('qty-display').textContent = '1');
  document.getElementById('qty-price-preview') && (document.getElementById('qty-price-preview').textContent = '');
}

function switchGalleryImage(url, thumbEl) {
  const mainImg = document.getElementById('main-product-img');
  if (mainImg) { mainImg.src = url; mainImg.style.opacity = '0'; setTimeout(() => mainImg.style.opacity = '1', 50); }
  document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
  thumbEl?.classList.add('active');
}

function selectColor(el, colorName) {
  document.querySelectorAll('.color-swatch-lg').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  const label = document.getElementById('selected-color-name');
  if (label) label.textContent = colorName;
  const variants = window._shopifyVariants || [];
  const match = variants.find(v =>
    v.selectedOptions?.some(o => ['color', 'colour'].includes(o.name.toLowerCase()) && o.value === colorName)
  );
  if (match) {
    window._selectedVariantId = match.id;
    updateProductPricing(match);
    if (match.image) {
      const mainImg = document.getElementById('main-product-img');
      if (mainImg) { mainImg.src = match.image.url; }
    }
  }
}

function selectSize(el, optionName, value) {
  el.closest('#size-options-container')?.querySelectorAll('.size-option-btn').forEach(b => {
    b.style.background = 'white'; b.style.color = 'var(--dark-text)'; b.classList.remove('active');
  });
  el.style.background = 'var(--dark-text)'; el.style.color = 'white'; el.classList.add('active');
}

async function loadRelatedProducts(tag, excludeHandle) {
  const grid = document.getElementById('also-like-grid') || document.querySelector('.also-like-grid');
  if (!grid) return;
  const q = tag ? `product_type:${tag}` : '';
  const result = await getProducts({ first: 8, query: q });
  if (!result) return;
  const filtered = result.edges.filter(e => e.node.handle !== excludeHandle).slice(0, 4);
  if (filtered.length === 0) {
    // fallback: get any products
    const fallback = await getProducts({ first: 5 });
    const fb = fallback?.edges?.filter(e => e.node.handle !== excludeHandle).slice(0, 4) || [];
    grid.innerHTML = fb.map(e => renderProductCard(e.node)).join('');
  } else {
    grid.innerHTML = filtered.map(e => renderProductCard(e.node)).join('');
  }
  initWishlist();
}

// ============================================================
// CART PAGE — Load Shopify Cart
// ============================================================
async function loadCartPage() {
  const tbody = document.getElementById('cart-tbody');
  const emptyState = document.querySelector('.cart-empty');
  const cartWrapper = document.querySelector('.cart-table-wrapper');
  if (!tbody) return;

  const localItems = JSON.parse(localStorage.getItem('anaya-cart') || '[]');

  const cartId = ShopifyCart.getCartId();
  let items = [];

  if (cartId) {
    const cart = await getCart(cartId);
    items = cart?.lines?.edges || [];
  }

  // Fallback to local cart if Shopify cart is empty or unavailable
  if (items.length === 0 && localItems.length > 0) {
    renderLocalCart(localItems, emptyState, cartWrapper, tbody);
    return;
  }

  if (items.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (cartWrapper) cartWrapper.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (cartWrapper) cartWrapper.style.display = 'grid';

  tbody.innerHTML = items.map(edge => {
    const item = edge.node;
    const variant = item.merchandise;
    const img = variant?.image?.url || 'https://placehold.co/80x107/f5e6cc/8B0000?text=Saree';
    const price = variant?.price?.amount || 0;
    const total = item.cost?.totalAmount?.amount || price;

      // Extract color dynamically
      let colorFound = null;
      let hexColor = '#C0392B'; // Default red
      const COLOR_MAP = {
        'red': '#C0392B', 'ruby': '#9B111E', 'crimson': '#8B0000', 'maroon': '#800000',
        'pink': '#E91E8C', 'rose': '#FF007F', 'magenta': '#8B0050', 'fuchsia': '#FF00FF',
        'orange': '#E07B00', 'saffron': '#FF9933', 'yellow': '#F4C430', 'gold': '#D4A017',
        'mustard': '#FFDB58', 'cream': '#F5E6CC', 'ivory': '#FDF6EC', 'white': '#FFFFFF',
        'beige': '#F5F0E8', 'off-white': '#FAF5EE',
        'green': '#4a7c59', 'emerald': '#007A3D', 'mint': '#98FF98', 'teal': '#008080',
        'peacock': '#1a6b6b', 'turquoise': '#30D5C8',
        'blue': '#234b7a', 'navy': '#000080', 'royal': '#4169E1', 'cerulean': '#2A52BE',
        'purple': '#6A0DAD', 'violet': '#EE82EE', 'lavender': '#B57EDC', 'wine': '#722F37',
        'black': '#1A1A1A', 'grey': '#808080', 'gray': '#808080', 'silver': '#C0C0C0',
        'brown': '#8B4513', 'copper': '#B87333', 'bronze': '#CD7F32',
      };

      // 1. Try variant options
      variant?.selectedOptions?.forEach(opt => {
        if (['color', 'colour'].includes(opt.name.toLowerCase())) colorFound = opt.value.toLowerCase();
      });
      // 2. Try product tags
      if (!colorFound) {
        variant?.product?.tags?.forEach(tag => {
           const match = Object.keys(COLOR_MAP).find(k => tag.toLowerCase().includes(k));
           if (match) colorFound = match;
        });
      }
      // 3. Try product title
      if (!colorFound) {
        const titleStr = variant?.product?.title?.toLowerCase() || '';
        colorFound = Object.keys(COLOR_MAP).find(k => titleStr.includes(k));
      }
      
      if (colorFound) {
        const hexKey = Object.keys(COLOR_MAP).find(k => colorFound.includes(k));
        if (hexKey) hexColor = COLOR_MAP[hexKey];
      }

      const isLight = ['#FDF6EC', '#F5E6CC', '#FAF5EE', '#FFFFFF', '#F5F0E8', '#98FF98'].includes(hexColor.toUpperCase());
      const borderStyle = isLight ? 'border: 1.5px solid #ccc;' : '';

    return `
      <tr data-line-id="${item.id}">
        <td class="cart-product-cell">
          <div class="cart-product-info">
            <img src="${img}" alt="${variant?.product?.title}" class="cart-thumb">
            <div>
              <div class="cart-product-name">${variant?.product?.title}</div>
              <div class="cart-product-tags">${variant?.title !== 'Default Title' ? variant?.title : 'Pure Silk'}</div>
            </div>
          </div>
        </td>
        <td class="cart-color-cell">
          <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${hexColor};${borderStyle}"></span>
        </td>
        <td class="cart-qty-cell">
          <div class="qty-stepper cart-qty-stepper">
            <button onclick="updateCartLine('${item.id}', ${item.quantity - 1})">−</button>
            <span class="qty-input" id="qty-${item.id}">${item.quantity}</span>
            <button onclick="updateCartLine('${item.id}', ${item.quantity + 1})">+</button>
          </div>
        </td>
        <td class="cart-price-cell">₹${parseInt(total).toLocaleString('en-IN')}</td>
        <td class="cart-remove-cell">
          <button class="cart-remove-btn" onclick="updateCartLine('${item.id}', 0)">×</button>
        </td>
      </tr>
    `;
  }).join('');

  // Summary
  if (cartId) {
    const cart = await getCart(cartId);
    const subtotal = parseInt(cart?.cost?.subtotalAmount?.amount || 0);
    const shipping = subtotal >= 5000 ? 0 : 199;
    const total = subtotal + shipping;

    const subEl = document.getElementById('order-subtotal');
    const shipEl = document.getElementById('order-shipping');
    const totEl = document.getElementById('order-total');

    if (subEl) subEl.textContent = '₹' + subtotal.toLocaleString('en-IN');
    if (shipEl) shipEl.textContent = shipping === 0 ? 'FREE' : '₹199';
    if (totEl) totEl.textContent = '₹' + total.toLocaleString('en-IN');
  }
}

function updateCartSummary(cart) {
  const sub = parseFloat(cart.cost?.subtotalAmount?.amount || 0);
  const currency = cart.cost?.subtotalAmount?.currencyCode || 'INR';
  const shipping = sub >= 5000 ? 0 : 199;
  const subtotalEl = document.getElementById('order-subtotal');
  const shippingEl = document.getElementById('order-shipping');
  const totalEl = document.getElementById('order-total');
  if (subtotalEl) subtotalEl.textContent = formatPrice(sub, currency);
  if (shippingEl) shippingEl.textContent = shipping === 0 ? 'FREE' : formatPrice(shipping, currency);
  if (totalEl) totalEl.textContent = formatPrice(sub + shipping, currency);
}

async function updateCartLine(lineId, newQty) {
  if (newQty < 1) { removeCartLine(lineId); return; }

  // Disable all cart buttons during update to prevent double-clicks
  document.querySelectorAll('.cart-qty-stepper button').forEach(b => {
    b.disabled = true;
    b.style.opacity = '0.4';
  });

  const cartId = ShopifyCart.getCartId();
  // Optimistically update qty display right away
  const qtyEl = document.getElementById(`qty-${lineId}`);
  if (qtyEl) qtyEl.textContent = newQty;

  try {
    const cart = await cartLinesUpdate(cartId, [{ id: lineId, quantity: newQty }]);
    if (cart) {
      // Check if Shopify capped the quantity (stock limit)
      const updatedLine = cart.lines.edges.find(e => e.node.id === lineId)?.node;
      const actualQty = updatedLine?.quantity ?? newQty;
      // Reload full cart to show accurate state from Shopify
      await loadCartPage();
      if (actualQty < newQty) {
        showToast(`Only ${actualQty} unit${actualQty > 1 ? 's' : ''} available for this item.`);
      }
    } else {
      // cartLinesUpdate returned null — likely API error, reload to show real state
      await loadCartPage();
      showToast('Could not update quantity. Please try again.');
    }
  } catch (e) {
    await loadCartPage();
  }
}

async function removeCartLine(lineId) {
  const cartId = ShopifyCart.getCartId();
  const cart = await cartLinesRemove(cartId, [lineId]);
  const row = document.querySelector(`[data-line-id="${lineId}"]`);
  if (row) row.remove();
  if (cart) {
    updateShopifyCartBadge(cart.totalQuantity);
    updateCartSummary(cart);
    if (cart.lines.edges.length === 0) {
      document.getElementById('empty-cart-state').style.display = 'block';
      document.querySelector('.cart-table-wrapper').style.display = 'none';
    }
  }
}

// ============================================================
// WISHLIST PAGE — Load Saved Items
// ============================================================
async function loadWishlistPage() {
  const emptyState = document.getElementById('wishlist-empty');
  const grid = document.getElementById('wishlist-grid');
  if (!grid) return;

  const handles = typeof getWishlist === 'function' ? getWishlist() : [];

  if (handles.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    grid.style.display = 'none';
    return;
  }

  // Fetch each product individually so Shopify doesn't do a fuzzy tag/collection search
  const products = [];
  for (const handle of handles) {
    const p = await getProduct(handle);
    if (p) products.push(p);
  }

  if (products.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    grid.style.display = 'none';
    return;
  }

  grid.innerHTML = products.map(p => renderProductCard(p)).join('');
  document.querySelectorAll('.product-card').forEach(el => el.classList.add('reveal', 'visible'));
  if (typeof initWishlist === 'function') initWishlist();
}

// ============================================================
// HOME PAGE — Load Best Sellers
// ============================================================
async function loadHomeBestSellers() {
  const track = document.querySelector('.carousel-track');
  if (!track) return;

  const result = await getProducts({ first: 6 });
  if (!result || result.edges.length === 0) return;

  const products = result.edges.map(e => e.node);
  track.innerHTML = products.map(p => `
<div class="product-card" style="flex: 0 0 calc((100% - 40px) / 3);"
     data-product data-product-id="${p.id}"
     data-variant-id="${p.variants?.edges?.[0]?.node?.id || ''}"
     data-product-name="${p.title}"
     data-product-price="${p.priceRange?.minVariantPrice?.amount}"
     onclick="sessionStorage.setItem('av_current_product', '${p.handle}'); location.href='product.html?handle=${p.handle}'">
  <div class="product-card-img">
    ${getDiscountPercent(p.priceRange?.minVariantPrice?.amount, p.compareAtPriceRange?.minVariantPrice?.amount)
      ? `<span class="product-badge">${getDiscountPercent(p.priceRange?.minVariantPrice?.amount, p.compareAtPriceRange?.minVariantPrice?.amount)}% off</span>` : ''}
    <button class="product-wishlist" onclick="event.stopPropagation()">
      <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
    </button>
    <img src="${p.images?.edges?.[0]?.node?.url || 'https://placehold.co/400x533/f5e6cc/8B0000?text=Saree'}"
         alt="${p.title}" loading="lazy">
    <div class="product-add-overlay shopify-add-to-cart"
         data-variant-id="${p.variants?.edges?.[0]?.node?.id || ''}"
         onclick="event.stopPropagation(); shopifyAddToCart(this)">Add to Cart</div>
  </div>
  <div class="product-card-info">
    <div class="product-name">${p.title}</div>
    <div class="product-pricing">
      ${p.compareAtPriceRange?.minVariantPrice?.amount && parseFloat(p.compareAtPriceRange.minVariantPrice.amount) > parseFloat(p.priceRange.minVariantPrice.amount)
      ? `<span class="product-price-old">${formatPrice(p.compareAtPriceRange.minVariantPrice.amount, p.compareAtPriceRange.minVariantPrice.currencyCode)}</span>` : ''}
      <span class="product-price-new">${formatPrice(p.priceRange.minVariantPrice.amount, p.priceRange.minVariantPrice.currencyCode)}</span>
    </div>
    <div class="product-tags">${p.tags?.slice(0, 3).join(' • ') || 'Pure Silk • Kanchipuram'}</div>
  </div>
</div>
  `).join('');

  // Re-init carousel
  document.querySelectorAll('.carousel-wrapper').forEach(initCarousel);
  initWishlist();
}

// ============================================================
// HOME PAGE — Load Categories from Shopify Collections
// ============================================================
async function loadHomeCategories() {
  const grid = document.querySelector('.category-grid');
  if (!grid) return;

  const collections = await getCollections(6);
  if (!collections || collections.length === 0) return;

  grid.innerHTML = collections.slice(0, 3).map(col => {
    const img = col.image?.url || col.products?.edges?.[0]?.node?.images?.edges?.[0]?.node?.url
      || 'https://images.unsplash.com/photo-1583391265543-26b18a8ffe85?w=800&q=80';
    return `
  <div class="category-card" onclick="sessionStorage.setItem('av_current_collection', '${col.handle}'); location.href='shop.html?collection=${col.handle}'">
    <div class="category-card-img">
      <img src="${img}" alt="${col.title}" loading="lazy">
      <div class="category-overlay"></div>
      <div class="category-info">
        <div class="category-name">${col.title.toUpperCase()}</div>
        <a href="shop.html?collection=${col.handle}" class="category-link">Shop the Latest</a>
      </div>
    </div>
  </div>
`;
  }).join('');
}

// ============================================================
// LOADING SPINNER
// ============================================================
const spinnerCSS = `
  .loading-spinner {
grid-column: 1/-1; display:flex; justify-content:center;
align-items:center; padding:80px; color:var(--light-text);
  }
  .loading-spinner::after {
content:''; width:36px; height:36px;
border:2px solid var(--border-light);
border-top-color:var(--primary-red);
border-radius:50%;
animation:spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform:rotate(360deg); } }
`;
const styleTag = document.createElement('style');
styleTag.textContent = spinnerCSS;
document.head.appendChild(styleTag);

// ============================================================
// PAGE-SPECIFIC INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Init cart badge
  initShopifyCartBadge();

  const path = window.location.pathname.toLowerCase();
  const page = path.split('/').pop() || 'index.html';

  if (page.includes('index') || path.endsWith('/')) {
    loadHomeBestSellers();
    loadHomeCategories();
  }

  if (page.includes('shop')) {
    const params = new URLSearchParams(window.location.search);
    const collection = params.get('collection') || sessionStorage.getItem('av_current_collection');
    const q = params.get('q');

    if (q) {
      // Modify page hero title to show search context
      const heroContent = document.querySelector('.page-hero-content p');
      if (heroContent) heroContent.textContent = `Search results for "${q}"`;
      loadShopProducts({ query: q });
    } else if (collection) {
      window._shopFilters.categories = [collection];
      loadShopProducts({ collectionHandle: collection });
    } else {
      loadShopProducts();
    }
    // Load interactive filters (color swatches, real collections, etc.)
    loadShopFilters();
    // Sort dropdown
    document.getElementById('sort-select')?.addEventListener('change', applyFilters);
  }

  if (page.includes('product')) {
    loadProductDetail();
  }

  if (page.includes('wishlist')) {
    loadWishlistPage();
  }

  if (page.includes('cart')) {
    loadCartPage();

    // Load "You May Also Like" suggestions from Shopify
    getProducts({ first: 4 }).then(result => {
      const grid = document.getElementById('cart-suggestions-grid');
      if (grid && result?.edges?.length) {
        grid.innerHTML = result.edges.map(e => renderProductCard(e.node)).join('');
      } else if (grid) {
        document.getElementById('cart-suggestions')?.remove();
      }
    });

    // Checkout button → Shopify hosted checkout
    document.querySelector('.checkout-btn')?.addEventListener('click', () => {
      ShopifyCart.checkout();
    });

    // Promo code (client-side)
    document.getElementById('promo-apply')?.addEventListener('click', () => {
      const code = document.getElementById('promo-input')?.value?.trim().toUpperCase();
      if (code === 'ANAYA10') showToast('Promo code applied! 10% off');
      else if (code) showToast('Invalid promo code.');
    });
  }

  // Newsletter signup
  document.querySelectorAll('.newsletter-form-el').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('.newsletter-input');
      if (!input?.value) return;
      const btn = form.querySelector('.newsletter-btn');
      if (btn) btn.textContent = 'Subscribing...';
      const result = await shopifyNewsletterSignup(input.value);
      if (result.success) {
        showToast(result.alreadyExists ? 'You\'re already subscribed!' : 'Thank you for subscribing!');
        input.value = '';
      } else {
        showToast(result.error || 'Subscription failed. Please try again.');
      }
      if (btn) btn.textContent = 'Subscribe';
    });
  });
});


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
    tbody.innerHTML = items.map(function (item) {
      var safeId = String(item.id).replace(/[^a-zA-Z0-9]/g, '_');
      return '<tr data-local-id="' + item.id + '">' +
        '<td class="cart-product-cell"><div class="cart-product-info">' +
        '<img src="' + (item.image || 'https://placehold.co/80x107/f5e6cc/8B0000?text=Saree') + '" alt="' + item.name + '" class="cart-thumb">' +
        '<div><div class="cart-product-name">' + item.name + '</div><div class="cart-product-tags">Pure Silk \u2022 Kanchipuram</div></div></div></td>' +
        '<td class="cart-color-cell"><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#C0392B;"></span></td>' +
        '<td class="cart-qty-cell"><div class="qty-stepper cart-qty-stepper">' +
        '<button onclick="changeLocalCartQty(\'' + item.id + '\', -1)">\u2212</button>' +
        '<span class="qty-input" id="lqty-' + safeId + '">' + item.quantity + '</span>' +
        '<button onclick="changeLocalCartQty(\'' + item.id + '\', 1)">+</button></div></td>' +
        '<td class="cart-price-cell">\u20b9' + (parseInt(item.price) * item.quantity).toLocaleString('en-IN') + '</td>' +
        '<td class="cart-remove-cell"><button class="cart-remove-btn" onclick="removeLocalCartItem(\'' + item.id + '\')">\u00d7</button></td>' +
        '</tr>';
    }).join('');
  }
  var subtotal = items.reduce(function (s, i) { return s + (parseInt(i.price) * i.quantity); }, 0);
  var shipping = subtotal >= 5000 ? 0 : 199;
  var subtotalEl = document.getElementById('order-subtotal');
  var shippingEl = document.getElementById('order-shipping');
  var totalEl = document.getElementById('order-total');
  if (subtotalEl) subtotalEl.textContent = '\u20b9' + subtotal.toLocaleString('en-IN');
  if (shippingEl) shippingEl.textContent = shipping === 0 ? 'FREE' : '\u20b9199';
  if (totalEl) totalEl.textContent = '\u20b9' + (subtotal + shipping).toLocaleString('en-IN');
}

function changeLocalCartQty(id, delta) {
  var items = JSON.parse(localStorage.getItem('anaya-cart') || '[]');
  var item = items.find(function (i) { return i.id === id; });
  if (!item) return;
  item.quantity = Math.max(1, item.quantity + delta);
  localStorage.setItem('anaya-cart', JSON.stringify(items));
  loadCartPage();
}

function removeLocalCartItem(id) {
  var items = JSON.parse(localStorage.getItem('anaya-cart') || '[]');
  items = items.filter(function (i) { return i.id !== id; });
  localStorage.setItem('anaya-cart', JSON.stringify(items));
  loadCartPage();
}

// ============================================================
// SHOP FALLBACK — Static products shown when API unavailable
// ============================================================
var FALLBACK_PRODUCTS = [
  { id: 'p1', title: 'Ruby Red Kanchipuram Silk Saree', handle: 'ruby-red', price: '4200', compareAt: '5999', img: 'https://placehold.co/400x533/c0392b/ffffff?text=Ruby+Silk+Saree', tags: ['Pure Silk', 'Kanchipuram', 'Samudrika Pattu'] },
  { id: 'p2', title: 'Emerald Green Bridal Kanchipuram Pure Silk', handle: 'emerald-green', price: '6800', compareAt: '9099', img: 'https://placehold.co/400x533/4a7c59/ffffff?text=Emerald+Silk+Saree', tags: ['Pure Silk', 'Bridal', 'Kalyana Pattu'] },
  { id: 'p3', title: 'Ivory Cream Pure Silk Heavy Zari Masterpiece', handle: 'ivory-cream', price: '5499', compareAt: '6874', img: 'https://placehold.co/400x533/f5e6cc/8B0000?text=Ivory+Silk+Saree', tags: ['Pure Silk', 'Festival', 'Vastrakala Pattu'] },
  { id: 'p4', title: 'Royal Blue Kanchipuram Grand Silk Pattu Saree', handle: 'royal-blue', price: '7200', compareAt: '8470', img: 'https://placehold.co/400x533/234b7a/ffffff?text=Royal+Blue+Saree', tags: ['Pure Silk', 'Samudrika Pattu'] },
  { id: 'p5', title: 'Magenta Festival Kanchipuram Pure Silk', handle: 'magenta', price: '3800', compareAt: '5850', img: 'https://placehold.co/400x533/8B0050/ffffff?text=Magenta+Silk+Saree', tags: ['Pure Silk', 'Festival', 'Vastrakala Pattu'] },
  { id: 'p6', title: 'Saffron Bridal Kanchi Silk Saree', handle: 'saffron', price: '5200', compareAt: '6500', img: 'https://placehold.co/400x533/E07B00/ffffff?text=Saffron+Silk+Saree', tags: ['Pure Silk', 'Bridal', 'Kalyana Pattu'] },
];

function renderFallbackProducts(grid) {
  grid.innerHTML = FALLBACK_PRODUCTS.map(function (p) {
    var discount = Math.round((1 - parseInt(p.price) / parseInt(p.compareAt)) * 100);
    return '<div class="product-card" data-product data-product-id="' + p.id + '" data-product-name="' + p.title + '" data-product-price="' + p.price + '" onclick="location.href=\'product.html?handle=' + p.handle + '\'">' +
      '<div class="product-card-img">' +
      '<span class="product-badge">' + discount + '% off</span>' +
      '<button class="product-wishlist" onclick="event.stopPropagation()"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg></button>' +
      '<img src="' + p.img + '" alt="' + p.title + '" loading="lazy">' +
      '<div class="product-add-overlay" data-add-cart onclick="event.stopPropagation()">Add to Cart</div>' +
      '</div><div class="product-card-info">' +
      '<div class="product-name">' + p.title + '</div>' +
      '<div class="product-pricing"><span class="product-price-old">\u20b9' + parseInt(p.compareAt).toLocaleString('en-IN') + '</span><span class="product-price-new">\u20b9' + parseInt(p.price).toLocaleString('en-IN') + '</span></div>' +
      '<div class="product-tags">' + p.tags.join(' \u2022 ') + '</div>' +
      '</div></div>';
  }).join('');
  document.querySelectorAll('#product-grid .product-card').forEach(function (el) { el.classList.add('reveal', 'visible'); });
  initWishlist();
  if (typeof initAddToCartButtons === 'function') initAddToCartButtons();
  var countEl = document.getElementById('product-count');
  if (countEl) countEl.textContent = FALLBACK_PRODUCTS.length;
}
