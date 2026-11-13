/**
 * INSTAA - RURAL HYPERLOCAL Q-COMMERCE ECOSYSTEM
 * STORAGE LAYER
 * Handles multi-town demo data initialization, varying commission slabs,
 * King & Queen HA Server state, localStorage persistence, and cross-tab sync.
 */

const STORAGE_KEYS = {
  USERS: 'ssd_users',
  CURRENT_USER: 'ssd_current_user',
  PRODUCTS: 'ssd_products',
  ORDERS: 'ssd_orders',
  CART: 'ssd_cart',
  STORE_WALLET: 'ssd_store_wallet',
  RIDER_WALLETS: 'ssd_rider_wallets',
  TRANSACTIONS: 'ssd_transactions',
  NOTIFICATIONS: 'ssd_notifications',
  SYSTEM_CONFIG: 'ssd_system_config',
  HA_SERVER: 'ssd_ha_server',
  TOWNS: 'ssd_towns',
  SELECTED_TOWN: 'ssd_selected_town'
};

// Seed Towns
const SEED_TOWNS = [
  {
    id: 'TOWN-01',
    name: 'Town A (Rampur)',
    code: 'TOWN_A',
    state: 'Karnataka',
    district: 'Rural Bangalore',
    localDeliveryFee: 40,
    etaMinutes: 18,
    isAvailable: true
  },
  {
    id: 'TOWN-02',
    name: 'Town B (Shampur)',
    code: 'TOWN_B',
    state: 'Karnataka',
    district: 'Rural Bangalore',
    localDeliveryFee: 40,
    etaMinutes: 18,
    isAvailable: true
  }
];

// System Configuration with Varying Commission Slabs
const DEFAULT_CONFIG = {
  storeName: 'FreshMart Superstore',
  storeAddress: '108 Market Square, Rampur (Town A)',
  storePhone: '+91 98765 00001',
  storeRating: 4.9,
  baseDeliveryFee: 40,        // Base ₹40 for standard local town delivery
  interTownDeliveryFee: 70,   // ₹70 for inter-town deliveries (Town A <-> Town B)
  platformFee: 15,            // ₹15 customer platform fee
  gstRate: 0.05,              // 5% GST on items
  riderIdleTimeoutMinutes: 2, // 2-minute idle timeout for rider reassignment
  
  // Varying Commission Slabs (Feature 4 from requirements)
  commissionSlabs: {
    'Kitchen Staples': {
      rate: 0.04, // 4% default (slab: 3% - 4%)
      minRate: 0.03,
      maxRate: 0.04,
      label: 'Kitchen Staples (Rice, Atta, Oil)',
      description: 'Rice, Atta, Pulses, Cooking Oils'
    },
    'Dairy & Daily Essentials': {
      rate: 0.04, // 4% default (slab: 3% - 5%)
      minRate: 0.03,
      maxRate: 0.05,
      label: 'Dairy & Daily Essentials (Milk, Paneer)',
      description: 'Milk, Paneer, Curd, Butter, Eggs'
    },
    'Packaged FMCG & Snacks': {
      rate: 0.07, // 7% default (slab: 6% - 8%)
      minRate: 0.06,
      maxRate: 0.08,
      label: 'Packaged FMCG & Snacks (Biscuits, Chips)',
      description: 'Biscuits, Chips, Chocolates, Dry Fruits'
    },
    'Personal Care & Household': {
      rate: 0.09, // 9% default (slab: 8% - 10%)
      minRate: 0.08,
      maxRate: 0.10,
      label: 'Personal Care & Household (Soaps, Detergents)',
      description: 'Soaps, Shampoos, Detergents, Toothpaste'
    },
    'Fruits & Veggies': {
      rate: 0.05,
      minRate: 0.03,
      maxRate: 0.06,
      label: 'Fruits & Vegetables',
      description: 'Farm-fresh seasonal fruits and vegetables'
    },
    'Beverages': {
      rate: 0.06,
      minRate: 0.05,
      maxRate: 0.08,
      label: 'Beverages',
      description: 'Coffee, Tea, Tender Coconut, Juices'
    }
  }
};

