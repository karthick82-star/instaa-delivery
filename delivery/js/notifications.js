/**
 * SMART STORE DELIVERY - NOTIFICATIONS SYSTEM
 * Interactive toast notifications, role-based notification center,
 * and browser Web Audio synthesized alert chimes.
 */

const Notifications = {
  // Web Audio Context for synthesized chimes
  audioCtx: null,

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  },

  // Play synthesized notification sound without needing external MP3 files
  playChime(type = 'success') {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        // High, bright two-tone bell chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.00, now + 0.1); // A5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (type === 'broadcast' || type === 'warning') {
        // Double alert beep for rider dispatch broadcast
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.setValueAtTime(880.00, now + 0.12); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (type === 'error') {
        // Low rejection tone
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(164.81, now + 0.15);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (e) {
      // Audio playback fails silently if browser policy blocks autoplay before gesture
    }
  },

  // Create a persistent notification record
  notify(targetRole, targetUserId, title, message, type = 'info', orderId = null) {
    const list = Storage.get(STORAGE_KEYS.NOTIFICATIONS, []);
    const newNotif = {
      id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      targetRole,
      targetUserId,
      title,
      message,
      type, // 'info', 'success', 'warning', 'error'
      orderId,
      timestamp: new Date().toISOString(),
      read: false
    };

    list.unshift(newNotif);
    // Keep max 100
    if (list.length > 100) list.pop();
    Storage.set(STORAGE_KEYS.NOTIFICATIONS, list);

    // If current logged-in user matches target, display toast & sound immediately
    const currentUser = Auth.getCurrentUser();
    if (currentUser) {
      const isTarget = (currentUser.role === targetRole) || 
                       (currentUser.id === targetUserId) || 
                       (targetRole === 'admin' && currentUser.role === 'admin');

      if (isTarget) {
        this.showToast(title, message, type);
        this.playChime(type === 'warning' ? 'broadcast' : type);
      }
    }

    this.updateNotificationBadge();
    return newNotif;
  },

  // Display modern floating toast alert
  showToast(title, message, type = 'info', duration = 4500) {
    if (typeof document === 'undefined') return;
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    if (type === 'error') iconClass = 'fa-circle-xmark';

    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <div class="toast-body">
        <h4 class="toast-title">${title}</h4>
        <p class="toast-message">${message}</p>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()" title="Dismiss">&times;</button>
      <div class="toast-progress"></div>
    `;

    container.appendChild(toast);

    // Trigger enter animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto dismiss
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  },

  // Get notifications for current user
  getUserNotifications() {
    const user = Auth.getCurrentUser();
    if (!user) return [];
    const all = Storage.get(STORAGE_KEYS.NOTIFICATIONS, []);
    return all.filter(n => 
      n.targetRole === user.role || 
      n.targetUserId === user.id || 
      (user.role === 'admin')
    );
  },

  // Mark all notifications as read
  markAllAsRead() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const all = Storage.get(STORAGE_KEYS.NOTIFICATIONS, []);
    all.forEach(n => {
      if (n.targetRole === user.role || n.targetUserId === user.id || user.role === 'admin') {
        n.read = true;
      }
    });
    Storage.set(STORAGE_KEYS.NOTIFICATIONS, all);
    this.updateNotificationBadge();
  },

  // Update notification badge count in header
  updateNotificationBadge() {
    if (typeof document === 'undefined') return;
    const badges = document.querySelectorAll('.notif-badge');
    const notifs = this.getUserNotifications();
    const unread = notifs.filter(n => !n.read).length;

    badges.forEach(badge => {
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'inline-flex' : 'none';
    });
  }
};

// Listen for cross-tab notifications
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEYS.NOTIFICATIONS) {
    Notifications.updateNotificationBadge();
  }
});
