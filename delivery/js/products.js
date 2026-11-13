/**
 * SMART STORE DELIVERY - PRODUCTS MODULE
 * Manages product catalog, category filtering, search, and dynamic card rendering.
 */

const Products = {
  // Get all products
  getAll() {
    return Storage.get(STORAGE_KEYS.PRODUCTS, []);
  },

  // Get product by ID
  getById(id) {
    const products = this.getAll();
    return products.find(p => p.id === id) || null;
  },

  // Get all unique categories
  getCategories() {
    const products = this.getAll();
    const categories = ['All', ...new Set(products.map(p => p.category))];
    return categories;
  },

  // Filter and search products
  filter({ category = 'All', search = '', sortBy = 'featured' } = {}) {
    let products = this.getAll();

    // Category filter
    if (category && category !== 'All') {
      products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }

    // Search query
    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      products = products.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.category.toLowerCase().includes(q) || 
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Sorting
    switch (sortBy) {
      case 'price-low':
        products.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        products.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'name':
        products.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        // featured / default order
        break;
    }

    return products;
  },

  // Render a single product card HTML
  renderCard(product, cartQty = 0) {
    const discount = product.originalPrice 
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) 
      : 0;

    const actionButton = cartQty > 0
      ? `
        <div class="cart-qty-control" data-product-id="${product.id}">
          <button class="btn-qty-minus" onclick="Cart.updateQuantity('${product.id}', -1)" title="Decrease">-</button>
          <span class="qty-display">${cartQty}</span>
          <button class="btn-qty-plus" onclick="Cart.updateQuantity('${product.id}', 1)" title="Increase">+</button>
        </div>
      `
      : `
        <button class="btn btn-primary btn-sm btn-add-cart" onclick="Cart.addItem('${product.id}', 1)">
          <i class="fa-solid fa-cart-plus"></i> Add to Cart
        </button>
      `;

    return `
      <div class="product-card" id="card-${product.id}">
        <div class="product-image-container">
          ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ''}
          ${discount > 0 ? `<span class="discount-tag">${discount}% OFF</span>` : ''}
          <img src="${product.image}" alt="${product.name}" class="product-image" loading="lazy" 
               onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&auto=format&fit=crop&q=80'">
        </div>
        <div class="product-content">
          <div class="product-meta">
            <span class="product-category">${product.category}</span>
            <span class="product-rating"><i class="fa-solid fa-star text-warning"></i> ${product.rating || '4.8'}</span>
          </div>
          <h3 class="product-title" title="${product.name}">${product.name}</h3>
          <p class="product-unit">${product.unit}</p>
          <p class="product-desc">${product.description || ''}</p>
          <div class="product-footer">
            <div class="product-pricing">
              <span class="product-price">₹${product.price.toFixed(2)}</span>
              ${product.originalPrice ? `<span class="product-original-price">₹${product.originalPrice.toFixed(2)}</span>` : ''}
            </div>
            <div class="product-action" id="action-wrapper-${product.id}">
              ${actionButton}
            </div>
          </div>
        </div>
      </div>
    `;
  }
};