// Seed Users: Multi-Town Stores, Riders, Customers, Admin
const SEED_USERS = [
  // Customers
  {
    id: 'CUST-001',
    name: 'Priya Sharma',
    email: 'customer@demo.com',
    password: 'pass123',
    role: 'customer',
    phone: '+91 98111 22334',
    townId: 'TOWN-01',
    townName: 'Town A (Rampur)',
    address: 'House 402, Greenfield Cross, Rampur (Town A) - 562123',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2026-01-15'
  },
  {
    id: 'CUST-002',
    name: 'Rahul Verma',
    email: 'customer2@demo.com',
    password: 'pass123',
    role: 'customer',
    phone: '+91 98222 33445',
    townId: 'TOWN-02',
    townName: 'Town B (Shampur)',
    address: 'Plot 14B, Riverside Road, Shampur (Town B) - 562135',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2026-02-01'
  },

  // Town A Riders (Priority for Town A Stores)
  {
    id: 'RDR-001',
    name: 'Alex Kumar',
    email: 'rider1@demo.com',
    password: 'pass123',
    role: 'rider',
    phone: '+91 98701 11223',
    townId: 'TOWN-01',
    townName: 'Town A (Rampur)',
    vehicle: 'Hero Electric Optima (KA-05-EV-1024)',
    status: 'ONLINE',
    rating: 4.9,
    totalTrips: 34,
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2025-11-10'
  },
  {
    id: 'RDR-002',
    name: 'Ben Joseph',
    email: 'rider2@demo.com',
    password: 'pass123',
    role: 'rider',
    phone: '+91 98702 22334',
    townId: 'TOWN-01',
    townName: 'Town A (Rampur)',
    vehicle: 'Ather 450X (KA-03-EB-4589)',
    status: 'ONLINE',
    rating: 4.8,
    totalTrips: 28,
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2025-12-05'
  },

  // Town B Riders (Priority for Town B Stores)
  {
    id: 'RDR-003',
    name: 'Maya Patel',
    email: 'rider3@demo.com',
    password: 'pass123',
    role: 'rider',
    phone: '+91 98703 33445',
    townId: 'TOWN-02',
    townName: 'Town B (Shampur)',
    vehicle: 'TVS iQube (KA-01-EL-7812)',
    status: 'ONLINE',
    rating: 5.0,
    totalTrips: 42,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2025-10-20'
  },
  {
    id: 'RDR-004',
    name: 'Rajesh Verma',
    email: 'rider4@demo.com',
    password: 'pass123',
    role: 'rider',
    phone: '+91 98704 44556',
    townId: 'TOWN-02',
    townName: 'Town B (Shampur)',
    vehicle: 'Bajaj Chetak EV (KA-53-E-8891)',
    status: 'ONLINE',
    rating: 4.9,
    totalTrips: 31,
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2025-11-28'
  },

  // Multi-Town Stores with Online/Offline Toggle & Security Deposit
  {
    id: 'STR-001',
    name: 'FreshMart Superstore (Town A)',
    managerName: 'Vikram Rathore',
    email: 'store@demo.com',
    password: 'pass123',
    role: 'store',
    phone: '+91 98765 00001',
    townId: 'TOWN-01',
    townName: 'Town A (Rampur)',
    address: '108 Market Square, Rampur (Town A)',
    isOnline: true, // Online/Offline toggle (Feature 2)
    initialDeposit: 15000.00, // Deposit from which damaged items are deducted
    rating: 4.9,
    avatar: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2025-08-01'
  },
  {
    id: 'STR-002',
    name: 'Instaa Super Bazaar (Town B)',
    managerName: 'Sanjay Deshmukh',
    email: 'store2@demo.com',
    password: 'pass123',
    role: 'store',
    phone: '+91 98765 00002',
    townId: 'TOWN-02',
    townName: 'Town B (Shampur)',
    address: '42 Main Bazaar Road, Shampur (Town B)',
    isOnline: true, // Online/Offline toggle (Feature 2)
    initialDeposit: 15000.00,
    rating: 4.8,
    avatar: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2025-09-15'
  },

  // System Admin
  {
    id: 'ADM-001',
    name: 'Instaa Administrator',
    email: 'admin@demo.com',
    password: 'admin123',
    role: 'admin',
    phone: '+91 98000 00000',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    joinedDate: '2025-01-01'
  }
];

