# 777 Global Inventory - System Architecture

## 🏗️ Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        777 GLOBAL INVENTORY SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                          FRONTEND (React + TypeScript)               │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────┐  │  │
│  │  │  Dashboard         │  │  Warehouse Mgmt    │  │  Shop Mgmt   │  │  │
│  │  │  - Overview        │  │  - CRUD            │  │  - CRUD      │  │  │
│  │  │  - KPIs            │  │  - Maintenance     │  │  - Expenses  │  │  │
│  │  │  - Charts          │  │  - Analytics       │  │  - Targets   │  │  │
│  │  └────────────────────┘  └────────────────────┘  └──────────────┘  │  │
│  │                                                                      │  │
│  │  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────┐  │  │
│  │  │  Warehouse Ops     │  │  Transfers         │  │  Users       │  │  │
│  │  │  - Inventory       │  │  - Stock Movement  │  │  - Management│  │  │
│  │  │  - Stock Entry     │  │  - Location to Loc │  │  - Roles     │  │  │
│  │  │  - Containers      │  │  - History         │  │  - Permissions
│  │  └────────────────────┘  └────────────────────┘  └──────────────┘  │  │
│  │                                                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │           STATE MANAGEMENT (Zustand Store)                │   │  │
│  │  │  - Locations (Warehouses & Shops)                         │   │  │
│  │  │  - Inventory Entries                                      │   │  │
│  │  │  - Transactions (Transfers, Sales, Returns)               │   │  │
│  │  │  - Expenses (Shop & Warehouse)                            │   │  │
│  │  │  - Users & Permissions                                    │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    STATE SYNCHRONIZATION LAYER                       │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  Real-time Listeners (Firebase onSnapshot)                          │  │
│  │  - Auto-update on data changes                                      │  │
│  │  - Multi-user synchronization                                       │  │
│  │  - Conflict resolution                                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    ↓                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │              BACKEND (Firebase & Cloud Services)                     │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │          Firestore Database (Real-time Sync)               │   │  │
│  │  │                                                              │   │  │
│  │  │  Collections:                                               │   │  │
│  │  │  ├─ locations (Warehouses & Shops) ...................... T │   │  │
│  │  │  ├─ items (Product Catalog)                                │   │  │
│  │  │  ├─ brands (Manufacturer Data)                             │   │  │
│  │  │  ├─ inventory (Stock Levels per Location)                  │   │  │
│  │  │  ├─ containers (Shipments)                                 │   │  │
│  │  │  ├─ transactions (All Movement)                            │   │  │
│  │  │  ├─ sales (Point of Sale Records)                          │   │  │
│  │  │  ├─ returns (Product Returns)                              │   │  │
│  │  │  ├─ expenses (Operational Costs)                           │   │  │
│  │  │  ├─ users (Staff Management)                               │   │  │
│  │  │  └─ notifications (Alerts & Updates)                       │   │  │
│  │  │                                                              │   │  │
│  │  └──────────────────────────────────────────────────────────────┘   │  │
│  │                                                                      │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │           Firebase Authentication                            │   │  │
│  │  │  - Email/Password auth                                       │   │  │
│  │  │  - Google Sign-in                                            │   │  │
│  │  │  - Session Management                                        │   │  │
│  │  │  - Role-based Access Control                                 │   │  │
│  │  └──────────────────────────────────────────────────────────────┘   │  │
│  │                                                                      │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │           Cloud Functions (Future)                           │   │  │
│  │  │  - Automated alerts                                          │   │  │
│  │  │  - Report generation                                         │   │  │
│  │  │  - Data aggregation                                          │   │  │
│  │  └──────────────────────────────────────────────────────────────┘   │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │               DEPLOYMENT (Cloudflare Pages)                          │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  - CDN Distribution                                                 │  │
│  │  - Automatic HTTPS                                                  │  │
│  │  - GitHub Integration (Auto-deploy on push)                         │  │
│  │  - Edge Caching                                                     │  │
│  │  - Performance Optimization                                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Model Architecture

### Entity Relationships

