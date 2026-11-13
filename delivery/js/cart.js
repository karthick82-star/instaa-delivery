/**
 * SMART STORE DELIVERY - CART MODULE
 * Manages shopping cart state, item quantities, totals calculation, and cart badges.
 */

const Cart = {
  // Get all items in current cart
  getItems() {
    return Storage.get(STORAGE_KEYS.CART, []);
  },

  // Save cart
  saveItems(items) {
    Storage.set(STORAGE_KEYS.CART, items);
    this.updateBadge();
  },

  // Add item or increment quantity
  addItem(productId, qty = 1) {
    const product = Products.getById(productId);
    if (!product) return;

    let items = this.getItems();
    const existingIndex = items.findIndex(item => item.id === productId);

    if (existingIndex > -1) {
      items[existingIndex].qty += qty;
      items[existingIndex].total = items[existingIndex].qty * items[existingIndex].price;
    } else {
      items.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        unit: product.unit,
        category: product.category,
        qty: qty,
        total: product.price * qty
      });
    }

    this.saveItems(items);
    if (typeof Notifications !== 'undefined') {
      Notifications.showToast('Added to Cart', `${product.name} (Qty: ${qty}) added.`, 'success');
    }

    // Refresh active views if present
    this.refreshCartViews();
  },

  // Update item quantity by delta (+1 or -1)
  updateQuantity(productId, delta) {
    let items = this.getItems();
    const index = items.findIndex(item => item.id === productId);

    if (index > -1) {
      items[index].qty += delta;

      if (items[index].qty <= 0) {
        items.splice(index, 1);
        if (typeof Notifications !== 'undefined') {
          Notifications.showToast('Item Removed', 'Product removed from your basket.', 'info');
        }
      } else {
        items[index].total = items[index].qty * items[index].price;
      }

      this.saveItems(items);
      this.refreshCartViews();
    }
  },

  // Remove specific item completely
  removeItem(productId) {
    let items = this.getItems();
    items = items.filter(item => item.id !== productId);
    this.saveItems(items);
    if (typeof Notifications !== 'undefined') {
      Notifications.showToast('Item Removed', 'Product removed from cart.', 'info');
    }
    this.refreshCartViews();
  },

  // Clear entire cart
  clearCart() {
    this.saveItems([]);
    this.refreshCartViews();
  },

  // Get quantity of a specific product currently in cart
  getProductQty(productId) {
    const items = this.getItems();
    const found = items.find(item => item.id === productId);
    return found ? found.qty : 0;
  },

  // Calculate pricing breakdown
  getTotals() {
    const items = this.getItems();
    const config = Storage.get(STORAGE_KEYS.SYSTEM_CONFIG, {
      baseDeliveryFee: 40,
      platformFee: 15,
      gstRate: 0.05
    });

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const itemCount = items.reduce((sum, item) => sum + item.qty, 0);

    // Free delivery for orders above ₹700, else base fee ₹40
    const deliveryFee = subtotal === 0 ? 0 : (subtotal >= 700 ? 0 : config.baseDeliveryFee);
    const platformFee = subtotal === 0 ? 0 : config.platformFee;
    const gst = subtotal === 0 ? 0 : Number((subtotal * config.gstRate).toFixed(2));
    const grandTotal = Number((subtotal + deliveryFee + platformFee + gst).toFixed(2));

    return {
      subtotal,
      deliveryFee,
      platformFee,
      gst,
      grandTotal,
      itemCount
    };
  },

  // Update header cart badge across all pages
  updateBadge() {
    const badges = document.querySelectorAll('.cart-badge');
    const items = this.getItems();
    const count = items.reduce((sum, item) => sum + item.qty, 0);

    badges.forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    });
  },

  // Rerender page-specific elements (like in products.html, cart.html, checkout.html)
  refreshCartViews() {
    this.updateBadge();

    // If on products page, update card buttons
    const items = this.getItems();
    document.querySelectorAll('.product-card').forEach(card => {
      const pId = card.id.replace('card-', '');
      const wrapper = document.getElementById(`action-wrapper-${pId}`);
      if (wrapper) {
        const qty = this.getProductQty(pId);
        if (qty > 0) {
          wrapper.innerHTML = `
            <div class="cart-qty-control" data-product-id="${pId}">
              <button class="btn-qty-minus" onclick="Cart.updateQuantity('${pId}', -1)">-</button>
              <span class="qty-display">${qty}</span>
              <button class="btn-qty-plus" onclick="Cart.updateQuantity('${pId}', 1)">+</button>
            </div>
          `;
        } else {
          wrapper.innerHTML = `
            <button class="btn btn-primary btn-sm btn-add-cart" onclick="Cart.addItem('${pId}', 1)">
              <i class="fa-solid fa-cart-plus"></i> Add to Cart
            </button>
          `;
        }
      }
    });

    // If on cart.html, trigger its render function
    if (typeof renderCartPage === 'function') {
      renderCartPage();
    }

    // If on checkout.html, trigger its summary render
    if (typeof renderCheckoutSummary === 'function') {
      renderCheckoutSummary();
    }
  }
};

// Initialize badge when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  Cart.updateBadge();
});