// Seed Products with Categories mapped to Varying Commission Slabs
const SEED_PRODUCTS = [
  // 1. Kitchen Staples (3% - 4% commission)
  {
    id: 'PRD-110',
    name: 'Cold-Pressed Mustard Cooking Oil',
    category: 'Kitchen Staples',
    price: 195,
    originalPrice: 240,
    unit: '1 Litre Glass Bottle',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&auto=format&fit=crop&q=80',
    description: 'Pure kachi ghani mustard oil for healthy rural traditional cooking with natural pungency.',
    inStock: true,
    storeId: 'STR-001',
    badge: 'Staple'
  },
  {
    id: 'PRD-116',
    name: 'Multigrain Whole Wheat Atta',
    category: 'Kitchen Staples',
    price: 295,
    originalPrice: 340,
    unit: '5 kg Bag',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&auto=format&fit=crop&q=80',
    description: 'Wholesome stone-ground flour enriched with soya, chana, oat, maize and psyllium husk for soft rotis.',
    inStock: true,
    storeId: 'STR-001'
  },
  {
    id: 'PRD-121',
    name: 'Premium Sharbati Basmati Rice',
    category: 'Kitchen Staples',
    price: 450,
    originalPrice: 520,
    unit: '5 kg Bag',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=80',
    description: 'Aged long-grain aromatic Sharbati basmati rice with slender fluffy grains.',
    inStock: true,
    storeId: 'STR-001',
    badge: 'Bestseller'
  },

  // 2. Dairy & Daily Essentials (3% - 5% commission)
  {
    id: 'PRD-106',
    name: 'Farm Fresh Cow Milk',
    category: 'Dairy & Daily Essentials',
    price: 64,
    originalPrice: 70,
    unit: '1 Litre Pouch',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&auto=format&fit=crop&q=80',
    description: 'Pasteurized, homogenized whole cow milk with 3.5% fat and 8.5% SNF. Wholesome and nutritious.',
    inStock: true,
    storeId: 'STR-001',
    badge: 'Daily Need'
  },
  {
    id: 'PRD-109',
    name: 'Salted Amul Table Butter',
    category: 'Dairy & Daily Essentials',
    price: 275,
    originalPrice: 285,
    unit: '500g Pack',
    rating: 5.0,
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&auto=format&fit=crop&q=80',
    description: 'The taste of India - delicious salted creamery butter made from pure milk fat.',
    inStock: true,
    storeId: 'STR-001'
  },
  {
    id: 'PRD-120',
    name: 'Fresh Farm Cottage Paneer',
    category: 'Dairy & Daily Essentials',
    price: 85,
    originalPrice: 105,
    unit: '200g Vacuum Pack',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&auto=format&fit=crop&q=80',
    description: 'Melt-in-mouth malai paneer packed fresh from rural dairies. High protein and rich calcium.',
    inStock: true,
    storeId: 'STR-001',
    badge: 'Fresh Today'
  },
  {
    id: 'PRD-108',
    name: 'Farm Fresh Brown Eggs',
    category: 'Dairy & Daily Essentials',
    price: 70,
    originalPrice: 85,
    unit: 'Pack of 6',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&auto=format&fit=crop&q=80',
    description: 'Antibiotic-free free-range brown eggs with deep orange yolks, rich in protein and Omega-3.',
    inStock: true,
    storeId: 'STR-001'
  },

  // 3. Packaged FMCG & Snacks (6% - 8% commission)
  {
    id: 'PRD-113',
    name: 'Gourmet Sea Salt Potato Chips',
    category: 'Packaged FMCG & Snacks',
    price: 85,
    originalPrice: 99,
    unit: '150g Bag',
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&auto=format&fit=crop&q=80',
    description: 'Kettle-cooked batch chips crisped to golden perfection and seasoned with Himalayan pink rock salt.',
    inStock: true,
    storeId: 'STR-001'
  },
  {
    id: 'PRD-114',
    name: 'Roasted Salted California Almonds',
    category: 'Packaged FMCG & Snacks',
    price: 260,
    originalPrice: 310,
    unit: '200g Pouch',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1508061252966-f72fb9822365?w=400&auto=format&fit=crop&q=80',
    description: 'Dry roasted crunchy nonpareil California almonds lightly salted. Perfect guilt-free healthy snack.',
    inStock: true,
    storeId: 'STR-001'
  },
  {
    id: 'PRD-123',
    name: 'Parle-G Gold Glucose Biscuits',
    category: 'Packaged FMCG & Snacks',
    price: 50,
    originalPrice: 60,
    unit: 'Pack of 10 (800g Total)',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&auto=format&fit=crop&q=80',
    description: 'India\'s favorite tea companion. Crisp, wholesome glucose biscuits with the classic milky taste.',
    inStock: true,
    storeId: 'STR-001'
  },
  {
    id: 'PRD-124',
    name: 'Haldiram\'s Nagpur Bhujia Sev',
    category: 'Packaged FMCG & Snacks',
    price: 115,
    originalPrice: 135,
    unit: '400g Pouch',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&auto=format&fit=crop&q=80',
    description: 'Crispy, spicy moth bean and besan noodle snack seasoned with authentic Indian spices.',
    inStock: true,
    storeId: 'STR-001'
  },

  // 4. Personal Care & Household (8% - 10% commission)
  {
    id: 'PRD-117',
    name: 'Dettol Original Germ Protection Soap',
    category: 'Personal Care & Household',
    price: 145,
    originalPrice: 175,
    unit: 'Buy 3 Get 1 Free (125g each)',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1607006314187-57ef9a58fc42?w=400&auto=format&fit=crop&q=80',
    description: 'Trusted anti-bacterial hygiene protection for everyday bathing. Kills 99.9% germs.',
    inStock: true,
    storeId: 'STR-001',
    badge: 'Popular'
  },
  {
    id: 'PRD-118',
    name: 'Surf Excel Matic Front Load Liquid Detergent',
    category: 'Personal Care & Household',
    price: 220,
    originalPrice: 260,
    unit: '1 Litre Refill Pouch',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=400&auto=format&fit=crop&q=80',
    description: 'Deep penetrating stain remover liquid for machine washing with fresh fragrance and fiber care.',
    inStock: true,
    storeId: 'STR-001'
  },
  {
    id: 'PRD-119',
    name: 'Colgate Total Dental Cavity Toothpaste',
    category: 'Personal Care & Household',
    price: 98,
    originalPrice: 120,
    unit: '150g Tube',
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1559591937-e1060935574c?w=400&auto=format&fit=crop&q=80',
    description: '12-hour whole mouth antibacterial protection for teeth, tongue, cheeks and gums.',
    inStock: true,
    storeId: 'STR-001'
  },

  // 5. Fruits & Veggies (5% commission)
  {
    id: 'PRD-101',
    name: 'Fresh Alphonso Mangoes',
    category: 'Fruits & Veggies',
    price: 299,
    originalPrice: 380,
    unit: '1 kg (approx. 4 pcs)',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&auto=format&fit=crop&q=80',
    description: 'Directly sourced Ratnagiri Alphonso mangoes, naturally ripened and aromatic with rich saffron sweetness.',
    inStock: true,
    storeId: 'STR-001',
    badge: 'Bestseller'
  },
  {
    id: 'PRD-102',
    name: 'Organic Farm Bananas',
    category: 'Fruits & Veggies',
    price: 65,
    originalPrice: 80,
    unit: '1 Dozen',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&auto=format&fit=crop&q=80',
    description: 'Fresh organically grown Robusta bananas packed with natural potassium, vitamin B6 and energy.',
    inStock: true,
    storeId: 'STR-001'
  },
  {
    id: 'PRD-104',
    name: 'Ripe Vine Tomatoes',
    category: 'Fruits & Veggies',
    price: 45,
    originalPrice: 60,
    unit: '1 kg',
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1546470427-e26264be0b11?w=400&auto=format&fit=crop&q=80',
    description: 'Plump red farm-fresh hybrid tomatoes perfect for rich curries, fresh salads, and tangy soups.',
    inStock: true,
    storeId: 'STR-001'
  },

  // 6. Beverages (6% commission)
  {
    id: 'PRD-111',
    name: 'Arabica Dark Roast Ground Coffee',
    category: 'Beverages',
    price: 380,
    originalPrice: 450,
    unit: '250g Pouch',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&auto=format&fit=crop&q=80',
    description: 'Single-estate Chikmagalur Arabica beans, roasted dark with notes of bittersweet dark cocoa and caramel.',
    inStock: true,
    storeId: 'STR-001'
  },
  {
    id: 'PRD-112',
    name: 'Tender Coconut Water',
    category: 'Beverages',
    price: 110,
    originalPrice: 130,
    unit: '1 Litre Tetra Pack',
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?w=400&auto=format&fit=crop&q=80',
    description: 'Naturally refreshing pure coconut water with zero added sugar or preservatives. Instant hydration.',
    inStock: true,
    storeId: 'STR-001'
  }
];