```
                          ┌─────────────┐
                          │  LOCATIONS  │
                          │   (Type)    │
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │                         │
              ┌─────▼────┐           ┌──────▼──────┐
              │ WAREHOUSE │           │     SHOP    │
              │           │           │             │
              │ - Country │           │ - Manager   │
              │ - Currency│           │ - Sales     │
              │ - Manager │           │ - Expenses  │
              └─────┬────┘           └──────┬──────┘
                    │                       │
        ┌───────────┴───────────┬───────────┴────────────┐
        │                       │                        │
   ┌────▼───────┐    ┌──────────▼────┐    ┌────────────▼──┐
   │ INVENTORY   │    │  TRANSACTIONS │    │    EXPENSES   │
   │             │    │               │    │               │
   │ - Quantity  │    │ - Stock Entry │    │ - Amount      │
   │ - Value     │    │ - Transfer    │    │ - Category    │
   │ - Location  │    │ - Sale        │    │ - Currency    │
   │ - Item      │    │ - Return      │    │ - Date        │
   └────────────┘    └────────────────┘    └───────────────┘
        │                    │
        ├────────┬───────────┤
        │        │           │
   ┌────▼─┐ ┌───▼──┐ ┌──────▼───┐
   │ITEMS │ │BRANDS│ │CONTAINERS│
   └──────┘ └──────┘ └───────────┘
```

### Collection Structure

```
Firestore Collections:
│
├── locations
│   ├── warehouse_1
│   │   ├─ id: "wh_001"
│   │   ├─ name: "Delhi Central"
│   │   ├─ type: "warehouse"
│   │   ├─ country: "India"
│   │   ├─ currency: "INR"
│   │   ├─ manager: "John Sharma"
│   │   ├─ contact: "+91..."
│   │   └─ address: "..."
│   │
│   └── shop_1
│       ├─ id: "shop_001"
│       ├─ name: "Mumbai Outlet"
│       ├─ type: "shop"
│       ├─ country: "India"
│       ├─ currency: "INR"
│       ├─ manager: "Priya Patel"
│       ├─ contact: "+91..."
│       └─ address: "..."
│
├── inventory
│   ├── inv_wh001_item1
│   │   ├─ location_id: "wh_001"
│   │   ├─ item_id: "item_123"
│   │   ├─ quantity: 150
│   │   └─ avg_cost_INR: 1200
│   │
│   └── inv_shop001_item1
│       ├─ location_id: "shop_001"
│       ├─ item_id: "item_123"
│       ├─ quantity: 25
│       └─ avg_cost_INR: 1200
│
├── expenses
│   ├── exp_001
│   │   ├─ location_id: "wh_001"
│   │   ├─ category: "Maintenance"
│   │   ├─ amount: 5000
│   │   ├─ currency: "INR"
│   │   ├─ converted_amount_INR: 5000
│   │   ├─ date: "2024-03-15"
│   │   └─ notes: "Equipment repair"
│   │
│   └── exp_002
│       ├─ location_id: "shop_001"
│       ├─ category: "Rent"
│       ├─ amount: 50000
│       ├─ currency: "INR"
│       ├─ converted_amount_INR: 50000
│       ├─ date: "2024-03-01"
│       └─ notes: "Monthly rent"
│
├── transactions
│   ├── txn_001 (Stock Entry)
│   │   ├─ type: "stock_entry"
│   │   ├─ from_location: "supplier"
│   │   ├─ to_location: "wh_001"
│   │   ├─ item_id: "item_123"
│   │   ├─ quantity: 200
│   │   ├─ unit_cost: 1200
│   │   ├─ currency: "INR"
│   │   ├─ converted_value_INR: 240000
│   │   └─ timestamp: "2024-03-10T10:30:00Z"
│   │
│   ├── txn_002 (Transfer)
│   │   ├─ type: "transfer"
│   │   ├─ from_location: "wh_001"
│   │   ├─ to_location: "shop_001"
│   │   ├─ item_id: "item_123"
│   │   ├─ quantity: 50
│   │   ├─ unit_cost_INR: 1200
│   │   ├─ converted_value_INR: 60000
│   │   └─ timestamp: "2024-03-12T14:20:00Z"
│   │
│   └── txn_003 (Sale)
│       ├─ type: "sale"
│       ├─ item_id: "item_123"
│       ├─ location_id: "shop_001"
│       ├─ quantity: 5
│       ├─ selling_price: 3999
│       ├─ currency: "INR"
│       ├─ converted_price_INR: 19995
│       ├─ avg_cost_INR: 1200
│       ├─ profit_INR: 13995
│       └─ timestamp: "2024-03-15T16:45:00Z"
│
├── users
│   ├── user_001
│   │   ├─ id: "usr_001"
│   │   ├─ name: "John Sharma"
│   │   ├─ email: "john@777global.com"
│   │   ├─ role: "warehouse_staff"
│   │   ├─ location_id: "wh_001"
│   │   └─ status: "Active"
│   │
│   └── user_002
│       ├─ id: "usr_002"
│       ├─ name: "Priya Patel"
│       ├─ email: "priya@777global.com"
│       ├─ role: "shop_staff"
│       ├─ location_id: "shop_001"
│       └─ status: "Active"
│
└── items
    ├── item_123
    │   ├─ id: "item_123"
    │   ├─ name: "Premium Jacket"
    │   ├─ brand_id: "brand_001"
    │   ├─ category: "Apparel"
    │   ├─ sku: "ZRA-1021"
    │   ├─ min_stock_limit: 20
    │   └─ retail_price: 3999
```

