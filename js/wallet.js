/**
 * SMART STORE DELIVERY - WALLET & LEDGER SYSTEM
 * Independent ledgers for Store and Riders with strict duplicate-credit prevention
 * and transparent platform commission accounting.
 */

const TRANSACTION_TYPES = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  PAYOUT: 'PAYOUT',
  REFUND: 'REFUND'
};

const Wallet = {
  // Get store wallet details
  getStoreWallet() {
    return Storage.get(STORAGE_KEYS.STORE_WALLET, {
      storeId: 'STR-001',
      availableBalance: 0,
      totalEarnings: 0,
      pendingBalance: 0
    });
  },

  // Save store wallet
  saveStoreWallet(wallet) {
    Storage.set(STORAGE_KEYS.STORE_WALLET, wallet);
  },

  // Get rider wallet details
  getRiderWallet(riderId) {
    const wallets = Storage.get(STORAGE_KEYS.RIDER_WALLETS, {});
    return wallets[riderId] || {
      riderId: riderId,
      availableBalance: 0,
      totalEarnings: 0,
      todayEarnings: 0,
      pendingBalance: 0
    };
  },

  // Save rider wallet
  saveRiderWallet(riderId, wallet) {
    const wallets = Storage.get(STORAGE_KEYS.RIDER_WALLETS, {});
    wallets[riderId] = wallet;
    Storage.set(STORAGE_KEYS.RIDER_WALLETS, wallets);
  },

  // Get all transactions
  getAllTransactions() {
    return Storage.get(STORAGE_KEYS.TRANSACTIONS, []);
  },

  // Get transactions for specific user/store
  getTransactionsByUserId(userId) {
    const all = this.getAllTransactions();
    return all.filter(t => t.userId === userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  // Add a ledger transaction entry
  addTransaction(txnData) {
    const transactions = this.getAllTransactions();
    const newTxn = {
      id: txnData.id || `TXN-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      orderId: txnData.orderId || null,
      userId: txnData.userId,
      userRole: txnData.userRole,
      amount: Number(Number(txnData.amount).toFixed(2)),
      type: txnData.type || TRANSACTION_TYPES.CREDIT,
      description: txnData.description || '',
      status: txnData.status || 'COMPLETED',
      timestamp: new Date().toISOString()
    };

    transactions.unshift(newTxn);
    Storage.set(STORAGE_KEYS.TRANSACTIONS, transactions);
    return newTxn;
  },

  /**
   * CREDIT STORE WALLET (Triggered after Store OTP verification)
   * Credits goods amount minus 10% platform commission.
   * STRICT IDEMPOTENCY: Executed exactly once per order.
   */
  creditStoreWallet(orderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return { success: false, message: 'Order not found' };

    const order = orders[orderIndex];

    // Duplicate credit check
    if (order.storeWalletCredited) {
      console.warn(`⚠️ Store wallet already credited for order ${orderId}. Skipping duplicate.`);
      return { success: false, message: 'Store wallet already credited for this order.' };
    }

    const creditAmount = order.storeEarnings || Number((order.subtotal * 0.90).toFixed(2));
    const storeWallet = this.getStoreWallet();

    // Update store balances
    storeWallet.availableBalance = Number((storeWallet.availableBalance + creditAmount).toFixed(2));
    storeWallet.totalEarnings = Number((storeWallet.totalEarnings + creditAmount).toFixed(2));
    this.saveStoreWallet(storeWallet);

    // Record ledger transaction
    const txnId = `TXN-STR-${orderId.replace('ORD-', '')}-${Math.floor(100 + Math.random() * 900)}`;
    this.addTransaction({
      id: txnId,
      orderId: orderId,
      userId: order.storeId || 'STR-001',
      userRole: 'store',
      amount: creditAmount,
      type: TRANSACTION_TYPES.CREDIT,
      description: `Dispatched Order #${orderId} payout credit (Subtotal ₹${order.subtotal} minus 10% platform fee)`,
      status: 'COMPLETED'
    });

    // Mark order as credited
    order.storeWalletCredited = true;
    orders[orderIndex] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    console.log(`💰 Store wallet credited: +₹${creditAmount} for ${orderId}. New Balance: ₹${storeWallet.availableBalance}`);
    return { success: true, amount: creditAmount, balance: storeWallet.availableBalance };
  },

  /**
   * CREDIT RIDER WALLET (Triggered after Customer OTP verification)
   * Credits full delivery fee to the assigned rider.
   * STRICT IDEMPOTENCY: Executed exactly once per order.
   */
  creditRiderWallet(orderId) {
    const orders = Storage.get(STORAGE_KEYS.ORDERS, []);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return { success: false, message: 'Order not found' };

    const order = orders[orderIndex];

    if (!order.assignedRiderId) {
      return { success: false, message: 'No rider assigned to order.' };
    }

    // Duplicate credit check
    if (order.riderWalletCredited) {
      console.warn(`⚠️ Rider wallet already credited for order ${orderId}. Skipping duplicate.`);
      return { success: false, message: 'Rider wallet already credited for this order.' };
    }

    const creditAmount = order.riderEarnings || order.deliveryFee || 40.00;
    const riderWallet = this.getRiderWallet(order.assignedRiderId);

    // Update rider balances
    riderWallet.availableBalance = Number((riderWallet.availableBalance + creditAmount).toFixed(2));
    riderWallet.totalEarnings = Number((riderWallet.totalEarnings + creditAmount).toFixed(2));
    riderWallet.todayEarnings = Number((riderWallet.todayEarnings + creditAmount).toFixed(2));
    this.saveRiderWallet(order.assignedRiderId, riderWallet);

    // Update rider's total trip count in USERS
    const users = Storage.get(STORAGE_KEYS.USERS, []);
    const riderIndex = users.findIndex(u => u.id === order.assignedRiderId);
    if (riderIndex > -1) {
      users[riderIndex].totalTrips = (users[riderIndex].totalTrips || 0) + 1;
      Storage.set(STORAGE_KEYS.USERS, users);
    }

    // Record ledger transaction
    const txnId = `TXN-RDR-${orderId.replace('ORD-', '')}-${Math.floor(100 + Math.random() * 900)}`;
    this.addTransaction({
      id: txnId,
      orderId: orderId,
      userId: order.assignedRiderId,
      userRole: 'rider',
      amount: creditAmount,
      type: TRANSACTION_TYPES.CREDIT,
      description: `Delivery fee earnings for completing Order #${orderId} (${order.distanceKm} km)`,
      status: 'COMPLETED'
    });

    // Mark order as credited
    order.riderWalletCredited = true;
    orders[orderIndex] = order;
    Storage.set(STORAGE_KEYS.ORDERS, orders);

    console.log(`💰 Rider ${order.assignedRiderId} credited: +₹${creditAmount} for ${orderId}. New Balance: ₹${riderWallet.availableBalance}`);
    return { success: true, amount: creditAmount, balance: riderWallet.availableBalance };
  },

  // Simulated Payout Request (Withdrawal to Bank / UPI)
  requestPayout(userId, userRole, amount) {
    amount = Number(amount);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, message: 'Please enter a valid payout amount.' };
    }

    let wallet = userRole === 'store' ? this.getStoreWallet() : this.getRiderWallet(userId);

    if (wallet.availableBalance < amount) {
      return { success: false, message: `Insufficient funds. Available balance: ₹${wallet.availableBalance.toFixed(2)}` };
    }

    // Deduct amount
    wallet.availableBalance = Number((wallet.availableBalance - amount).toFixed(2));

    if (userRole === 'store') {
      this.saveStoreWallet(wallet);
    } else {
      this.saveRiderWallet(userId, wallet);
    }

    // Log DEBIT / PAYOUT transaction
    const txnId = `PAYOUT-${Date.now().toString().slice(-6)}`;
    this.addTransaction({
      id: txnId,
      orderId: null,
      userId: userId,
      userRole: userRole,
      amount: amount,
      type: TRANSACTION_TYPES.PAYOUT,
      description: `Simulated bank transfer payout to registered account`,
      status: 'COMPLETED'
    });

    return { 
      success: true, 
      message: `Payout of ₹${amount.toFixed(2)} processed successfully to your registered bank account!`,
      newBalance: wallet.availableBalance 
    };
  },

  /**
   * DEDUCT STORE DAMAGE (Case ii - Damaged Goods Return)
   * Deducts value of damaged goods directly from store's initial deposit / balance.
   */
  deductStoreDamage(storeId, amount, orderId) {
    const storeWallet = this.getStoreWallet();
    amount = Number(Number(amount).toFixed(2));

    if (storeWallet.initialDeposit && storeWallet.initialDeposit >= amount) {
      storeWallet.initialDeposit = Number((storeWallet.initialDeposit - amount).toFixed(2));
    } else {
      storeWallet.availableBalance = Number((storeWallet.availableBalance - amount).toFixed(2));
    }
    this.saveStoreWallet(storeWallet);

    const txnId = `TXN-DMG-${orderId ? orderId.replace('ORD-', '') : Date.now()}`;
    this.addTransaction({
      id: txnId,
      orderId: orderId,
      userId: storeId || 'STR-001',
      userRole: 'store',
      amount: amount,
      type: TRANSACTION_TYPES.DEBIT,
      description: `Damage penalty deduction for returned items on Order #${orderId} (Deducted from store deposit)`,
      status: 'COMPLETED'
    });

    console.log(`⚠️ Store deposit deducted: -₹${amount} for damage on ${orderId}`);
    return { success: true, amount, depositRemaining: storeWallet.initialDeposit };
  }
};