// Seed Historical Orders
const SEED_ORDERS = [
  {
    id: 'ORD-1000',
    customerId: 'CUST-001',
    customerName: 'Priya Sharma',
    customerPhone: '+91 98111 22334',
    customerTownId: 'TOWN-01',
    deliveryAddress: 'House 402, Greenfield Cross, Rampur (Town A) - 562123',
    storeId: 'STR-001',
    storeName: 'FreshMart Superstore (Town A)',
    storeTownId: 'TOWN-01',
    isInterTown: false,
    items: [
      { id: 'PRD-101', name: 'Fresh Alphonso Mangoes', category: 'Fruits & Veggies', price: 299, qty: 1, total: 299 },
      { id: 'PRD-106', name: 'Farm Fresh Cow Milk', category: 'Dairy & Daily Essentials', price: 64, qty: 2, total: 128 },
      { id: 'PRD-117', name: 'Dettol Original Germ Protection Soap', category: 'Personal Care & Household', price: 145, qty: 1, total: 145 }
    ],
    subtotal: 572,
    deliveryFee: 40,
    platformFee: 15,
    gst: 28.60,
    total: 655.60,
    payment: {
      method: 'GPAY',
      status: 'PAID',
      transactionId: 'pay_gpay_demo_1000',
      paidAt: '2026-03-30T10:15:00.000Z'
    },
    status: 'DELIVERED',
    customerOtp: '582910',
    storeOtp: '419283',
    assignedRiderId: 'RDR-001',
    assignedRiderName: 'Alex Kumar',
    assignedRiderPhone: '+91 98701 11223',
    assignedRiderVehicle: 'Hero Electric Optima (KA-05-EV-1024)',
    assignedRiderTownId: 'TOWN-01',
    distanceKm: 3.2,
    estimatedMinutes: 18,
    storeWalletCredited: true,
    riderWalletCredited: true,
    totalCommission: 33.12, // Itemized varying commission
    storeEarnings: 538.88,  // Subtotal 572 - commission
    riderEarnings: 40.00,   // Full local delivery fee
    platformEarnings: 76.72,
    createdAt: '2026-03-30T10:14:00.000Z',
    deliveredAt: '2026-03-30T10:48:00.000Z',
    timeline: [
      { status: 'NEW', timestamp: '2026-03-30T10:14:00.000Z', note: 'Order placed & payment verified via Google Pay.' },
      { status: 'ACCEPTED', timestamp: '2026-03-30T10:16:00.000Z', note: 'Store accepted order (Items ONLY, location hidden for privacy).' },
      { status: 'READY_FOR_PICKUP', timestamp: '2026-03-30T10:25:00.000Z', note: 'Ready for rider pickup, Store Handover OTP generated.' },
      { status: 'RIDER_ASSIGNED', timestamp: '2026-03-30T10:26:00.000Z', note: 'Claimed by Town A Rider Alex Kumar.' },
      { status: 'DISPATCHED', timestamp: '2026-03-30T10:32:00.000Z', note: 'Store OTP verified. Customer destination & Google Map unlocked.' },
      { status: 'DELIVERED', timestamp: '2026-03-30T10:48:00.000Z', note: 'Case i: Customer OTP verified. No damage. Rider wallet credited.' }
    ]
  }
];

