/**
 * SMART STORE DELIVERY - CORE APPLICATION MODULE
 * Provides formatters, demo toolbar, role switcher, navigation helpers,
 * and real-time cross-tab synchronization listeners.
 */

const App = {
  // Format currency in Indian Rupee format
  formatCurrency(amount) {
    const num = Number(amount) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  // Format full date & time
  formatDateTime(isoString) {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  },

  // Format time only
  formatTime(isoString) {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  },

  // Time elapsed helper
  timeAgo(isoString) {
    if (!isoString) return '';
    const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  },

  // Status badge styling helper
  getStatusBadge(status) {
    let colorClass = 'badge-secondary';
    let icon = 'fa-clock';

    switch (status) {
      case 'NEW':
        colorClass = 'badge-primary';
        icon = 'fa-sparkles';
        break;
      case 'ACCEPTED':
        colorClass = 'badge-info';
        icon = 'fa-check';
        break;
      case 'PREPARING':
        colorClass = 'badge-warning';
        icon = 'fa-fire-burner';
        break;
      case 'READY_FOR_PICKUP':
        colorClass = 'badge-purple';
        icon = 'fa-box-open';
        break;
      case 'RIDER_ASSIGNED':
        colorClass = 'badge-indigo';
        icon = 'fa-motorcycle';
        break;
      case 'DISPATCHED':
        colorClass = 'badge-blue';
        icon = 'fa-truck-fast';
        break;
      case 'DELIVERED':
        colorClass = 'badge-success';
        icon = 'fa-circle-check';
        break;
      case 'CANCELLED':
      case 'REJECTED':
        colorClass = 'badge-danger';
        icon = 'fa-ban';
        break;
    }

    const label = (status || '').replace(/_/g, ' ');
    return `<span class="badge ${colorClass}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
  },

  // Initialize UI components, responsive toggles, and user badges
  initUI() {
    const user = Auth.getCurrentUser();

    // Populate user profile widgets if elements exist
    if (user) {
      document.querySelectorAll('.user-name').forEach(el => el.textContent = user.name);
      document.querySelectorAll('.user-role').forEach(el => el.textContent = user.role.toUpperCase());
      document.querySelectorAll('.user-email').forEach(el => el.textContent = user.email);
      document.querySelectorAll('.user-avatar').forEach(el => {
        if (el.tagName === 'IMG') el.src = user.avatar || el.src;
      });
    }

    // Initialize notification toggle dropdown
    this.setupNotificationDropdown();

    // Inject Demo Helper Bar
    this.injectDemoToolbar();

    // Setup Mobile Navigation Sidebar Toggle
    const mobileToggle = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.querySelector('.dashboard-sidebar');
    if (mobileToggle && sidebar) {
      mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }

    // Set active link in sidebar navigation
    const currentPath = window.location.pathname.split('/').pop();
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
      const linkPath = link.getAttribute('href')?.split('/').pop();
      if (linkPath === currentPath) {
        link.classList.add('active');
      }
    });

    // Cross-tab real-time sync listener
    this.setupRealtimeSync();
  },

  // Setup Notification Dropdown popup
  setupNotificationDropdown() {
    const notifBtn = document.getElementById('btn-notifications');
    if (!notifBtn) return;

    let dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'notif-dropdown';
      dropdown.className = 'notif-dropdown-menu';
      document.body.appendChild(dropdown);
    }

    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.classList.contains('active');
      if (isVisible) {
        dropdown.classList.remove('active');
      } else {
        this.renderNotificationDropdown(dropdown);
        const rect = notifBtn.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 10}px`;
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
        dropdown.classList.add('active');
        Notifications.markAllAsRead();
      }
    });

    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.contains(e.target) && e.target !== notifBtn) {
        dropdown.classList.remove('active');
      }
    });
  },

  renderNotificationDropdown(container) {
    const notifs = Notifications.getUserNotifications();
    container.innerHTML = `
      <div class="notif-dropdown-header">
        <h4><i class="fa-solid fa-bell"></i> Notifications</h4>
        <span class="notif-count-badge">${notifs.length}</span>
      </div>
      <div class="notif-dropdown-list">
        ${notifs.length === 0 ? `
          <div class="notif-empty">
            <i class="fa-regular fa-bell-slash"></i>
            <p>No notifications yet</p>
          </div>
        ` : notifs.map(n => `
          <div class="notif-item ${n.read ? 'read' : 'unread'}">
            <div class="notif-item-icon notif-icon-${n.type}">
              <i class="fa-solid ${n.type === 'success' ? 'fa-circle-check' : n.type === 'warning' ? 'fa-triangle-exclamation' : 'fa-bell'}"></i>
            </div>
            <div class="notif-item-content">
              <h5>${n.title}</h5>
              <p>${n.message}</p>
              <span class="notif-time">${App.timeAgo(n.timestamp)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // Inject Floating Quick-Role Switcher & Demo Helper Bar
  injectDemoToolbar() {
    if (document.getElementById('demo-toolbar')) return;

    const currentUser = Auth.getCurrentUser();
    const isInSubdir = window.location.pathname.includes('/customer/') || 
                       window.location.pathname.includes('/rider/') || 
                       window.location.pathname.includes('/store/') || 
                       window.location.pathname.includes('/admin/');
    const pathPrefix = isInSubdir ? '../' : '';

    const toolbar = document.createElement('div');
    toolbar.id = 'demo-toolbar';
    toolbar.className = 'demo-toolbar';
    toolbar.innerHTML = `
      <div class="demo-toolbar-inner">
        <div class="demo-toolbar-brand">
          <span class="pulse-indicator"></span>
          <strong>Multi-Role Switcher:</strong>
          <span class="current-role-tag">${currentUser ? `${currentUser.name} (${currentUser.role.toUpperCase()})` : 'Guest'}</span>
        </div>
        <div class="demo-toolbar-actions">
          <button class="btn-demo-switch ${currentUser?.id === 'CUST-001' ? 'active' : ''}" 
                  onclick="App.switchRole('customer@demo.com', 'customer')">
            <i class="fa-solid fa-user"></i> Customer (Priya)
          </button>
          <button class="btn-demo-switch ${currentUser?.role === 'store' ? 'active' : ''}" 
                  onclick="App.switchRole('store@demo.com', 'store')">
            <i class="fa-solid fa-store"></i> Store Manager
          </button>
          <button class="btn-demo-switch ${currentUser?.id === 'RDR-001' ? 'active' : ''}" 
                  onclick="App.switchRole('rider1@demo.com', 'rider')">
            <i class="fa-solid fa-motorcycle"></i> Rider 1 (Alex)
          </button>
          <button class="btn-demo-switch ${currentUser?.id === 'RDR-002' ? 'active' : ''}" 
                  onclick="App.switchRole('rider2@demo.com', 'rider')">
            <i class="fa-solid fa-bicycle"></i> Rider 2 (Ben)
          </button>
          <button class="btn-demo-switch ${currentUser?.role === 'admin' ? 'active' : ''}" 
                  onclick="App.switchRole('admin@demo.com', 'admin')">
            <i class="fa-solid fa-shield-halved"></i> Admin
          </button>
          <div class="demo-toolbar-separator"></div>
          <button class="btn-demo-action" onclick="App.autoSimulateOrder()" title="Create sample order and simulate workflow">
            <i class="fa-solid fa-wand-magic-sparkles text-warning"></i> Quick Order
          </button>
          <button class="btn-demo-action btn-danger-action" onclick="Storage.resetAll()" title="Reset all demo data">
            <i class="fa-solid fa-rotate-right"></i> Reset Demo
          </button>
          <button class="btn-demo-collapse" onclick="document.getElementById('demo-toolbar').classList.toggle('collapsed')" title="Collapse toolbar">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(toolbar);
  },

  // Switch role seamlessly
  switchRole(email, role) {
    const users = Storage.get(STORAGE_KEYS.USERS, []);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      Auth.setCurrentUser(user);
      window.location.href = Auth.getRoleDashboardUrl(role);
    }
  },

  // Auto create sample order for quick testing
  autoSimulateOrder() {
    const order = Orders.createOrder({
      customerId: 'CUST-001',
      customerName: 'Priya Sharma',
      customerPhone: '+91 98111 22334',
      deliveryAddress: 'Flat 402, Green Glen Towers, Outer Ring Road, Bangalore - 560103',
      items: [
        { id: 'PRD-101', name: 'Fresh Alphonso Mangoes', price: 299, qty: 1, total: 299 },
        { id: 'PRD-106', name: 'Farm Fresh Cow Milk', price: 64, qty: 2, total: 128 },
        { id: 'PRD-107', name: 'Artisanal Sourdough Bread', price: 95, qty: 1, total: 95 }
      ],
      subtotal: 522,
      deliveryFee: 50,
      platformFee: 15,
      gst: 26.10,
      total: 613.10,
      paymentMethod: 'UPI',
      paymentId: `pay_sim_${Date.now()}`
    });

    Notifications.showToast('Test Order Generated!', `Order #${order.id} placed. Switch to Store to accept & prepare.`, 'success', 5000);

    // Refresh if order views exist
    if (typeof loadOrders === 'function') loadOrders();
    if (typeof renderIncomingOrders === 'function') renderIncomingOrders();
  },

  // Setup Real-time Cross-tab Sync
  setupRealtimeSync() {
    // 1. Storage Event Listener
    window.addEventListener('storage', (e) => {
      if ([STORAGE_KEYS.ORDERS, STORAGE_KEYS.RIDER_WALLETS, STORAGE_KEYS.STORE_WALLET].includes(e.key)) {
        console.log('🔄 Cross-tab storage change detected. Refreshing active views.');
        this.triggerPageDataRefresh();
      }
    });

    // 2. BroadcastChannel Listener
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('smart_store_channel');
      bc.onmessage = (event) => {
        console.log('📡 Cross-tab broadcast received:', event.data?.key);
        this.triggerPageDataRefresh();
      };
    }
  },

  // Trigger page-specific refresh function if present
  triggerPageDataRefresh() {
    if (typeof renderAvailableOrders === 'function') renderAvailableOrders();
    if (typeof renderIncomingOrders === 'function') renderIncomingOrders();
    if (typeof renderOrderTracking === 'function') renderOrderTracking();
    if (typeof loadOrders === 'function') loadOrders();
    if (typeof renderWalletData === 'function') renderWalletData();
    if (typeof renderActiveDelivery === 'function') renderActiveDelivery();
  }
};

// Auto initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.initUI();
});
