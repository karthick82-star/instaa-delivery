/**
 * INSTAA - RURAL HYPERLOCAL Q-COMMERCE ECOSYSTEM
 * REAL-TIME RIDER DISPATCH & CONCURRENCY MODULE
 * 
 * Features:
 * 1. Multi-Town Priority Dispatch (respecive town riders given priority)
 * 2. 2-Minute Idle Timeout & Automatic Reassignment Engine (Feature 3)
 * 3. Synchronous Concurrency Lock to prevent double-claiming
 * 4. Double-Confirmation Acceptance Modal
 */

const Dispatch = {
  idleCheckInterval: null,

  // Initialize background idle check monitor
  initIdleMonitor() {
    if (this.idleCheckInterval) clearInterval(this.idleCheckInterval);
    this.idleCheckInterval = setInterval(() => {
      this.checkAndReassignIdleOrders();
    }, 5000);
  },

  /**
   * Broadcast an order to online riders with Town Priority (Feature 2)
   * The riders of respective towns will be given priority for orders in their town stores.
   * If no rider from that town is online, order is assigned/broadcast to the neighboring town riders.
   */
  broadcastOrderToRiders(orderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return { success: false, message: 'Order not found' };

    const order = orders[orderIndex];
    order.broadcastedAt = new Date().toISOString();
    order.isBroadcasted = true;
    orders[orderIndex] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    const users = Storage.get(STORAGE_KEYS.USERS, []);
    const allOnlineRiders = users.filter(u => u.role === 'rider' && u.status === 'ONLINE');

    // Respective town priority check
    const storeTownId = order.storeTownId || 'TOWN-01';
    let targetRiders = allOnlineRiders.filter(r => r.townId === storeTownId);
    let isFallbackToNeighbor = false;

    if (targetRiders.length === 0) {
      // Fallback: If no rider from respective town is online, broadcast to neighbor town riders
      targetRiders = allOnlineRiders;
      isFallbackToNeighbor = true;
    }

    // Send notifications to riders
    targetRiders.forEach(rider => {
      if (typeof Notifications !== 'undefined') {
        const priorityNote = rider.townId === storeTownId ? '📍 [Local Priority]' : '🔄 [Inter-Town Assignment]';
        Notifications.notify(
          'rider',
          rider.id,
          `${priorityNote} New Delivery Request Available!`,
          `Order #${orderId} from ${order.storeName} (${order.distanceKm} km) • Earn ₹${order.riderEarnings.toFixed(2)}`,
          'warning',
          orderId
        );
      }
    });

    // Notify Admin of dispatch
    if (typeof Notifications !== 'undefined') {
      Notifications.notify(
        'admin',
        'ADM-001',
        'Rider Broadcast Dispatched',
        `Order #${orderId} broadcast to ${targetRiders.length} online rider(s) (${isFallbackToNeighbor ? 'Neighbor Town Fallback' : 'Town Local Priority'}).`,
        'info',
        orderId
      );
    }

    console.log(`📡 Broadcasted Order ${orderId} to ${targetRiders.length} riders (Fallback: ${isFallbackToNeighbor}).`);
    return { success: true, count: targetRiders.length, isFallbackToNeighbor };
  },

  // Get available orders filtered and prioritized for a specific rider
  getAvailableOrdersForRiders(riderId = null) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    let available = orders.filter(o => 
      o.status === ORDER_STATUS.READY_FOR_PICKUP && 
      !o.assignedRiderId
    );

    if (riderId) {
      const users = Storage.get(STORAGE_KEYS.USERS, []);
      const rider = users.find(u => u.id === riderId);
      if (rider && rider.townId) {
        // Sort: Same town orders first!
        available.sort((a, b) => {
          const aSame = (a.storeTownId || 'TOWN-01') === rider.townId ? 1 : 0;
          const bSame = (b.storeTownId || 'TOWN-01') === rider.townId ? 1 : 0;
          if (aSame !== bSame) return bSame - aSame;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      }
    } else {
      available.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return available;
  },

  // Get active delivery currently assigned to a rider
  getActiveDeliveryForRider(riderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    return orders.find(o => 
      o.assignedRiderId === riderId && 
      [ORDER_STATUS.RIDER_ASSIGNED, ORDER_STATUS.DISPATCHED, ORDER_STATUS.RETURN_IN_PROGRESS].includes(o.status)
    ) || null;
  },

  /**
   * SYNCHRONOUS ATOMIC CLAIM ENGINE WITH TOWN PRIORITY CHECK
   */
  claimOrderSynchronous(orderId, riderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
      return { success: false, reason: 'NOT_FOUND', message: 'Order does not exist.' };
    }

    const order = orders[orderIndex];

    if (order.status !== ORDER_STATUS.READY_FOR_PICKUP || order.assignedRiderId) {
      return { 
        success: false, 
        reason: 'ALREADY_ASSIGNED', 
        assignedTo: order.assignedRiderName || 'Another Rider',
        message: `Order #${orderId} was just claimed by ${order.assignedRiderName || 'another rider'}. Please review other available deliveries.` 
      };
    }

    // Check if rider already has an active delivery
    const activeExisting = orders.find(o => 
      o.assignedRiderId === riderId && 
      [ORDER_STATUS.RIDER_ASSIGNED, ORDER_STATUS.DISPATCHED, ORDER_STATUS.RETURN_IN_PROGRESS].includes(o.status)
    );
    if (activeExisting) {
      return {
        success: false,
        reason: 'RIDER_BUSY',
        message: `You already have an active delivery (#${activeExisting.id}). Please complete it before accepting another order.`
      };
    }

    const users = Storage.get(STORAGE_KEYS.USERS, []);
    const rider = users.find(u => u.id === riderId);
    if (!rider) {
      return { success: false, reason: 'RIDER_INVALID', message: 'Rider credentials invalid.' };
    }

    // Assign Rider & Start 2-Minute Idle Location Tracker (Feature 3)
    const now = new Date().toISOString();
    order.status = ORDER_STATUS.RIDER_ASSIGNED;
    order.assignedRiderId = rider.id;
    order.assignedRiderName = rider.name;
    order.assignedRiderPhone = rider.phone;
    order.assignedRiderVehicle = rider.vehicle;
    order.assignedRiderTownId = rider.townId || 'TOWN-01';
    order.assignedAt = now;
    order.assignedTimestamp = Date.now();
    order.lastMotionTimestamp = Date.now();
    order.isIdle = false;
    order.idleReassigned = false;

    order.timeline.push({
      status: ORDER_STATUS.RIDER_ASSIGNED,
      timestamp: now,
      note: `Delivery claimed by Rider ${rider.name} (${rider.vehicle}) from ${rider.townName || 'Town A'}. 2-minute idle motion monitoring activated.`
    });

    orders[orderIndex] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    // Notify parties
    if (typeof Notifications !== 'undefined') {
      Notifications.notify(
        'customer',
        order.customerId,
        '🛵 Rider Assigned!',
        `Rider ${rider.name} has accepted your order #${orderId} and is heading to the store.`,
        'success',
        orderId
      );

      Notifications.notify(
        'store',
        order.storeId,
        'Rider En Route for Pickup',
        `Rider ${rider.name} (${rider.vehicle}) is arriving for Order #${orderId}. Ready your Handover OTP.`,
        'info',
        orderId
      );

      Notifications.notify(
        'admin',
        'ADM-001',
        'Order Dispatch Confirmed',
        `Order #${orderId} successfully locked and assigned to Rider ${rider.name}.`,
        'info',
        orderId
      );
    }

    console.log(`✅ Order ${orderId} successfully locked and assigned to ${rider.name}.`);
    return { success: true, order, message: `Order #${orderId} accepted successfully! Proceed to store for pickup.` };
  },

  /**
   * FEATURE 3: 2-MINUTE IDLE MONITORING & AUTO-REASSIGNMENT
   * If rider is idle for > 2 mins without moving towards store, auto-reassign to another rider.
   */
  checkAndReassignIdleOrders() {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const config = Storage.get(STORAGE_KEYS.SYSTEM_CONFIG, DEFAULT_CONFIG);
    const timeoutMs = (config.riderIdleTimeoutMinutes || 2) * 60 * 1000; // 2 minutes in ms
    let mutated = false;

    orders.forEach(order => {
      // Only monitor orders where rider is assigned but hasn't picked up from store yet
      if (order.status === ORDER_STATUS.RIDER_ASSIGNED && order.assignedRiderId) {
        const lastMotion = order.lastMotionTimestamp || order.assignedTimestamp || new Date(order.assignedAt).getTime();
        const idleDuration = Date.now() - lastMotion;

        if (idleDuration >= timeoutMs && order.isIdle !== false) {
          console.warn(`⏳ [IDLE TIMEOUT] Rider ${order.assignedRiderName} idle for > 2 mins on Order #${order.id}. Auto-reassigning!`);
          this.executeIdleReassignment(order.id, order.assignedRiderId, orders);
          mutated = true;
        }
      }
    });

    if (mutated) {
      Storage.set(STORAGE_KEYS.ORDERS, orders);
    }
  },

  /**
   * Execute Order Reassignment when Idle Timeout Expires
   */
  executeIdleReassignment(orderId, idleRiderId, existingOrdersList = null) {
    const orders = existingOrdersList || Storage.get(STORAGE_KEYS.ORDERS, []);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    const order = orders[orderIndex];
    const prevRiderName = order.assignedRiderName;

    // Reset assignment back to READY_FOR_PICKUP
    const now = new Date().toISOString();
    order.status = ORDER_STATUS.READY_FOR_PICKUP;
    order.reassignedFromRiderId = idleRiderId;
    order.idleReassigned = true;
    order.idleReassignedAt = now;
    order.assignedRiderId = null;
    order.assignedRiderName = null;
    order.assignedRiderPhone = null;
    order.assignedRiderVehicle = null;
    order.assignedAt = null;

    order.timeline.push({
      status: ORDER_STATUS.READY_FOR_PICKUP,
      timestamp: now,
      note: `Automatic Timeout Reassignment: Rider ${prevRiderName} was idle for more than 2 minutes without moving towards the store. Order reopened for nearby riders.`
    });

    orders[orderIndex] = order;
    if (!existingOrdersList) {
      Storage.set(STORAGE_KEYS.ORDERS, orders);
    }

    // Send notifications
    if (typeof Notifications !== 'undefined') {
      Notifications.notify(
        'rider',
        idleRiderId,
        '⚠️ Order Reassigned (Idle for 2 Mins)',
        `You were idle for more than 2 minutes. Order #${orderId} has been reassigned to another rider.`,
        'danger',
        orderId
      );

      Notifications.notify(
        'customer',
        order.customerId,
        '🛵 Finding Another Nearby Rider',
        `Previous rider was delayed. Your order #${orderId} is being reassigned to another nearby rider immediately.`,
        'warning',
        orderId
      );

      Notifications.notify(
        'admin',
        'ADM-001',
        'Rider Idle Timeout Reassignment',
        `Order #${orderId} unassigned from ${prevRiderName} (idle > 2 mins) and rebroadcasted.`,
        'warning',
        orderId
      );
    }

    // Rebroadcast to other online riders
    this.broadcastOrderToRiders(orderId);
  },

  // Record Rider simulated movement (resets idle timer)
  recordRiderMovement(orderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const order = orders.find(o => o.id === orderId);
    if (order) {
      order.lastMotionTimestamp = Date.now();
      order.isIdle = false;
      Storage.set(STORAGE_KEYS.ORDERS, orders);
    }
  },

  // Simulate Rider staying stationary / idle
  recordRiderStationary(orderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const order = orders.find(o => o.id === orderId);
    if (order) {
      order.isIdle = true;
      Storage.set(STORAGE_KEYS.ORDERS, orders);
    }
  },

  // Open the mandatory Double-Confirmation Modal
  openAcceptanceModal(orderId, riderId, onSuccess = null) {
    const order = Orders.getById(orderId);
    if (!order) {
      alert('Order no longer available.');
      return;
    }

    let modal = document.getElementById('double-confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'double-confirm-modal';
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-icon-badge">
            <i class="fa-solid fa-motorcycle"></i>
          </div>
          <h3 class="modal-title">Confirm Delivery Acceptance</h3>
          <p class="modal-subtitle">Order <strong>#${order.id}</strong></p>
        </div>
        <div class="modal-body">
          <div class="confirm-order-details">
            <div class="detail-row">
              <span class="detail-label"><i class="fa-solid fa-store text-primary"></i> Pickup Store:</span>
              <span class="detail-val"><strong>${order.storeName}</strong></span>
            </div>
            <div class="detail-row">
              <span class="detail-label"><i class="fa-solid fa-location-dot text-danger"></i> Drop-off Area:</span>
              <span class="detail-val">${order.isInterTown ? 'Inter-Town Delivery (' + order.customerTownId + ')' : 'Local Village Doorstep'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label"><i class="fa-solid fa-route text-muted"></i> Distance & ETA:</span>
              <span class="detail-val"><strong>${order.distanceKm} KM</strong> (~${order.estimatedMinutes} mins)</span>
            </div>
            <div class="detail-row highlight-row">
              <span class="detail-label"><i class="fa-solid fa-wallet text-success"></i> Your Earnings:</span>
              <span class="detail-val text-success"><strong>₹${order.riderEarnings.toFixed(2)}</strong></span>
            </div>
          </div>
          <div class="alert-box alert-warning">
            <i class="fa-solid fa-stopwatch"></i>
            <span><strong>2-Minute Idle Rule:</strong> Please start moving to store immediately after confirmation. If you remain stationary for 2 minutes, order will be automatically reassigned.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="btn-cancel-acceptance">Cancel</button>
          <button class="btn btn-success" id="btn-confirm-acceptance">
            <i class="fa-solid fa-check-circle"></i> Confirm Acceptance
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    document.getElementById('btn-cancel-acceptance').onclick = () => {
      modal.style.display = 'none';
    };

    document.getElementById('btn-confirm-acceptance').onclick = () => {
      const btn = document.getElementById('btn-confirm-acceptance');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Locking Order...';

      const result = Dispatch.claimOrderSynchronous(orderId, riderId);
      modal.style.display = 'none';

      if (result.success) {
        if (typeof Notifications !== 'undefined') {
          Notifications.showToast('Delivery Assigned!', result.message, 'success');
        }
        if (onSuccess) {
          onSuccess(result.order);
        } else {
          const isInSubdir = window.location.pathname.includes('/rider/');
          window.location.href = isInSubdir ? 'active-delivery.html' : 'rider/active-delivery.html';
        }
      } else {
        if (typeof Notifications !== 'undefined') {
          Notifications.showToast('Assignment Failed', result.message, 'error', 6000);
        } else {
          alert(result.message);
        }
        if (typeof renderAvailableOrders === 'function') {
          renderAvailableOrders();
        }
      }
    };
  }
};

// Start idle monitor
Dispatch.initIdleMonitor();