// Seed Store Wallets
const SEED_STORE_WALLET = {
  storeId: 'STR-001',
  availableBalance: 4250.00,
  totalEarnings: 15400.00,
  pendingBalance: 0.00,
  initialDeposit: 15000.00 // Security deposit for damage deduction
};

// Seed Rider Wallets
const SEED_RIDER_WALLETS = {
  'RDR-001': {
    riderId: 'RDR-001',
    availableBalance: 580.00,
    totalEarnings: 2450.00,
    todayEarnings: 160.00,
    pendingBalance: 0.00
  },
  'RDR-002': {
    riderId: 'RDR-002',
    availableBalance: 410.00,
    totalEarnings: 1890.00,
    todayEarnings: 110.00,
    pendingBalance: 0.00
  },
  'RDR-003': {
    riderId: 'RDR-003',
    availableBalance: 720.00,
    totalEarnings: 3120.00,
    todayEarnings: 210.00,
    pendingBalance: 0.00
  },
  'RDR-004': {
    riderId: 'RDR-004',
    availableBalance: 490.00,
    totalEarnings: 1950.00,
    todayEarnings: 120.00,
    pendingBalance: 0.00
  }
};

// Seed Transactions
const SEED_TRANSACTIONS = [
  {
    id: 'TXN-STR-1000',
    orderId: 'ORD-1000',
    userId: 'STR-001',
    userRole: 'store',
    amount: 538.88,
    type: 'CREDIT',
    description: 'Payment credit for Order #ORD-1000 (after varying category commission deduction)',
    status: 'COMPLETED',
    timestamp: '2026-03-30T10:32:00.000Z'
  },
  {
    id: 'TXN-RDR-1000',
    orderId: 'ORD-1000',
    userId: 'RDR-001',
    userRole: 'rider',
    amount: 40.00,
    type: 'CREDIT',
    description: 'Delivery earnings for completing Order #ORD-1000 via Razorpay payout',
    status: 'COMPLETED',
    timestamp: '2026-03-30T10:48:00.000Z'
  }
];

