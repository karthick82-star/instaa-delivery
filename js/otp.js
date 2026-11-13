/**
 * SMART STORE DELIVERY - DUAL OTP VERIFICATION SYSTEM
 * Independent two-stage verification:
 * Stage 1: Store Handover OTP (Store -> Rider)
 * Stage 2: Customer Delivery OTP (Customer -> Rider)
 */

const OTP = {
  // Generate a random 6-digit number string
  generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  },

  // Generate Store Handover OTP when store marks order READY_FOR_PICKUP
  generateStoreOTP(orderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const index = orders.findIndex(o => o.id === orderId);

    if (index === -1) return null;

    let otp = this.generateCode();
    // Ensure Store OTP never equals Customer OTP
    while (otp === orders[index].customerOtp) {
      otp = this.generateCode();
    }

    orders[index].storeOtp = otp;
    orders[index].storeOtpGeneratedAt = new Date().toISOString();
    orders[index].storeOtpAttempts = 0;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    console.log(`🔑 Generated Store OTP for ${orderId}: ${otp}`);
    return otp;
  },

  /**
   * VERIFY STORE HANDOVER OTP
   * Validated by Rider at Store.
   * On success: Updates status to DISPATCHED & triggers Store Wallet credit exactly once.
   */
  verifyStoreOTP(orderId, enteredOtp) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const index = orders.findIndex(o => o.id === orderId);

    if (index === -1) {
      return { success: false, message: 'Order not found.' };
    }

    const order = orders[index];

    if (!order.storeOtp) {
      return { success: false, message: 'Store OTP has not been generated for this order yet.' };
    }

    if (order.status !== ORDER_STATUS.RIDER_ASSIGNED) {
      return { 
        success: false, 
        message: `Invalid order state (${order.status}). Handover can only be verified when Rider is assigned.` 
      };
    }

    const cleanInput = String(enteredOtp || '').trim();
    order.storeOtpAttempts = (order.storeOtpAttempts || 0) + 1;

    // Check OTP Match
    if (cleanInput !== String(order.storeOtp).trim()) {
      Storage.set(STORAGE_KEYS.ORDERS, orders);
      const remaining = Math.max(0, 3 - order.storeOtpAttempts);
      return { 
        success: false, 
        message: `Incorrect Store OTP entered. Handover not verified. Please ask the store staff for the 6-digit pickup code. (Attempts left: ${remaining})`,
        attempts: order.storeOtpAttempts
      };
    }

    // OTP MATCH SUCCESSFUL!
    const now = new Date().toISOString();
    order.status = ORDER_STATUS.DISPATCHED;
    order.dispatchedAt = now;
    order.timeline.push({
      status: ORDER_STATUS.DISPATCHED,
      timestamp: now,
      note: `Store OTP (${cleanInput}) verified successfully. Goods handed over to Rider ${order.assignedRiderName}. Dispatched for customer delivery.`
    });

    orders[index] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    // Credit Store Wallet exactly once
    if (typeof Wallet !== 'undefined') {
      Wallet.creditStoreWallet(orderId);
    }

    // Send notifications
    if (typeof Notifications !== 'undefined') {
      Notifications.notify(
        'store',
        order.storeId,
        'Goods Handed Over',
        `Order #${orderId} was picked up by ${order.assignedRiderName}. Wallet credited!`,
        'success',
        orderId
      );

      Notifications.notify(
        'customer',
        order.customerId,
        'Order Dispatched & On The Way!',
        `Your order #${orderId} has left FreshMart with Rider ${order.assignedRiderName}. Keep your delivery OTP ready!`,
        'success',
        orderId
      );

      Notifications.notify(
        'admin',
        'ADM-001',
        'Pickup Verified',
        `Order #${orderId} picked up by ${order.assignedRiderName}. Store wallet credited.`,
        'info',
        orderId
      );
    }

    return { 
      success: true, 
      message: 'Store Handover OTP verified! Package picked up. Deliver to customer.',
      order 
    };
  },

  /**
   * VERIFY CUSTOMER DELIVERY OTP
   * Validated by Rider at Customer Doorstep.
   * On success: Updates status to DELIVERED & triggers Rider Wallet credit exactly once.
   */
  verifyCustomerOTP(orderId, enteredOtp) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const index = orders.findIndex(o => o.id === orderId);

    if (index === -1) {
      return { success: false, message: 'Order not found.' };
    }

    const order = orders[index];

    if (!order.customerOtp) {
      return { success: false, message: 'Customer OTP missing from order data.' };
    }

    if (order.status !== ORDER_STATUS.DISPATCHED) {
      return { 
        success: false, 
        message: `Order must be in DISPATCHED state to verify delivery. Current state: ${order.status}` 
      };
    }

    const cleanInput = String(enteredOtp || '').trim();
    order.customerOtpAttempts = (order.customerOtpAttempts || 0) + 1;

    // Check OTP Match
    if (cleanInput !== String(order.customerOtp).trim()) {
      Storage.set(STORAGE_KEYS.ORDERS, orders);
      return { 
        success: false, 
        message: 'Incorrect Customer OTP entered. Delivery cannot be completed. Please ask customer to read the OTP shown on their screen.',
        attempts: order.customerOtpAttempts
      };
    }

    // OTP MATCH SUCCESSFUL!
    const now = new Date().toISOString();
    order.status = ORDER_STATUS.DELIVERED;
    order.deliveredAt = now;
    order.timeline.push({
      status: ORDER_STATUS.DELIVERED,
      timestamp: now,
      note: `Customer OTP (${cleanInput}) verified successfully at doorstep. Order marked as DELIVERED.`
    });

    orders[index] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    // Credit Rider Wallet exactly once
    if (typeof Wallet !== 'undefined') {
      Wallet.creditRiderWallet(orderId);
    }

    // Send notifications
    if (typeof Notifications !== 'undefined') {
      Notifications.notify(
        'customer',
        order.customerId,
        'Order Delivered 🎉',
        `Order #${orderId} has been delivered successfully. Thank you for shopping with FreshMart!`,
        'success',
        orderId
      );

      Notifications.notify(
        'rider',
        order.assignedRiderId,
        'Delivery Complete! 💰',
        `₹${order.riderEarnings.toFixed(2)} delivery earnings credited to your wallet for Order #${orderId}.`,
        'success',
        orderId
      );

      Notifications.notify(
        'store',
        order.storeId,
        'Delivery Completed',
        `Order #${orderId} successfully delivered to ${order.customerName}.`,
        'info',
        orderId
      );

      Notifications.notify(
        'admin',
        'ADM-001',
        'Delivery Completed',
        `Order #${orderId} delivered by ${order.assignedRiderName}. Rider wallet credited.`,
        'success',
        orderId
      );
    }

    return { 
      success: true, 
      message: `Delivery completed successfully! ₹${order.riderEarnings.toFixed(2)} has been added to your rider wallet.`,
      order 
    };
  },

  /**
   * GENERATE SHOP RETURN OTP (For Damaged Items Return - Case ii)
   * Provided by Store Manager when Rider returns damaged goods.
   */
  generateShopReturnOTP(orderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const index = orders.findIndex(o => o.id === orderId);
    if (index === -1) return null;

    let otp = this.generateCode();
    orders[index].shopReturnOtp = otp;
    Storage.set(STORAGE_KEYS.ORDERS, orders);
    return otp;
  },

  /**
   * VERIFY SHOP RETURN OTP (For Damaged Items Return - Case ii)
   * Validated by Rider at Store to release withheld delivery pay.
   */
  verifyShopReturnOTP(orderId, enteredOtp) {
    if (typeof Orders !== 'undefined' && typeof Orders.verifyShopReturnOTP === 'function') {
      return Orders.verifyShopReturnOTP(orderId, enteredOtp);
    }
    return { success: false, message: 'Orders module not loaded' };
  }
};
