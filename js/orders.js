/**
 * INSTAA - RURAL HYPERLOCAL Q-COMMERCE ECOSYSTEM
 * ORDERS MODULE
 * 
 * Features implemented:
 * 1. Category-specific Varying Commission Slabs
 * 2. Multi-Town and Inter-Town Delivery Routing
 * 3. Store Privacy Shield (Order items ONLY, NO customer address/location for store)
 * 4. Two-Stage OTP & Damaged Item Return Workflow (Case i & Case ii)
 */

const ORDER_STATUS = {
  NEW: 'NEW',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  RIDER_ASSIGNED: 'RIDER_ASSIGNED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  RETURN_IN_PROGRESS: 'RETURN_IN_PROGRESS',
  RETURNED_TO_STORE: 'RETURNED_TO_STORE',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED'
};

const Orders = {
  // Get all orders from storage
  getAll() {
    return Storage.get(STORAGE_KEYS.ORDERS, []);
  },

  // Get order by ID
  getById(orderId) {
    const orders = this.getAll();
    return orders.find(o => o.id === orderId) || null;
  },

  // Get orders for a specific customer
  getByCustomer(customerId) {
    const orders = this.getAll();
    return orders.filter(o => o.customerId === customerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Get orders for a specific rider
  getByRider(riderId) {
    const orders = this.getAll();
    return orders.filter(o => o.assignedRiderId === riderId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Get incoming and active orders for store
  getStoreOrders(statusFilter = null, storeId = 'STR-001') {
    const orders = this.getAll();
    let storeOrders = orders.filter(o => o.storeId === storeId || (!o.storeId && storeId === 'STR-001'));
    if (statusFilter) {
      storeOrders = storeOrders.filter(o => o.status === statusFilter);
    }
    return storeOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  /**
   * Calculate itemized commission according to Varying Commission Slabs (Feature 4)
   * - Kitchen Staples (Rice, Atta, Oil): 3% - 4%
   * - Dairy & Daily Essentials (Milk, Paneer): 3% - 5%
   * - Packaged FMCG & Snacks (Biscuits, Chips): 6% - 8%
   * - Personal Care & Household (Soaps, Detergents): 8% - 10%
   */
  calculateCommission(items, config) {
    const slabs = config.commissionSlabs || DEFAULT_CONFIG.commissionSlabs;
    let totalCommission = 0;
    const breakdown = [];

    items.forEach(item => {
      let slab = slabs[item.category];
      if (!slab) {
        // Fallback matching
        if (item.category.includes('Staples')) slab = slabs['Kitchen Staples'];
        else if (item.category.includes('Dairy')) slab = slabs['Dairy & Daily Essentials'];
        else if (item.category.includes('Snacks')) slab = slabs['Packaged FMCG & Snacks'];
        else if (item.category.includes('Personal') || item.category.includes('Household')) slab = slabs['Personal Care & Household'];
        else slab = { rate: 0.05, label: item.category };
      }

      const rate = slab.rate || 0.05;
      const commissionAmount = Number((item.total * rate).toFixed(2));
      totalCommission += commissionAmount;

      breakdown.push({
        itemId: item.id,
        name: item.name,
        category: item.category,
        total: item.total,
        commissionRate: rate,
        commissionAmount: commissionAmount
      });
    });

    totalCommission = Number(totalCommission.toFixed(2));
    return { totalCommission, breakdown };
  },

  // Create a new order after checkout & payment (GPay / App-to-App Handshake)
  createOrder(orderData) {
    const orders = this.getAll();
    const config = Storage.get(STORAGE_KEYS.SYSTEM_CONFIG, DEFAULT_CONFIG);
    const users = Storage.get(STORAGE_KEYS.USERS, []);

    // Generate sequential order ID
    const nextNum = 1000 + orders.length + 1;
    const orderId = `ORD-${nextNum}`;

    // Generate random 6-digit customer OTP
    const customerOtp = String(Math.floor(100000 + Math.random() * 900000));

    // Determine Town and Inter-Town status (Feature 2)
    const store = users.find(u => u.id === (orderData.storeId || 'STR-001')) || users.find(u => u.role === 'store');
    const storeTownId = store ? (store.townId || 'TOWN-01') : 'TOWN-01';
    const customerTownId = orderData.customerTownId || 'TOWN-01';
    const isInterTown = storeTownId !== customerTownId;

    // Delivery fee & ETA calculation
    const deliveryFee = orderData.deliveryFee || (isInterTown ? (config.interTownDeliveryFee || 70) : (config.baseDeliveryFee || 40));
    const distanceKm = isInterTown ? Number((7.5 + Math.random() * 3).toFixed(1)) : Number((2.5 + Math.random() * 2.5).toFixed(1));
    const estimatedMinutes = isInterTown ? Math.round(45 + Math.random() * 15) : Math.round(distanceKm * 4 + 8); // 45-60 mins for inter-town

    // Calculate Varying Commission Slabs
    const { totalCommission, breakdown } = this.calculateCommission(orderData.items, config);
    const storeEarnings = Number((orderData.subtotal - totalCommission).toFixed(2));
    const riderEarnings = Number(deliveryFee.toFixed(2));
    const platformEarnings = Number((totalCommission + (orderData.platformFee || 15) + (orderData.gst || 0)).toFixed(2));

    const newOrder = {
      id: orderId,
      customerId: orderData.customerId,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      customerTownId: customerTownId,
      deliveryAddress: orderData.deliveryAddress,
      customerLat: orderData.customerLat || (isInterTown ? 13.2450 : 13.2080),
      customerLng: orderData.customerLng || (isInterTown ? 77.7600 : 77.7190),
      customerLandmark: orderData.customerLandmark || '',
      customerLocationShared: Boolean(orderData.customerLocationShared),
      customerLocationSharedAt: orderData.customerLocationShared ? new Date().toISOString() : null,
      
      // Store details (Store will only see item details, NOT address/location)
      storeId: store ? store.id : 'STR-001',
      storeName: store ? store.name : (config.storeName || 'FreshMart Superstore (Town A)'),
      storeAddress: store ? store.address : '108 Market Square, Rampur (Town A)',
      storeTownId: storeTownId,
      isInterTown: isInterTown,

      items: orderData.items,
      subtotal: orderData.subtotal,
      deliveryFee: deliveryFee,
      platformFee: orderData.platformFee || 15,
      gst: orderData.gst || 0,
      total: orderData.total,

      // Commission details
      totalCommission: totalCommission,
      commissionBreakdown: breakdown,

      // Financial shares
      storeEarnings: storeEarnings,
      riderEarnings: riderEarnings,
      platformEarnings: platformEarnings,
      storeWalletCredited: false,
      riderWalletCredited: false,

      // Payment (GPay -> Instaa Admin Bank Account)
      payment: {
        method: orderData.paymentMethod || 'GPAY',
        status: 'PAID',
        transactionId: orderData.paymentId || `pay_gpay_${Date.now().toString().slice(-8)}`,
        paidAt: new Date().toISOString()
      },

      status: ORDER_STATUS.NEW,
      customerOtp: customerOtp,
      storeOtp: null,
      shopReturnOtp: null, // For damaged items return

      // Assigned Rider
      assignedRiderId: null,
      assignedRiderName: null,
      assignedRiderPhone: null,
      assignedRiderVehicle: null,
      assignedRiderTownId: null,
      assignedAt: null,
      isIdle: false,

      distanceKm: distanceKm,
      estimatedMinutes: estimatedMinutes,

      // Damaged items tracking (Case ii)
      isDamaged: false,
      damagedItems: [],
      damageReason: null,
      riderPayWithheld: false,
      refundStatus: null, // 'NONE' | 'PENDING' | 'PROCESSED'
      refundAmount: 0,

      createdAt: new Date().toISOString(),
      acceptedAt: null,
      readyAt: null,
      dispatchedAt: null,
      deliveredAt: null,
      timeline: [
        {
          status: ORDER_STATUS.NEW,
          timestamp: new Date().toISOString(),
          note: `Order placed via Google Pay App-to-App Handshake. Paid ₹${orderData.total.toFixed(2)}. ${isInterTown ? 'Inter-town delivery from ' + (store ? store.townName : 'Nearby Town') : 'Local village delivery'}.`
        }
      ]
    };

    orders.unshift(newOrder);
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    // Clear cart
    if (typeof Cart !== 'undefined') {
      Cart.clearCart();
    }

    // Initialize Real-Time Tracking Session (TrackingAPI)
    if (typeof TrackingAPI !== 'undefined') {
      TrackingAPI.getSession(orderId);
    }

    // Trigger in-app notifications
    if (typeof Notifications !== 'undefined') {
      Notifications.notify(
        'store',
        newOrder.storeId,
        '📦 New Order Received (Items Only)',
        `Order #${orderId} from ${orderData.customerName} (₹${orderData.total.toFixed(2)}). Items ready for review. Customer location hidden for privacy.`,
        'info',
        orderId
      );

      Notifications.notify(
        'admin',
        'ADM-001',
        'New Instaa Order',
        `Order #${orderId} placed via ${newOrder.payment.method}. Total ₹${newOrder.total.toFixed(2)}. Store: ${newOrder.storeName}. Commission: ₹${totalCommission.toFixed(2)}.`,
        'info',
        orderId
      );
    }

    return newOrder;
  },

  // Update order status and log timeline note
  updateOrderStatus(orderId, newStatus, extraData = {}) {
    const orders = this.getAll();
    const index = orders.findIndex(o => o.id === orderId);

    if (index === -1) {
      return { success: false, message: 'Order not found.' };
    }

    const order = orders[index];
    order.status = newStatus;
    const now = new Date().toISOString();

    if (newStatus === ORDER_STATUS.ACCEPTED) order.acceptedAt = now;
    if (newStatus === ORDER_STATUS.READY_FOR_PICKUP) order.readyAt = now;
    if (newStatus === ORDER_STATUS.RIDER_ASSIGNED) order.assignedAt = now;
    if (newStatus === ORDER_STATUS.DISPATCHED) order.dispatchedAt = now;
    if (newStatus === ORDER_STATUS.DELIVERED) order.deliveredAt = now;

    Object.assign(order, extraData);

    const note = extraData.note || `Order status updated to ${newStatus.replace(/_/g, ' ')}`;
    order.timeline.push({
      status: newStatus,
      timestamp: now,
      note: note
    });

    orders[index] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    // Notifications
    if (typeof Notifications !== 'undefined') {
      let custMsg = `Your order #${orderId} is now ${newStatus.replace(/_/g, ' ')}.`;
      if (newStatus === ORDER_STATUS.ACCEPTED) custMsg = `Store accepted your order #${orderId}. Packing is starting.`;
      if (newStatus === ORDER_STATUS.PREPARING) custMsg = `Store is carefully packing your grocery items.`;
      if (newStatus === ORDER_STATUS.READY_FOR_PICKUP) custMsg = `Order #${orderId} packed! Searching for nearby town riders.`;
      if (newStatus === ORDER_STATUS.RIDER_ASSIGNED) custMsg = `Rider ${order.assignedRiderName} assigned to order #${orderId}!`;
      if (newStatus === ORDER_STATUS.DISPATCHED) custMsg = `Rider picked up order #${orderId}. In-app Google Map navigation active!`;
      if (newStatus === ORDER_STATUS.DELIVERED) custMsg = `Order #${orderId} delivered! Case i: Verified no damage.`;
      if (newStatus === ORDER_STATUS.RETURN_IN_PROGRESS) custMsg = `Case ii: Damaged item reported. Rider returning item to store. Refund in 1-2 days.`;
      if (newStatus === ORDER_STATUS.RETURNED_TO_STORE) custMsg = `Returned item verified by store. Customer refund of ₹${order.refundAmount} queued.`;

      Notifications.notify('customer', order.customerId, `Order Update: ${newStatus}`, custMsg, 'info', orderId);
    }

    return { success: true, order };
  },

  /**
   * CASE II: DAMAGED ITEM REPORTING (From Image 2 & Image 4)
   * Customer/Rider marks item as damaged at doorstep.
   * Rider pay is withheld until returned to shop.
   * Shop Return OTP is generated.
   */
  reportDamagedItem(orderId, { damagedItemIds = [], reason = 'Item damaged upon arrival' } = {}) {
    const orders = this.getAll();
    const index = orders.findIndex(o => o.id === orderId);

    if (index === -1) return { success: false, message: 'Order not found' };
    const order = orders[index];

    // Calculate damaged items value
    let damagedTotal = 0;
    const damagedList = order.items.filter(item => damagedItemIds.length === 0 || damagedItemIds.includes(item.id));
    damagedList.forEach(item => {
      damagedTotal += item.total;
    });

    // Generate 6-digit Shop Return OTP (Store provides this to rider upon return)
    const shopReturnOtp = String(Math.floor(100000 + Math.random() * 900000));

    order.isDamaged = true;
    order.damagedItems = damagedList;
    order.damageReason = reason;
    order.shopReturnOtp = shopReturnOtp;
    order.riderPayWithheld = true; // Rider's money withheld by admin until returned
    order.refundStatus = 'PENDING';
    order.refundAmount = Number(damagedTotal.toFixed(2));
    order.status = ORDER_STATUS.RETURN_IN_PROGRESS;

    const now = new Date().toISOString();
    order.timeline.push({
      status: ORDER_STATUS.RETURN_IN_PROGRESS,
      timestamp: now,
      note: `Case ii (Damaged Goods): Customer rejected ${damagedList.length} damaged item(s) (Value: ₹${damagedTotal.toFixed(2)}). Rider returning items to shop. Shop Return OTP generated.`
    });

    orders[index] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    // Notify all parties
    if (typeof Notifications !== 'undefined') {
      Notifications.notify(
        'store',
        order.storeId,
        '⚠️ Damaged Item Return Alert',
        `Rider ${order.assignedRiderName} is returning damaged goods for Order #${orderId}. Check items and provide Shop Return OTP (${shopReturnOtp}).`,
        'warning',
        orderId
      );

      Notifications.notify(
        'rider',
        order.assignedRiderId,
        'Return Item to Store',
        `Please return damaged goods to ${order.storeName}. Enter Shop Return OTP provided by shop to release your delivery pay.`,
        'warning',
        orderId
      );

      Notifications.notify(
        'customer',
        order.customerId,
        'Damaged Item Handed Over',
        `Damaged items handed back to rider. Refund of ₹${damagedTotal.toFixed(2)} will be credited to your GPay bank account in 1-2 days.`,
        'info',
        orderId
      );

      Notifications.notify(
        'admin',
        'ADM-001',
        'Damage Return Initiated',
        `Order #${orderId}: Damage reported (₹${damagedTotal.toFixed(2)}). Money will be deducted from shop deposit upon return OTP verification.`,
        'warning',
        orderId
      );
    }

    return { success: true, order, shopReturnOtp };
  },

  /**
   * VERIFY SHOP RETURN OTP (Completing Case ii)
   * Validated by Rider at Store when handing back damaged goods.
   * On Success:
   * 1. Deducts damaged value from Shop balance / initial security deposit
   * 2. Releases Rider delivery pay
   * 3. Queues customer refund (processed in 1-2 days)
   */
  verifyShopReturnOTP(orderId, enteredOtp) {
    const orders = this.getAll();
    const index = orders.findIndex(o => o.id === orderId);

    if (index === -1) return { success: false, message: 'Order not found' };
    const order = orders[index];

    if (!order.shopReturnOtp) {
      return { success: false, message: 'No Shop Return OTP generated for this order.' };
    }

    const cleanInput = String(enteredOtp || '').trim();
    if (cleanInput !== String(order.shopReturnOtp).trim()) {
      return { success: false, message: 'Invalid Shop Return OTP. Please ask store staff to read the return verification code.' };
    }

    // Return OTP verified!
    const now = new Date().toISOString();
    order.status = ORDER_STATUS.RETURNED_TO_STORE;
    order.riderPayWithheld = false; // Released!
    order.refundStatus = 'PROCESSED';

    order.timeline.push({
      status: ORDER_STATUS.RETURNED_TO_STORE,
      timestamp: now,
      note: `Shop Return OTP verified. Damaged goods received by store. Penalty deducted from store deposit. Rider pay released. Customer refund processed via Razorpay.`
    });

    orders[index] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    // Update Wallets & Ledgers
    if (typeof Wallet !== 'undefined') {
      // 1. Deduct from store deposit/balance
      Wallet.deductStoreDamage(order.storeId, order.refundAmount, orderId);
      // 2. Release rider earnings
      Wallet.creditRiderWallet(orderId);
      // 3. Process customer refund record
      Wallet.addTransaction({
        id: `TXN-REFUND-${orderId.replace('ORD-', '')}`,
        orderId: orderId,
        userId: order.customerId,
        userRole: 'customer',
        amount: order.refundAmount,
        type: 'REFUND',
        description: `Refund for damaged goods return (credited via Razorpay to GPay in 1-2 days)`,
        status: 'COMPLETED'
      });
    }

    // Notifications
    if (typeof Notifications !== 'undefined') {
      Notifications.notify(
        'rider',
        order.assignedRiderId,
        'Rider Pay Released! 💰',
        `Shop return verified. ₹${order.riderEarnings.toFixed(2)} delivery fee released to your wallet.`,
        'success',
        orderId
      );

      Notifications.notify(
        'store',
        order.storeId,
        'Damaged Goods Return Verified',
        `₹${order.refundAmount.toFixed(2)} deducted from store initial deposit for damaged goods.`,
        'warning',
        orderId
      );

      Notifications.notify(
        'customer',
        order.customerId,
        'Refund Initiated 🎉',
        `Your refund of ₹${order.refundAmount.toFixed(2)} has been queued via Razorpay. It will reflect in your GPay account in 1-2 business days.`,
        'success',
        orderId
      );
    }

    return { success: true, message: 'Shop Return OTP verified! Rider pay released and customer refund processed.', order };
  },

  // Cancel order (Customer or Admin)
  cancelOrder(orderId, reason = 'Customer requested cancellation') {
    const order = this.getById(orderId);
    if (!order) return { success: false, message: 'Order not found.' };

    if ([ORDER_STATUS.DISPATCHED, ORDER_STATUS.DELIVERED].includes(order.status)) {
      return { 
        success: false, 
        message: 'Cannot cancel order once rider has already picked up goods and is on the way.' 
      };
    }

    this.updateOrderStatus(orderId, ORDER_STATUS.CANCELLED, {
      cancellationReason: reason,
      cancelledAt: new Date().toISOString(),
      note: `Order cancelled. Reason: ${reason}`
    });

    if (typeof Notifications !== 'undefined') {
      Notifications.notify('store', order.storeId, 'Order Cancelled', `Order #${orderId} was cancelled.`, 'warning', orderId);
      if (order.assignedRiderId) {
        Notifications.notify('rider', order.assignedRiderId, 'Delivery Cancelled', `Order #${orderId} has been cancelled.`, 'warning', orderId);
      }
    }

    return { success: true, message: 'Order cancelled successfully.' };
  }
};