// Seed Notifications
const SEED_NOTIFICATIONS = [
  {
    id: 'NOTIF-01',
    targetRole: 'customer',
    targetUserId: 'CUST-001',
    title: 'Order Delivered!',
    message: 'Your order #ORD-1000 was delivered successfully by Alex Kumar. No damage reported.',
    type: 'success',
    timestamp: '2026-03-30T10:48:00.000Z',
    read: false
  },
  {
    id: 'NOTIF-02',
    targetRole: 'rider',
    targetUserId: 'RDR-001',
    title: 'Earnings Credited',
    message: '₹40.00 credited to your wallet for Order #ORD-1000.',
    type: 'success',
    timestamp: '2026-03-30T10:48:00.000Z',
    read: false
  }
];

// Seed King & Queen High Availability (HA) Server Cluster (Feature 1)
const SEED_HA_SERVER = {
  king: {
    id: 'SRV-KING-01',
    name: 'Primary Server (KING)',
    role: 'PRIMARY',
    status: 'ONLINE', // 'ONLINE' | 'OUTAGE'
    provider: 'AWS Cloud (ap-south-1, Mumbai DC-1)',
    virtualization: 'AWS Nitro Hypervisor',
    ip: '13.235.42.10',
    pingMs: 24,
    cpuUsage: '28%',
    memoryUsage: '42%',
    lastHeartbeat: new Date().toISOString(),
    uptime: '99.99%'
  },
  queen: {
    id: 'SRV-QUEEN-01',
    name: 'Standby Server (QUEEN)',
    role: 'STANDBY', // 'STANDBY' | 'PROMOTED_PRIMARY'
    status: 'STANDBY', // 'STANDBY' | 'ACTIVE'
    provider: 'Google Cloud Platform (asia-south2, Bangalore DC-2)',
    virtualization: 'KVM Compute Engine (Zero shared infra with KING)',
    ip: '34.93.18.99',
    pingMs: 19,
    syncLagMs: 8,
    lastHeartbeat: new Date().toISOString(),
    uptime: '100%'
  },
  activeServer: 'KING', // 'KING' or 'QUEEN'
  failoverMode: 'AUTOMATIC',
  heartbeatIntervalSec: 3,
  consecutiveMisses: 0,
  maxMissesBeforeFailover: 3,
  smsAlertPhone: '+91 98000 00000',
  autoFailoverEnabled: true,
  smsLogs: [
    {
      id: 'SMS-101',
      recipient: '+91 98000 00000',
      message: '[INSTAA-HA] Cluster initialized. KING active (AWS Mumbai). QUEEN standby (GCP Bangalore). Heartbeat check OK.',
      status: 'DELIVERED',
      timestamp: new Date().toISOString()
    }
  ]
};

