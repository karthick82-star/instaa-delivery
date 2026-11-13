/**
 * SMART STORE DELIVERY - AUTHENTICATION MODULE
 * Handles user sessions, role-based access control, registration, and redirection.
 */

const Auth = {
  // Get current logged-in user
  getCurrentUser() {
    return Storage.get(STORAGE_KEYS.CURRENT_USER, null);
  },

  // Set logged-in user
  setCurrentUser(user) {
    Storage.set(STORAGE_KEYS.CURRENT_USER, user);
  },

  // Login user with email, password, and optional role check
  loginUser(email, password, requiredRole = null) {
    const users = Storage.get(STORAGE_KEYS.USERS, []);
    const cleanEmail = (email || '').trim().toLowerCase();
    const user = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      return { success: false, message: 'No account found with this email address.' };
    }

    if (user.password !== password) {
      return { success: false, message: 'Invalid password. Please check and try again.' };
    }

    if (requiredRole && user.role !== requiredRole) {
      return { 
        success: false, 
        message: `This account is registered as a ${user.role.toUpperCase()}, not as a ${requiredRole.toUpperCase()}. Please switch tabs.` 
      };
    }

    // Save active session
    this.setCurrentUser(user);

    return { 
      success: true, 
      user, 
      redirectUrl: this.getRoleDashboardUrl(user.role) 
    };
  },

  // Quick 1-click Demo Login
  quickLogin(email, role) {
    const users = Storage.get(STORAGE_KEYS.USERS, []);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      this.setCurrentUser(user);
      window.location.href = this.getRoleDashboardUrl(user.role);
    }
  },

  // Register Customer or Rider
  registerUser(userData) {
    const users = Storage.get(STORAGE_KEYS.USERS, []);
    const cleanEmail = (userData.email || '').trim().toLowerCase();

    // Check if email already exists
    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return { success: false, message: 'An account with this email address already exists.' };
    }

    // Generate unique ID based on role
    let prefix = 'CUST';
    if (userData.role === 'rider') prefix = 'RDR';
    if (userData.role === 'store') prefix = 'STR';
    if (userData.role === 'admin') prefix = 'ADM';

    const count = users.filter(u => u.role === userData.role).length + 1;
    const newId = `${prefix}-${String(count).padStart(3, '0')}`;

    const newUser = {
      id: newId,
      name: userData.name,
      email: cleanEmail,
      password: userData.password,
      role: userData.role,
      phone: userData.phone || '',
      townId: userData.townId || 'TOWN-01',
      townName: userData.townName || (userData.townId === 'TOWN-02' ? 'Town B (Shampur)' : 'Town A (Rampur)'),
      address: userData.address || '',
      joinedDate: new Date().toISOString().split('T')[0],
      avatar: userData.role === 'rider' 
        ? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80'
    };

    // If Rider, set initial vehicle, status, and initialize wallet
    if (userData.role === 'rider') {
      newUser.vehicle = userData.vehicle || 'Standard Two-Wheeler';
      newUser.status = 'ONLINE';
      newUser.rating = 5.0;
      newUser.totalTrips = 0;

      // Initialize rider wallet
      const riderWallets = Storage.get(STORAGE_KEYS.RIDER_WALLETS, {});
      riderWallets[newId] = {
        riderId: newId,
        availableBalance: 0,
        totalEarnings: 0,
        todayEarnings: 0,
        pendingBalance: 0
      };
      Storage.set(STORAGE_KEYS.RIDER_WALLETS, riderWallets);
    }

    users.push(newUser);
    Storage.set(STORAGE_KEYS.USERS, users);

    // Auto log in newly registered user
    this.setCurrentUser(newUser);

    return { 
      success: true, 
      user: newUser, 
      redirectUrl: this.getRoleDashboardUrl(newUser.role) 
    };
  },

  // Logout
  logoutUser() {
    Storage.remove(STORAGE_KEYS.CURRENT_USER);
    // Determine path to login
    const isInSubdir = window.location.pathname.includes('/customer/') || 
                       window.location.pathname.includes('/rider/') || 
                       window.location.pathname.includes('/store/') || 
                       window.location.pathname.includes('/admin/');
    const loginPath = isInSubdir ? '../login.html' : 'login.html';
    window.location.href = loginPath;
  },

  // Get appropriate dashboard URL for role
  getRoleDashboardUrl(role) {
    const isInSubdir = window.location.pathname.includes('/customer/') || 
                       window.location.pathname.includes('/rider/') || 
                       window.location.pathname.includes('/store/') || 
                       window.location.pathname.includes('/admin/');
    const prefix = isInSubdir ? '../' : '';

    switch (role) {
      case 'customer':
        return `${prefix}customer/customer-dashboard.html`;
      case 'rider':
        return `${prefix}rider/rider-dashboard.html`;
      case 'store':
        return `${prefix}store/store-dashboard.html`;
      case 'admin':
        return `${prefix}admin/admin-dashboard.html`;
      default:
        return `${prefix}index.html`;
    }
  },

  // Page Guard: Ensure user is logged in and possesses appropriate role
  checkAuth(allowedRoles = []) {
    const user = this.getCurrentUser();
    const isInSubdir = window.location.pathname.includes('/customer/') || 
                       window.location.pathname.includes('/rider/') || 
                       window.location.pathname.includes('/store/') || 
                       window.location.pathname.includes('/admin/');
    const loginPath = isInSubdir ? '../login.html' : 'login.html';

    if (!user) {
      console.warn('Authentication required. Redirecting to login.');
      window.location.href = loginPath;
      return null;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      console.warn(`Unauthorized role '${user.role}'. Required: ${allowedRoles.join(', ')}.`);
      alert(`Access Restricted: This dashboard is reserved for ${allowedRoles.join(' / ').toUpperCase()} users. Redirecting to your dashboard.`);
      window.location.href = this.getRoleDashboardUrl(user.role);
      return null;
    }

    return user;
  },

  // Toggle password visibility helper
  togglePasswordVisibility(inputId, toggleIconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(toggleIconId);
    if (!input) return;

    if (input.type === 'password') {
      input.type = 'text';
      if (icon) {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      }
    } else {
      input.type = 'password';
      if (icon) {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    }
  }
};