---

## 🔄 Data Flow Architecture

### Warehouse Stock Entry Flow

```
Supplier Container Arrives
        ↓
   [Warehouse Page]
   - Scan/Enter Container #
   - Assign to Warehouse
        ↓
[Firebase stockEntry Transaction]
   - Add transaction record
   - Update inventory quantity
        ↓
[Real-time Listeners Trigger]
   - Sync to store
   - Update UI
        ↓
[Warehouse Analytics Update]
   - Stock value increases
   - Entry count increases
        ↓
[Notification Generated]
   - Alert warehouse staff
   - Log in notification center
```

### Shop Sales Flow

```
Customer Purchase at Shop
        ↓
   [Shops Page]
   - Scan item/SKU
   - Enter quantity
   - Enter price
        ↓
[Firebase recordSale Transaction]
   - Record sale
   - Deduct inventory
   - Calculate profit
        ↓
[Real-time Listeners Trigger]
   - Update inventory
   - Update store
   - Refresh UI
        ↓
[Analytics Update]
   - Revenue increases
   - Profit calculated
   - Progress toward target
        ↓
[Shop Management Analytics]
   - Revenue displays
   - Profit shows
   - Target progress updates
```

### Warehouse Transfer Flow

```
Need items at Shop
        ↓
   [Transfers Page]
   - Select from warehouse
   - Select destination shop
   - Choose items & qty
        ↓
[Firebase transfer Transaction]
   - Deduct from warehouse
   - Add to shop
   - Record movement
        ↓
[Real-time Listeners Trigger]
   - Update both locations
   - Sync to store
        ↓
[Analytics Update]
   - Warehouse transfers out +1
   - Shop inventory increases
```

---

## 🔐 Authentication & Authorization Flow

```
User Access Request
        ↓
   [Firebase Auth]
   - Check credentials
   - Validate token
        ↓
   [Auth Store (Zustand)]
   - Set user state
   - Fetch user role & location
        ↓
   [App.tsx ProtectedRoute]
   - Check if user exists
   - Redirect if not authenticated
        ↓
   [Layout Component]
   - Display based on role
   - Show available pages
        ↓
   [Feature-level Access]
   - Some features hidden per role
   - Buttons disabled if no permission
        ↓
   [Firebase Rules]
   - Backend validates all writes
   - Users can't bypass restrictions
```

---

## 📱 Component Architecture

### ManageWarehouses Component Tree