/**
 * Storage Helpers
 */
// Keys shared between all devices through server.js (everything except per-device ones)
const SYNC_KEYS = [
  STORAGE_KEYS.USERS, STORAGE_KEYS.PRODUCTS, STORAGE_KEYS.ORDERS, STORAGE_KEYS.STORE_WALLET,
  STORAGE_KEYS.RIDER_WALLETS, STORAGE_KEYS.TRANSACTIONS, STORAGE_KEYS.NOTIFICATIONS,
  STORAGE_KEYS.SYSTEM_CONFIG, STORAGE_KEYS.TOWNS
];
const TRACKING_KEY = 'instaa_tracking_sessions';

const Storage = {
  clientId: 'c_' + Math.random().toString(36).slice(2, 10),
  seq: 0,
  serverMode: false,
  applyingRemote: false,
  es: null,

  isHttp() { return typeof location !== 'undefined' && /^https?:$/.test(location.protocol); },

  // ---- MULTI-DEVICE SYNC -------------------------------------------------
  // 1. On page load: pull the shared state from the server (synchronously, before pages render)
  bootstrapFromServer() {
    if (!this.isHttp()) return null;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/state', false);
      xhr.send();
      if (xhr.status !== 200) return null;
      const data = JSON.parse(xhr.responseText);
      if (!data || !data.success) return null;
      this.serverMode = true;
      this.applyingRemote = true;
      Object.keys(data.state || {}).forEach(k => {
        try { localStorage.setItem(k, JSON.stringify(data.state[k])); } catch (e) {}
      });
      if (data.trackingSessions && Object.keys(data.trackingSessions).length) {
        try { localStorage.setItem(TRACKING_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(TRACKING_KEY) || '{}'), ...data.trackingSessions })); } catch (e) {}
      }
      this.applyingRemote = false;
      return data.state || {};
    } catch (e) {
      this.applyingRemote = false;
      return null;
    }
  },

  // 2. When this device changes something: push it to the server
  pushToServer(key, value) {
    if (!this.serverMode || this.applyingRemote || !SYNC_KEYS.includes(key)) return;
    try {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, clientId: this.clientId, seq: ++this.seq }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  },

  // 3. When another device changes something: receive it live (SSE)
  applyRemote(key, value) {
    if (!SYNC_KEYS.includes(key)) return;
    this.applyingRemote = true;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    this.applyingRemote = false;
    this.broadcastSync(key, value);                       // other tabs on this device
    if (typeof App !== 'undefined' && App.triggerPageDataRefresh) App.triggerPageDataRefresh();
  },

  startServerStream() {
    if (!this.serverMode || this.es || typeof EventSource === 'undefined') return;
    const connect = () => {
      const es = new EventSource('/api/tracking/stream');
      this.es = es;
      es.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'STATE_UPDATED' && m.payload.clientId !== this.clientId) {
            this.applyRemote(m.payload.key, m.payload.value);
          }
        } catch (e) {}
      };
      let wasDown = false;
      es.onerror = () => { wasDown = true; };
      es.onopen = () => {
        if (!wasDown) return;
        wasDown = false;                                   // reconnected: catch up on anything missed
        fetch('/api/state').then(r => r.json()).then(d => {
          Object.keys(d.state || {}).forEach(k => this.applyRemote(k, d.state[k]));
        }).catch(() => {});
      };
    };
    connect();
  },

  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error(`Error reading ${key} from localStorage`, e);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.broadcastSync(key, value);
      this.pushToServer(key, value);
    } catch (e) {
      console.error(`Error setting ${key} in localStorage`, e);
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      this.broadcastSync(key, null);
    } catch (e) {
      console.error(`Error removing ${key} from localStorage`, e);
    }
  },

  // Cross-tab broadcast mechanism using BroadcastChannel + storage event fallback
  broadcastSync(key, data) {
    try {
      if ('BroadcastChannel' in window) {
        if (!this.bc) {
          this.bc = new BroadcastChannel('smart_store_channel');
        }
        this.bc.postMessage({ key, data, timestamp: Date.now() });
      }
    } catch (err) {
      // BroadcastChannel optional fallback
    }
  },

  // Initialize all storage on app startup
  init() {
    // Multi-device: load the shared state from the server first (if running through server.js)
    const serverState = this.skipBootstrap ? null : this.bootstrapFromServer();
    if (this.skipBootstrap) this.serverMode = this.isHttp();

    // Check towns
    if (!this.get(STORAGE_KEYS.TOWNS)) {
      this.set(STORAGE_KEYS.TOWNS, SEED_TOWNS);
    }
    // Check selected town
    if (!this.get(STORAGE_KEYS.SELECTED_TOWN)) {
      this.set(STORAGE_KEYS.SELECTED_TOWN, 'TOWN-01');
    }
    // Check users
    const existingUsers = this.get(STORAGE_KEYS.USERS);
    if (!existingUsers || existingUsers.length < SEED_USERS.length) {
      this.set(STORAGE_KEYS.USERS, SEED_USERS);
    }
    // Check products
    const existingProducts = this.get(STORAGE_KEYS.PRODUCTS);
    if (!existingProducts || existingProducts.length < SEED_PRODUCTS.length) {
      this.set(STORAGE_KEYS.PRODUCTS, SEED_PRODUCTS);
    }
    // Check orders
    if (!this.get(STORAGE_KEYS.ORDERS)) {
      this.set(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    }
    // Check store wallet
    if (!this.get(STORAGE_KEYS.STORE_WALLET)) {
      this.set(STORAGE_KEYS.STORE_WALLET, SEED_STORE_WALLET);
    }
    // Check rider wallets
    if (!this.get(STORAGE_KEYS.RIDER_WALLETS)) {
      this.set(STORAGE_KEYS.RIDER_WALLETS, SEED_RIDER_WALLETS);
    }
    // Check transactions
    if (!this.get(STORAGE_KEYS.TRANSACTIONS)) {
      this.set(STORAGE_KEYS.TRANSACTIONS, SEED_TRANSACTIONS);
    }
    // Check notifications
    if (!this.get(STORAGE_KEYS.NOTIFICATIONS)) {
      this.set(STORAGE_KEYS.NOTIFICATIONS, SEED_NOTIFICATIONS);
    }
    // Check system config (ensure commissionSlabs exist)
    const existingConfig = this.get(STORAGE_KEYS.SYSTEM_CONFIG);
    if (!existingConfig || !existingConfig.commissionSlabs) {
      this.set(STORAGE_KEYS.SYSTEM_CONFIG, DEFAULT_CONFIG);
    }
    // Check HA server
    if (!this.get(STORAGE_KEYS.HA_SERVER)) {
      this.set(STORAGE_KEYS.HA_SERVER, SEED_HA_SERVER);
    }
    // Check cart
    if (!this.get(STORAGE_KEYS.CART)) {
      this.set(STORAGE_KEYS.CART, []);
    }
    // Multi-device: first device uploads what the server is missing, then listen for live changes
    if (this.serverMode) {
      SYNC_KEYS.forEach(k => {
        if (!serverState || !(k in serverState)) {
          const v = this.get(k);
          if (v !== null) this.pushToServer(k, v);
        }
      });
      this.startServerStream();
    }
    console.log('✅ Instaa Rural Hyperlocal: Storage initialized successfully' + (this.serverMode ? ' (multi-device sync ON)' : ' (local device only)') + '.');
  },

  // Reset demo data to pristine state
  resetAll() {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    this.skipBootstrap = true;      // push fresh seeds to the server instead of pulling old shared state
    this.init();
    setTimeout(() => window.location.reload(), 600);
  }
};

// Auto-run on script load
Storage.init();