```
ManageWarehouses (Main)
│
├── State Management
│   ├─ activeTab: 'list' | 'maintenance' | 'performance'
│   ├─ isLocModal: boolean
│   ├─ isExpModal: boolean
│   ├─ locForm: Location form state
│   ├─ expForm: Expense form state
│   └─ saving: boolean
│
├── Header Section
│   ├─ Title & Description
│   └─ "Add Warehouse" Button
│
├── Tab Navigation
│   ├─ List Tab (Building2)
│   ├─ Maintenance Tab (Wrench)
│   └─ Performance Tab (BarChart3)
│
├── Tab Content
│   ├─ List View
│   │  ├─ Warehouse Cards Grid
│   │  │  ├─ Card (per warehouse)
│   │  │  │  ├─ Header (name, icon)
│   │  │  │  ├─ Manager info
│   │  │  │  ├─ Contact info
│   │  │  │  ├─ Address
│   │  │  │  └─ Action buttons (Edit/Delete)
│   │  │  └─ Empty state (if no warehouses)
│   │  │
│   │  Maintenance View
│   │  ├─ Header with "Log Cost" button
│   │  └─ Expenses Table
│   │     ├─ Columns: Warehouse, Category, Amount, Date, Actions
│   │     └─ Row (per expense)
│   │        ├─ Warehouse name
│   │        ├─ Category badge
│   │        ├─ Amount & conversion
│   │        ├─ Date
│   │        └─ Delete button
│   │
│   └─ Performance View
│      ├─ Analytics Cards Grid
│      │  └─ Card (per warehouse)
│      │     ├─ Stock Value (Blue)
│      │     ├─ Staff (Green)
│      │     ├─ Stock Entries (Grey)
│      │     ├─ Transfers Out (Grey)
│      │     └─ Maintenance Costs (Orange)
│      └─ Empty state (if no warehouses)
│
├── Modal: Location
│   ├─ Title: Add/Edit Warehouse
│   ├─ Form:
│   │  ├─ Warehouse Name (required)
│   │  ├─ Country (required)
│   │  ├─ Currency (required)
│   │  ├─ Manager (optional)
│   │  ├─ Contact (optional)
│   │  ├─ Address (optional)
│   │  └─ Buttons: Cancel, Add/Update
│   └─ onClose handler
│
├── Modal: Expense
│   ├─ Title: Log Maintenance Cost
│   ├─ Form:
│   │  ├─ Warehouse (required)
│   │  ├─ Category (required)
│   │  ├─ Date (required)
│   │  ├─ Amount (required)
│   │  ├─ Currency
│   │  ├─ Notes (optional)
│   │  └─ Button: Record Cost
│   └─ onClose handler
│
└── Data Connections
   ├─ useStore hooks
   │  ├─ locations (warehouses)
   │  ├─ expenses
   │  ├─ transactions
   │  ├─ users
   │  └─ actions (CRUD)
   └─ Firestore listeners
      ├─ Real-time updates
      └─ Auto-sync
```

---

## 🚀 Deployment Pipeline

```
Developer
    ↓
git push to GitHub
    ↓
GitHub Webhook
    ↓
Cloudflare Pages Build
    ├─ npm install
    ├─ npm run build
    │  ├─ tsc (TypeScript check)
    │  └─ vite build (production bundle)
    ├─ Run tests (optional)
    └─ Deploy to CDN
        ↓
        Production URL
        https://[project].pages.dev/
```

---

## 📈 Scalability Considerations

### Horizontal Scaling
- **Warehouses**: Unlimited (scale with Firestore)
- **Shops**: Unlimited (scale with Firestore)
- **Users**: Unlimited (Firebase Auth)
- **Transactions**: Real-time sync up to 1M+ records

### Vertical Scaling
- **Firestore Indexes**: Auto-created for queries
- **Real-time Listeners**: Efficient subscription model
- **Client-side Caching**: Zustand store optimization
- **CDN Distribution**: Cloudflare edge caching

### Performance Optimization
- Code splitting with dynamic imports (ready)
- Image optimization (handled by Cloudflare)
- Bundle size monitoring (1.2MB gzipped)
- Real-time sync batching (automatic)

---

## 🔐 Security Architecture

```
Client (Browser)
    ↓
HTTPS/TLS Encryption (Cloudflare)
    ↓
Firebase Authentication
    ├─ Email/Password
    ├─ Google OAuth
    └─ JWT Token Validation
    ↓
Firestore Security Rules
    ├─ User Authentication Check
    ├─ Document-level Access Control
    ├─ Role-based Restrictions
    └─ Data Validation
    ↓
Data at Rest Encryption (Firebase Default)
```

---

**Document Version**: 1.0  
**Last Updated**: March 2026  
**Architecture Status**: Production Ready ✅
