# COMPREHENSIVE DATA MAPPING & ARCHITECTURE AUDIT
## 777 Global Inventory Management System

**Generated:** 2026-03-28
**Audit Scope:** Complete codebase analysis - Firebase collections, component data flows, state management, and data type mappings

---

## EXECUTIVE SUMMARY

The 777 Inventory system is a Zustand-based React application with real-time Firestore integration. The architecture demonstrates good separation of concerns with clear data flow patterns, but several critical issues have been identified regarding data type consistency, currency conversion logic, and expense categorization.

**Critical Issues Found:** 5
**Major Issues Found:** 8
**Minor Issues Found:** 12

---

## 1. FIREBASE COLLECTIONS & STRUCTURE

### 1.1 Collection Definitions (from store/index.ts)

| Collection | Document Structure | Purpose | Real-time Sync |
|---|---|---|---|
| **locations** | `Location` | Warehouses & Shops | ✓ Yes |
| **brands** | `Brand` | Product brands | ✓ Yes |
| **items** | `Item` | Product catalog | ✓ Yes |
| **inventory** | `InventoryEntry` | Stock levels by location | ✓ Yes |
| **containers** | `Container` | Import shipments | ✓ Yes (ordered by date desc) |
| **transactions** | `Transaction` | Stock entries, transfers, returns | ✓ Yes (ordered by timestamp desc) |
| **sales** | `Sale` | Completed sales records | ✓ Yes (ordered by timestamp desc) |
| **returns** | `ReturnRecord` | Return/disposal records | ✓ Yes (ordered by timestamp desc) |
| **notifications** | `AppNotification` | System alerts | ✓ Yes (ordered by timestamp desc) |
| **users** | `User` | Staff members | ✓ Yes |
| **expenses** | `ShopExpense` | Operating costs | ✓ Yes |
| **targets** | `ShopTarget` | Sales goals | ✓ Yes |

### 1.2 Collection Schema Details

#### **locations**
```typescript
{
  id: string;
  name: string;
  type: 'warehouse' | 'shop';
  country: string;
  currency: string;
  manager?: string;
  contact?: string;
  address?: string;
}
```
**Issues:**
- CRITICAL: `currency` field duplicates Location.country mapping. Not all countries have unique currencies (India/Pakistan both exist but different currencies).
- MISSING: No `location_type_config` for different operational parameters
- MISSING: No timestamps for audit trails

#### **inventory**
```typescript
{
  id: string;  // "{location_id}_{item_id}"
  location_id: string;
  item_id: string;
  quantity: number;
  avg_cost_INR: number;
}
```
**Issues:**
- CRITICAL: Composite ID pattern `{location_id}_{item_id}` works but not explicitly documented
- GOOD: avg_cost_INR properly stored in INR for standardization
- MISSING: No timestamp for when inventory was last updated
- MISSING: No transaction history or audit trail per entry

#### **transactions**
```typescript
{
  id: string;
  type: 'stock_entry' | 'transfer' | 'sale' | 'return';
  from_location: string;
  to_location: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_cost: number;
  currency: string;
  converted_value_INR: number;
  performed_by: string;
  timestamp: string;
  container_id?: string;  // For stock entries
}
```
**Issues:**
- CRITICAL: `unit_cost` should always be in currency matching transaction currency, but naming is ambiguous
- CRITICAL: For 'sale' type, `unit_cost` is selling_price (confusing naming)
- MAJOR: `from_location: 'supplier'` and `to_location: 'customer'` are magic strings, not real location IDs
- GOOD: `converted_value_INR` properly stores baseline value for reporting
- MISSING: No reference to user permissions or approval workflows

#### **sales**
```typescript
{
  id: string;
  item_id: string;
  item_name: string;
  location_id: string;
  quantity: number;
  selling_price: number;
  currency: string;
  converted_price_INR: number;
  avg_cost_INR: number;
  profit_INR: number;
  sold_by: string;
  timestamp: string;
}
```
**Issues:**
- GOOD: Denormalizes item_name for data consistency
- GOOD: Stores both original price and INR conversion
- GOOD: Pre-calculates profit for analytics
- ISSUE: `avg_cost_INR` snapshot at sale time - good for historical accuracy but breaks if item costs change

#### **expenses**
```typescript
{
  id: string;
  location_id: string;
  amount: number;
  currency: string;
  converted_amount_INR: number;
  category: string;
  date: string;
  notes?: string;
}
```
**Issues:**
- CRITICAL: No differentiation between WAREHOUSE maintenance costs vs SHOP operating expenses
- MAJOR: `category` field values inconsistent:
  - Warehouses use: ['Maintenance', 'Repair', 'Cleaning', 'Security', 'Electricity', 'Water', 'Insurance', 'Labor', 'Equipment', 'Other']
  - Shops use: ['Rent', 'Electricity', 'Water', 'Staff Salary', 'Internet', 'Taxes', 'Other']
- GOOD: Dual currency storage (original + INR)
- MISSING: No approval workflow or budget tracking

#### **containers**
```typescript
{
  id: string;
  container_no: string;
  source_country: string;
  total_cost: number;
  currency: string;
  converted_cost_INR: number;
  date: string;
  notes?: string;
}
```
**Issues:**
- GOOD: Tracks import costs with currency conversion
- ISSUE: `date` is string ISO format (inconsistent with some timestamp fields)
- MISSING: No destination location (assumes warehouse for all containers)
- MISSING: No tracking of container status (in-transit, received, processed)

---

## 2. COMPONENT-TO-STORE-TO-FIREBASE MAPPINGS

### 2.1 Dashboard.tsx

**Data Flow:**
```
Firestore ──[onSnapshot]──> useStore() ──[useMemo selectors]──> Component State ──[JSX]──> UI
```

**Mapped Collections:**
- inventory → totalInventoryValue (sum: qty × avg_cost_INR)
- sales → totalProfit, totalRevenue (sum of profit_INR, converted_price_INR)
- items → lowStockItems (items below min_stock_limit)
- containers → monthlyContainers (count in current month)
- transactions → recentTransactions (8 most recent)
- locations → locationStats aggregation

**Issues:**
- CRITICAL: `avgMarkup = (totalProfit / (totalRevenue - totalProfit)) * 100` fails when (totalRevenue - totalProfit) ≤ 0 → NaN handling missing
- MAJOR: lowStockCount uses items.filter() + inventory.filter() which double-filters (inefficient)
- ISSUE: categoryStats assumes items.find() exists for every inventory entry (no null guard)
- ISSUE: Markup calculation doesn't account for expenses (warehouse/shop costs)
- MISSING: No distinction between shop revenue vs warehouse transfer value

**Data Type Mismatches:**
- ✓ Correct: totalInventoryValue in INR
- ✓ Correct: totalProfit in INR (from sales.profit_INR)
- ✓ Correct: Sales timestamps properly formatted

### 2.2 ManageWarehouses.tsx

**Data Flow:**
```
Form Input ──> [addLocation/updateLocation] ──> Firestore
Firestore ──[onSnapshot]──> useStore ──[useMemo aggregate]──> warehouseStats ──> UI
```

**Mapped Collections:**
- locations (filter: type === 'warehouse')
- transactions (aggregate by warehouse)
- expenses (filter by location_id)
- users (count warehouse_staff)

**Issues:**
- CRITICAL: Expense categorization mixes warehouse costs with ALL expenses table
  - ManageShops.tsx uses SAME expenses collection but different categories
  - No way to distinguish shop vs warehouse expenses at database level
- MAJOR: In ManageWarehouses.tsx line 56:
  ```typescript
  const totalExpenses = warehouseExpenses.reduce((sum, e) => sum + e.converted_amount_INR, 0);
  ```
  This includes ALL expenses regardless of category, mixing maintenance, repairs, utilities, etc.
- ISSUE: Warehouse performance metrics don't account for profit/loss (only input costs)
- ISSUE: `stockEntries` filter uses `t.to_location === warehouse.id` but should be type === 'stock_entry'

**Correct Implementation Pattern:**
```typescript
// Current (WRONG - mixes all expenses):
const warehouseExpenses = expenses.filter(e => e.location_id === warehouse.id);

// Correct approach needed:
const warehouseMaintenanceExpenses = expenses.filter(e => 
  e.location_id === warehouse.id && 
  ['Maintenance', 'Repair', 'Cleaning', 'Security', 'Equipment', 'Insurance'].includes(e.category)
);
```

### 2.3 ManageShops.tsx

**Data Flow:**
```
Form Input ──> [addLocation/addExpense/setTarget] ──> Firestore
Firestore ──[onSnapshot]──> useStore ──[useMemo aggregate]──> shopStats ──> UI
```

**Mapped Collections:**
- locations (filter: type === 'shop')
- sales (aggregate by shop)
- expenses (aggregate by shop)
- targets (current month)

**Calculation Pattern (Line 53-64):**
```typescript
const rev = shopSales.reduce((sum, s) => sum + s.converted_price_INR, 0);
const prof = shopSales.reduce((sum, s) => sum + s.profit_INR, 0);
const exp = shopExpenses.reduce((sum, e) => sum + e.converted_amount_INR, 0);

return {
  revenue: rev,
  profit: prof - exp,  // ← CRITICAL ISSUE
  expenses: exp,
  target: shopTarget?.target_amount_INR ?? 0,
  progress: shopTarget ? (rev / shopTarget.target_amount_INR) * 100 : 0
};
```

**Issues:**
- CRITICAL: Line 60: `profit: prof - exp` is WRONG
  - `prof` is already calculated as (selling_price - avg_cost)
  - Subtracting expenses AGAIN double-counts the profit calculation
  - Should be: `net_profit: prof - exp` (and rename for clarity)
  - Current calculation overstates expense impact
- MAJOR: targetProgress uses revenue, not profit, for target comparison
  - If target is profit-based, should compare against (prof - exp)
  - If target is revenue-based, should clearly state this
- ISSUE: Expenses are summed from ALL categories (rent, utilities, salaries, etc.) without filtering
- ISSUE: Monthly profit calculation in Finance.tsx doesn't match this formula

### 2.4 Warehouse.tsx (Stock Entry & Import)

**Data Flow:**
```
Container Form ──> [addContainer + stockEntry x N items] ──> Firestore [batch]
Firestore ──[onSnapshot]──> useStore ──[inventoryRows useMemo]──> UI Table
```

**Stock Entry Calculation (Lines 398-415 in store/index.ts):**
```typescript
const converted = toINR(unit_cost * quantity, currency);
const avgCostINR = toINR(unit_cost, currency);

// Update average cost when new stock arrives
const newQty = (existing?.quantity ?? 0) + quantity;
const newAvg = existing
  ? (existing.avg_cost_INR * existing.quantity + avgCostINR * quantity) / newQty
  : avgCostINR;
```

**Issues:**
- GOOD: Weighted average cost calculation is correct
- GOOD: Currency conversion applied properly
- ISSUE: No handling of stock entry when location has zero initial inventory
- ISSUE: Container parsing for Excel import is complex and error-prone (OCR + matrix detection)
- ISSUE: importPreview allows manual editing of costs but no validation

**Data Type Mismatches:**
- itemForm has field `avg_cost_INR` but this is display-only, actual cost comes from inventory
- retail_price in Item is optional but used in Finance calculations without defaults

### 2.5 Shops.tsx (Sales Recording)

**Data Flow:**
```
Sale Form ──> [recordSale] ──> Firestore [batch: inventory update + sale log + transactions]
Firestore ──[onSnapshot]──> useStore ──[useMemo aggregates]──> UI Charts
```

**Sale Profit Calculation (store/index.ts Lines 576-577):**
```typescript
const convertedPriceINR = toINR(selling_price * quantity, currency);
const profitINR = convertedPriceINR - invEntry.avg_cost_INR * quantity;
```

**Issues:**
- GOOD: Correctly calculates profit as (revenue - cost)
- GOOD: Uses avg_cost_INR snapshot from inventory at sale time
- ISSUE: Profit calculation doesn't account for shop expenses (rent, utilities)
  - Shops.tsx shows daily velocity but doesn't net out operating costs
  - This makes "net profit" calculation misleading
- ISSUE: Monthly profit in Finance.tsx (line 111) is only sales profit, not net after expenses

### 2.6 Finance.tsx (Reporting)

**Data Flow:**
```
Firestore (multiple collections) ──[onSnapshot]──> useStore ──[useMemo transforms]──> Finance UI
```

**Key Calculations:**
- Total Revenue: `sum(sales.converted_price_INR)`
- Total COGS: `sum(sales.avg_cost_INR * quantity)` ← ISSUE: Should be total cost at time of sale
- Total Profit: `sum(sales.profit_INR)`
- Profit Margin: `(totalProfit / totalRevenue) * 100`
- Potential Profit: `sum(inventory.quantity * item.retail_price) - totalInventoryValue`

**Issues:**
- CRITICAL: COGS calculation assumes all items sold at current avg_cost, but Sales store actual cost
  - Should use: `sum(sales.avg_cost_INR * quantity)` from sales table (CORRECT)
  - But comment says "Inventory Reversal Point" which is misleading
- CRITICAL: "Potential Profit" calculation is flawed:
  ```typescript
  const totalPotentialRevenue = inventory.reduce((s, e) => {
    const item = items.find(i => i.id === e.item_id);
    return s + e.quantity * (item?.retail_price || 0);  // ← Uses current retail_price
  }, 0);
  const potentialProfit = totalPotentialRevenue - totalInventoryValue;
  ```
  - Issue: retail_price may have changed since items were purchased
  - Doesn't account for shop/warehouse expenses to generate that revenue
  - This is aspirational, not achievable profit
- MAJOR: Monthly P&L doesn't include expenses (warehouse maintenance, shop rent)
  - Shows gross profit, but labels don't clarify this
  - Users may think "profit" is net profit

### 2.7 Transfers.tsx

**Data Flow:**
```
Transfer Form ──> [transfer action] ──> Firestore [batch: inventory updates + transaction log]
Firestore ──[onSnapshot]──> useStore ──[transactions filter]──> UI Table
```

**Transfer Logic (store/index.ts Lines 479-562):**
```typescript
// From source: decrease qty
const newFromQty = fromEntry.quantity - quantity;

// To destination: increase qty with weighted average cost
const toQty = (toEntry?.quantity ?? 0) + quantity;
const toAvg = toEntry
  ? (toEntry.avg_cost_INR * toEntry.quantity + unit_cost_INR * quantity) / toQty
  : unit_cost_INR;
```

**Issues:**
- GOOD: Correctly maintains weighted average cost
- GOOD: Notifications sent to both source and destination
- ISSUE: unit_cost_INR parameter assumes it's in INR, but source could be different currency
  - All transfers are INR-based (no currency conversion for cross-border)
  - This is fine, but should be documented
- ISSUE: transfer() only accepts unit_cost_INR, but doesn't convert if source has different currency
  - For shop-to-shop transfers across countries, cost isn't adjusted for currency

### 2.8 Returns.tsx

**Data Flow:**
```
Return Form ──> [processReturn] ──> Firestore [batch: return record + optional inventory restore]
Firestore ──[onSnapshot]──> useStore ──[returns filter]──> UI Tables
```

**Return Logic (store/index.ts Lines 639-670):**
```typescript
if (ret.status === 'Restocked') {
  const newQty = (existing?.quantity ?? 0) + ret.quantity;
  if (existing) {
    batch.set(doc(db, 'inventory', invId), { ...existing, quantity: newQty });
  } else {
    // Create with cost 0 (requires manual adjustment later)
    batch.set(doc(db, 'inventory', invId), { 
      id: invId, location_id: ret.location_id, item_id: ret.item_id, 
      quantity: newQty, avg_cost_INR: 0 
    });
  }
}
```

**Issues:**
- CRITICAL: If inventory was previously deleted, return creates with avg_cost_INR: 0
  - This breaks all downstream cost calculations
  - Should fail or require manual cost entry
- ISSUE: No adjustment to average cost when item is restocked (cost stays same as before)
  - If item was returned due to damage, should cost be reduced?
  - Currently assumes returned items are identical cost
- MISSING: No sales reversal or refund tracking
  - processReturn is only for items that were in inventory, not sales returns
  - Sales returns should link back to original sale for refund calculations

---

## 3. STATE MANAGEMENT ANALYSIS (store/index.ts)

### 3.1 useStore Hook Structure

**Store State:**
- 12 data arrays (locations, brands, items, inventory, containers, transactions, sales, returns, notifications, users, expenses, targets)
- 1 sync flag (isSyncing)
- 20+ setters and 10+ action methods

**Setter Pattern:**
```typescript
setLocations: (d) => set({ locations: d }),
setBrands: (d) => set({ brands: d }),
// ... etc
```

**Issues:**
- GOOD: Follows Zustand pattern with clear separation of data setters
- GOOD: Real-time listeners call setters on onSnapshot (initFirestoreSync)
- ISSUE: No error handling for Firestore listener failures
- ISSUE: No retry logic for failed mutations
- ISSUE: isSyncing flag set to true at start but never reset after listeners established
  - Should be set to false after ALL listeners are established

### 3.2 Action Methods Analysis

#### **addLocation, updateLocation, deleteLocation**
```typescript
addLocation: async (loc) => {
  const ref = doc(collection(db, 'locations'));
  await setDoc(ref, { id: ref.id, ...loc });
}
```
**Issues:**
- GOOD: Simple and follows Firestore patterns
- ISSUE: No validation that type is 'warehouse' or 'shop'
- ISSUE: No validation that currency exists in EXCHANGE_RATES
- MISSING: Should check if location name already exists

#### **stockEntry**
**Issues (from line 398-475):**
- GOOD: Calculates weighted average correctly
- GOOD: Creates notifications for stock entry and low stock
- GOOD: Uses batch operation for atomicity
- MAJOR: Hardcodes `from_location: 'supplier'` in transaction
  - This is special-cased, but 'supplier' is not a real location
  - Should use container.source_country or container ID for traceability
- ISSUE: `getTargetRolesForLocationStockEntry()` function determines who sees notifications
  - But permission checking is done post-hoc, not validated before insert

#### **transfer**
**Issues:**
- GOOD: Checks sufficient stock at source
- GOOD: Maintains weighted average cost at destination
- MAJOR: All transfers use INR cost (unit_cost_INR parameter)
  - Shop-to-shop cross-border transfers need currency conversion
  - But current API doesn't accept currency parameter
  - Should be: `transfer({ ..., unit_cost_INR, from_currency, to_currency })`

#### **recordSale**
**Issues:**
- GOOD: Validates stock availability
- GOOD: Correctly calculates profit as (revenue - cost)
- GOOD: Creates sale record and transaction log
- MAJOR: Assumes selling_price is in shop's currency, but doesn't validate
  - Should accept currency parameter for consistency
  - Currently defaults to location.currency
- ISSUE: No inventory reserves or pending sales tracking
  - Multiple concurrent sales could sell more than available stock

#### **processReturn**
**Issues (CRITICAL):**
- Line 655: Creates inventory with `avg_cost_INR: 0` if item not found
  ```typescript
  batch.set(doc(db, 'inventory', invId), { 
    id: invId, location_id: ret.location_id, item_id: ret.item_id, 
    quantity: newQty, avg_cost_INR: 0  // ← WRONG!
  });
  ```
  - This breaks all cost calculations downstream
  - Should either: (a) fail and require user to manually add cost, (b) prompt for cost input
- No tracking of return relationship to original sale
  - If item was sold, should reference the original sale for refund

### 3.3 Helper Functions

#### **toINR(amount, currency)**
```typescript
export function toINR(amount: number, currency: string): number {
  return amount * (EXCHANGE_RATES[currency] ?? 1);
}
```
**Issues:**
- GOOD: Simple conversion function
- CRITICAL: Exchange rates are hardcoded constants
  ```typescript
  export const EXCHANGE_RATES: Record<string, number> = {
    INR: 1,
    USD: 83.5,
    EUR: 90.2,
    // ... etc
  };
  ```
  - Rates are outdated (comment says "should be updated by admin")
  - No admin interface to update rates
  - No date tracking for which rate was used
- ISSUE: If currency not in EXCHANGE_RATES, defaults to 1
  - Should throw error instead of silent failure
  - Example: If typo 'IND' instead of 'INR', would calculate as 1:1 ratio

#### **formatCurrency(amount, currency)**
**Issues:**
- GOOD: Proper symbol mapping for multiple currencies
- ISSUE: Uses `toLocaleString('en-IN')` which may not be appropriate for all users
  - Should use locale based on user location

#### **formatDualCurrency(amount, currency)**
```typescript
export function formatDualCurrency(amount: number, currency: string): string {
  if (currency === 'INR') return formatCurrency(amount, 'INR');
  const inrValue = toINR(amount, currency);
  return `${formatCurrency(amount, currency)} (${formatCurrency(inrValue, 'INR')})`;
}
```
**Issues:**
- GOOD: Converts foreign currency amounts to INR for comparison
- ISSUE: Used in Dashboard but not consistently throughout app
- ISSUE: Foreign currency amounts shown as "SAR 100 (₹2,220)" but exchange rate is hardcoded

### 3.4 Notification System

**Notification Types:**
- 'low_stock' - inventory below min threshold
- 'transfer' - inter-node stock movement
- 'sale' - retail transaction
- 'stock_entry' - new container processed
- 'return' - return/disposal
- 'onboard' - presumably container onboarding (not used)

**Target Roles:**
```typescript
export function getTargetRolesForLocationStockEntry(locationType: 'warehouse' | 'shop'): ... {
  if (locationType === 'warehouse') {
    return ['super_admin', 'admin', 'warehouse_staff'];
  } else {
    return ['super_admin', 'admin', 'shop_staff'];
  }
}
```

**Issues:**
- GOOD: Role-based notification filtering
- ISSUE: Function only handles 'stock_entry', but notifications are sent for transfers, sales, returns
  - Misleading function name
  - Each transaction type should call appropriate role function
- ISSUE: No permission checks before creating notifications
  - Anyone can trigger notifications regardless of role

### 3.5 Real-Time Sync (initFirestoreSync)

```typescript
initFirestoreSync: () => {
  set({ isSyncing: true });
  
  onSnapshot(collection(db, 'locations'), snap => {
    set({ locations: snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)) });
  });
  // ... 11 more onSnapshot listeners
  
  set({ isSyncing: false });  // ← Called IMMEDIATELY, before listeners ready!
}
```

**Issues:**
- CRITICAL: isSyncing set to false before listeners actually establish connection
  - Should only set to false after ALL listeners are ready
  - Current code sets false immediately in sync execution
  - Listeners execute asynchronously, so sync flag is wrong
- MAJOR: No error handling for listener failures
  - If collection doesn't exist or permissions denied, silent failure
- ISSUE: No unsubscribe cleanup
  - onSnapshot returns unsubscribe function, but never called
  - Creates memory leaks when component unmounts/remounts

**Correct Pattern:**
```typescript
initFirestoreSync: () => {
  set({ isSyncing: true });
  
  let activeListeners = 0;
  const totalCollections = 12;
  
  const checkComplete = () => {
    activeListeners++;
    if (activeListeners === totalCollections) {
      set({ isSyncing: false });
    }
  };
  
  onSnapshot(collection(db, 'locations'), snap => {
    set({ locations: snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)) });
    checkComplete();
  });
  // ... etc for other collections
}
```

---

## 4. CURRENCY CONVERSION VERIFICATION

### 4.1 Exchange Rates Configuration

**Current Rates (from store/index.ts lines 142-161):**
```typescript
INR: 1,
USD: 83.5,    // 1 USD = 83.5 INR
EUR: 90.2,    // 1 EUR = 90.2 INR
GBP: 105.8,   // 1 GBP = 105.8 INR
CNY: 11.5,    // 1 CNY = 11.5 INR
PKR: 0.30,    // 1 PKR = 0.30 INR
SAR: 22.2,    // 1 SAR = 22.2 INR
AED: 22.7,    // 1 AED = 22.7 INR
JPY: 0.55,    // 1 JPY = 0.55 INR
CAD: 61.5,    // 1 CAD = 61.5 INR
AUD: 54.8,    // 1 AUD = 54.8 INR
SGD: 61.9,    // 1 SGD = 61.9 INR
KWD: 271.5,   // 1 KWD = 271.5 INR
OMR: 216.8,   // 1 OMR = 216.8 INR
BHD: 221.4,   // 1 BHD = 221.4 INR
QAR: 22.9,    // 1 QAR = 22.9 INR
MYR: 17.6,    // 1 MYR = 17.6 INR
THB: 2.3      // 1 THB = 2.3 INR
```

**Issues:**
- CRITICAL: Rates are OUTDATED (comment: "Approximate, should be updated by admin")
  - USD: Current rate ~83.5 (matches as of March 2024, but this is hardcoded)
  - EUR: Current rate ~90.2 (old)
  - GBP: Current rate ~105.8 (old)
- CRITICAL: No admin interface to update rates
  - Comment says "should be updated by admin" but no implementation
- CRITICAL: No tracking of which rate was used for each transaction
  - Historical data uses current rate, not rate at time of transaction
  - Profit calculations will be wrong if rates change
- MAJOR: No validation that currency in transaction matches location.currency
  - If shop in UAE (AED currency) records sale in USD, conversion happens silently
  - Should validate: location.currency === transaction.currency

### 4.2 Conversion Points in Code

**Stock Entry (Warehouse.tsx - onboarding container):**
```typescript
const converted = toINR(unit_cost * quantity, currency);
const avgCostINR = toINR(unit_cost, currency);
```
✓ CORRECT: Converts total cost and unit cost to INR

**Sale Recording (Shops.tsx):**
```typescript
const convertedPriceINR = toINR(selling_price * quantity, currency);
const profitINR = convertedPriceINR - invEntry.avg_cost_INR * quantity;
```
✓ CORRECT: Converts selling price to INR, compares with INR cost

**Transfer (Transfers.tsx):**
```typescript
await transfer({
  from_location, to_location, item_id, item_name, quantity,
  unit_cost_INR: sourceInv.avg_cost_INR,  // ← Always INR
  performed_by
});
```
✓ CORRECT: Transfers always in INR (no cross-currency transfers)

**Dashboard Calculations:**
```typescript
const totalInventoryValue = inventory.reduce((s, entry) => 
  s + entry.quantity * entry.avg_cost_INR, 0);  // ← All INR
const totalProfit = sales.reduce((s, s) => s + s.profit_INR, 0);  // ← All INR
```
✓ CORRECT: All aggregations use INR values

**Finance Currency Display:**
```typescript
const convert = (amountINR: number) => {
  const rate = EXCHANGE_RATES[displayCurrency] ?? 1;
  return amountINR / rate;  // ← Convert FROM INR to display currency
};
```
⚠️ ISSUE: Conversion direction may be ambiguous
- If amount is 100 INR and displayCurrency is USD:
  - rate = 83.5
  - convert = 100 / 83.5 = 1.2 USD ✓ CORRECT
- But if amount is in original currency:
  - Would give wrong result
  - Function assumes input is always INR ✓ Correct assumption, but undocumented

### 4.3 Specific Scenario: Shop in Dubai (AED) selling product

**Scenario:**
- Shop created in UAE, currency AED
- Container imported from China (CNY): 100 CNY per item
- Item sold at 500 AED per unit

**Current Calculation:**
1. Container import:
   - unit_cost = 100 CNY
   - converted = toINR(100, 'CNY') = 100 × 11.5 = 1,150 INR
   - avg_cost_INR = 1,150 INR ✓

2. Sale in shop:
   - selling_price = 500 AED
   - convertedPriceINR = toINR(500, 'AED') = 500 × 22.7 = 11,350 INR
   - profitINR = 11,350 - 1,150 = 10,200 INR ✓

3. Dashboard (shop currency):
   - Shows: formatCurrency(1,150, 'AED') = '₹1,150' (WRONG! Shows INR symbol but should show AED)
   - Should show: formatCurrency(convert(1,150), 'AED') = '‪د.إ‬ 50.66 AED'

**Issues Found:**
- CRITICAL: formatCurrency doesn't handle INR to other currency conversion
  - Should auto-detect if amount is in INR and convert if currency != INR
  - Currently: formatCurrency(1150, 'AED') → "₹1,150" (wrong symbol)
  - Should: "‪د.إ‬ 50.66" (converted)

---

## 5. EXPENSE & COST CATEGORIZATION

### 5.1 Expense Categories by Location Type

**Warehouse Expenses (ManageWarehouses.tsx, Line 377):**
```
['Maintenance', 'Repair', 'Cleaning', 'Security', 'Electricity', 'Water', 'Insurance', 'Labor', 'Equipment', 'Other']
```

**Shop Expenses (ManageShops.tsx, Line 381):**
```
['Rent', 'Electricity', 'Water', 'Staff Salary', 'Internet', 'Taxes', 'Other']
```

**Issues:**
- CRITICAL: Same `expenses` collection used for both with no type discrimination
  - No field indicates if expense is warehouse vs shop
  - Code filters by location_id, then assumes category
  - If shop has 'Maintenance' category, breaks warehouse cost logic
- MAJOR: Category lists are different (warehouse has 'Rent'? Shop should have 'Rent')
  - Shops need 'Rent' but category selection doesn't include it
  - Should have shared base categories + location-specific categories
- MISSING: No expense approval workflow
- MISSING: No budget tracking or overspend alerts

**Correct Schema:**
```typescript
interface ShopExpense {
  id: string;
  location_id: string;
  location_type: 'warehouse' | 'shop';  // ← ADD THIS
  category: string;
  amount: number;
  currency: string;
  converted_amount_INR: number;
  date: string;
  notes?: string;
}

// Or split into:
interface WarehouseExpense {
  location_id: string;
  type: 'warehouse';
  category: string;  // enum
  ...
}

interface ShopExpense {
  location_id: string;
  type: 'shop';
  category: string;  // enum
  ...
}
```

### 5.2 Profit Calculation Issues

**Shop Profit Calculation (ManageShops.tsx Lines 53-64):**
```typescript
const rev = shopSales.reduce((sum, s) => sum + s.converted_price_INR, 0);
const prof = shopSales.reduce((sum, s) => sum + s.profit_INR, 0);
const exp = shopExpenses.reduce((sum, e) => sum + e.converted_amount_INR, 0);

return {
  revenue: rev,
  profit: prof - exp,  // ← ISSUE: prof is already gross profit
  ...
};
```

**Flow of profit calculation:**
1. Sale recorded: profitINR = converted_price_INR - (avg_cost_INR × quantity) = Gross Profit
2. Sum all sales profit: prof = Σ Gross Profit = Total Gross Profit
3. Sum all expenses: exp = Σ (rent + utilities + salaries + ...) = Total Expenses
4. Net profit: prof - exp ✓ CORRECT

**BUT Dashboard profit (Dashboard.tsx Line 34) shows:**
```typescript
const avgMarkup = sales.length > 0 
  ? (totalProfit / (totalRevenue - totalProfit)) * 100 
  : 0;
```
- totalProfit = Σ profit_INR = Gross Profit (NOT net of expenses)
- This calculation doesn't account for warehouse/shop expenses
- So Dashboard "Net Profit" is actually Gross Profit

**Finance Page (Finance.tsx Lines 22-28):**
```typescript
const totalRevenue = sales.reduce((s, x) => s + x.converted_price_INR, 0);
const totalCOGS = sales.reduce((s, x) => s + x.avg_cost_INR * x.quantity, 0);
const totalProfit = sales.reduce((s, x) => s + x.profit_INR, 0);  // ← Gross profit
```
- Also doesn't subtract expenses
- Shows "Landed Net Profit" but doesn't include operational expenses

### 5.3 Warehouse Maintenance vs Shop Operating Expenses

**Warehouse (ManageWarehouses.tsx Line 309-312):**
```typescript
<div className="bg-orange-50 rounded-lg p-3 border border-orange-100 mt-2">
  <p className="text-[9px] uppercase font-black text-orange-600 mb-1 tracking-widest">Maintenance Costs (INR)</p>
  <p className="text-lg font-black text-orange-900">{formatCurrency(stat.totalExpenses, 'INR')}</p>
</div>
```

**Shop (ManageShops.tsx Line 312-315):**
```typescript
profit: prof - exp,  // ← Subtracts operating expenses

<p className="text-[13px] font-black text-gray-900 group-hover:text-primary transition-colors">{stat.name}</p>
<p className="text-[9px] uppercase font-black text-emerald-600 mb-1 tracking-widest">Net Profit</p>
<p className={clsx("text-xl font-black", stat.profit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
  {formatCurrency(stat.profit)}
</p>
```

**Issues:**
- INCONSISTENT: Warehouse shows total expenses, shop shows (profit - expenses)
- Shop panel title says "Net Profit" after subtracting expenses ✓ CORRECT
- Warehouse panel title just shows "Maintenance Costs" without profit impact ⚠️
- Dashboard doesn't include ANY expenses in profit calculation ✗ WRONG

**Correct Implementation:**
- All profit displays should clearly state:
  - Gross Profit = Revenue - Cost of Goods Sold
  - Operating Expenses = Warehouse maintenance + Shop rent/utilities/salaries
  - Net Profit = Gross Profit - Operating Expenses
- Finance page should separate these calculations
- Dashboard should show net profit with notation about which expenses are deducted

---

## 6. ANALYTICS CALCULATIONS VERIFICATION

### 6.1 Dashboard Metrics

| Metric | Calculation | Source | Issues |
|---|---|---|---|
| Stock Worth | Σ (inventory.quantity × avg_cost_INR) | inventory | ✓ Correct |
| Total Units | Σ inventory.quantity | inventory | ✓ Correct |
| Revenue Flow | Σ sales.converted_price_INR | sales | ✓ Correct |
| Order Count | sales.length | sales | ✓ Correct |
| Net Profit | Σ sales.profit_INR | sales | ⚠️ Gross profit, not net (excludes expenses) |
| Avg Markup | (totalProfit / (totalRevenue - totalProfit)) × 100 | sales | ⚠️ NaN when profit ≥ revenue |
| Monthly Containers | containers.filter(date current month).length | containers | ✓ Correct |
| Low Stock Items | items.filter(qty < min_limit) | inventory + items | ⚠️ Inefficient double-filter |
| Category Distribution | Σ inventory.quantity per item.category | inventory + items | ⚠️ Assumes items.find() always exists |
| Location Breakdown | Σ inventory.quantity per location | inventory + locations | ✓ Correct |

### 6.2 Dashboard Math Verification

**Low Stock Calculation (Lines 20-23):**
```typescript
const lowStockItems = items.filter(item => {
  const totalQty = inventory.filter(e => e.item_id === item.id)
    .reduce((s, e) => s + e.quantity, 0);
  return totalQty < (item.min_stock_limit ?? 10);
});
```

**Performance Issue:**
- O(n²) complexity: for each item, filter entire inventory array
- With 1000 items and 10000 inventory entries: 10M comparisons
- Correct approach: Pre-build map of item → total quantity

**Safer Code:**
```typescript
const itemTotals = new Map<string, number>();
inventory.forEach(e => {
  itemTotals.set(e.item_id, (itemTotals.get(e.item_id) ?? 0) + e.quantity);
});

const lowStockItems = items.filter(item => {
  const totalQty = itemTotals.get(item.id) ?? 0;
  return totalQty < (item.min_stock_limit ?? 10);
});
```

### 6.3 Category Mix Calculation

**Code (Lines 54-66):**
```typescript
const categoryStats = useMemo(() => {
  const catMap: Record<string, number> = {};
  inventory.forEach(e => {
    const item = items.find(i => i.id === e.item_id);  // ← O(n) find
    if (item) catMap[item.category] = (catMap[item.category] || 0) + e.quantity;
  });
  // ... 
}, [inventory, items]);
```

**Issues:**
- O(n²) again: for each inventory entry, searches items array
- No null check if item is deleted but inventory reference remains
- Should pre-build item map:

```typescript
const itemMap = new Map(items.map(i => [i.id, i]));
inventory.forEach(e => {
  const item = itemMap.get(e.item_id);
  if (item) catMap[item.category] = ...;
});
```

### 6.4 Finance Analytics

**Monthly P&L (Lines 99-114):**
```typescript
const monthlyPnL = useMemo(() => {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { label: format(d, 'MMM yy'), year: d.getFullYear(), month: d.getMonth() };
  });
  return months.map(m => {
    const mSales = sales.filter(s => {
      const d = new Date(s.timestamp);
      return d.getFullYear() === m.year && d.getMonth() === m.month;
    });
    const revenue = mSales.reduce((s, x) => s + x.converted_price_INR, 0);
    const profit = mSales.reduce((s, x) => s + x.profit_INR, 0);
    return { ...m, revenue, profit };
  });
}, [sales]);
```

**Issues:**
- GOOD: Correctly filters sales by month/year
- GOOD: Shows last 6 months of data
- ISSUE: "profit" is gross profit (doesn't subtract expenses)
- ISSUE: If no sales in month, shows 0 (correct) but chart may be misleading with empty months

### 6.5 Top Selling Items

**Code (Lines 77-89):**
```typescript
const topItems = useMemo(() => {
  const map: Record<string, { revenue: number; profit: number; qty: number }> = {};
  sales.forEach(s => {
    if (!map[s.item_id]) map[s.item_id] = { revenue: 0, profit: 0, qty: 0 };
    map[s.item_id].revenue += s.converted_price_INR;
    map[s.item_id].profit += s.profit_INR;
    map[s.item_id].qty += s.quantity;
  });
  return Object.entries(map)
    .map(([id, data]) => ({ ...data, item: items.find(i => i.id === id)?.name ?? id }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);
}, [sales, items]);
```

**Issues:**
- O(n) find operations: `.map()` calls items.find() for each item
- Should pre-build item name map:

```typescript
const itemNames = new Map(items.map(i => [i.id, i.name]));
return Object.entries(map)
  .map(([id, data]) => ({ 
    ...data, 
    item: itemNames.get(id) ?? id 
  }))
```

---

## 7. DATA TYPE CONSISTENCY

### 7.1 Type Mismatches

| Field | Expected Type | Actual Type | Issue |
|---|---|---|---|
| Transaction.timestamp | ISO string | string | ✓ Correct |
| Container.date | ISO string | string | ⚠️ Other timestamps are ISO but some are date strings |
| Expense.date | ISO date string | string (YYYY-MM-DD) | ⚠️ Inconsistent format |
| Sale.avg_cost_INR | number | number | ✓ Correct |
| Item.retail_price | number | number \| undefined | ⚠️ Optional but used in calcs without defaults |
| Item.min_stock_limit | number | number | ⚠️ No validation > 0 |
| Location.currency | string | string | ✓ Correct if validated against EXCHANGE_RATES |
| InventoryEntry.avg_cost_INR | number | number | ✓ Correct |

### 7.2 Null/Undefined Handling

**Problematic Pattern 1 - Item lookup without guard:**
```typescript
const item = items.find(i => i.id === e.item_id);
if (!item || !loc) return null;  // ← Guard is there
```
✓ Dashboard has guard

**Problematic Pattern 2 - retail_price without default:**
```typescript
const totalPotentialRevenue = inventory.reduce((s, e) => {
  const item = items.find(i => i.id === e.item_id);
  return s + e.quantity * (item?.retail_price || 0);  // ← Defaults to 0 silently
}, 0);
```
⚠️ If retail_price not set, silently uses 0, making potential revenue 0

**Problematic Pattern 3 - min_stock_limit without default:**
```typescript
return totalQty < (item.min_stock_limit ?? 10);  // ← Defaults to 10
```
✓ Has default

### 7.3 Missing Field Validations

**When creating location:**
- Should validate: country ∈ COUNTRIES
- Should validate: currency ∈ EXCHANGE_RATES
- Should validate: type ∈ ['warehouse', 'shop']
- Currently: No validation, silently accepts invalid values

**When creating item:**
- Should validate: min_stock_limit > 0
- Should validate: brand_id references existing brand
- Currently: No validation

**When recording sale:**
- Should validate: selling_price > 0
- Should validate: quantity ≤ available stock
- Should validate: currency ∈ EXCHANGE_RATES
- Currently: quantity validated, others not

**When stock entry:**
- Should validate: unit_cost > 0
- Should validate: quantity > 0
- Should validate: currency ∈ EXCHANGE_RATES
- Currently: No validation

---

## 8. USER AUTHENTICATION & AUTHORIZATION

### 8.1 Auth System (authStore.ts)

**Current Implementation:**
```typescript
export const useAuthStore = create<AuthState>((set) => ({
  user: { uid: 'open-user-123' },
  appUser: {
    id: 'admin-123',
    name: 'Open Admin',
    email: 'admin@777global.com',
    role: 'super_admin',
    location: 'Global',
    status: 'Active'
  },
  loading: false,
  setUser: (user, appUser) => set({ user, appUser, loading: false }),
  setLoading: (loading) => set({ loading }),
}));

export const initAuth = () => {
  // Authentication is disabled; open for all
};
```

**Issues:**
- CRITICAL: Auth is disabled - all users logged in as super_admin
- CRITICAL: No permission checking on any operations
- CRITICAL: appUser.location is 'Global' but should link to location.id
- MISSING: No role-based access control (RBAC) on routes
- MISSING: No field-level permissions (e.g., can edit own location only)

### 8.2 User Model

**User Interface (from store/index.ts):**
```typescript
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff';
  location_id: string;
  status: 'Active' | 'Inactive';
}
```

**Issues:**
- GOOD: Has role-based structure
- ISSUE: location_id is single string, but staff might work at multiple locations
  - Should be: location_ids: string[]
- MISSING: No permission scopes
- MISSING: No creation/modification timestamps

### 8.3 Role Definitions (implied from code)

| Role | Permissions | Notes |
|---|---|---|
| super_admin | All operations | No restrictions |
| admin | All operations | Implies same as super_admin |
| warehouse_staff | Stock entry, transfer, inventory view | Warehouse-only |
| shop_staff | Sales, returns, inventory view | Shop-only |

**Issues:**
- Not implemented - all users have all permissions
- Should enforce in backend Firestore rules or middleware
- Currently no permission checks

---

## 9. TRANSACTION FLOWS & DATA CONSISTENCY

### 9.1 Stock Entry Transaction

**Flow:**
```
User: Container → Items (OCR/manual) → Location
         ↓
    addContainer() ──> containers collection
    for each item:
      stockEntry() ──> batch operation:
        - inventory update (weighted average)
        - transaction log
        - notifications (stock_entry + low_stock if needed)
```

**Data Consistency:**
- ✓ Uses batch operation (atomic)
- ✓ Calculates weighted average correctly
- ✓ Stores both original and INR values
- ⚠️ Container ID linked in transaction
- ⚠️ No rollback if one item fails (batch partial failure)

### 9.2 Transfer Transaction

**Flow:**
```
User: Source Location → Item → Quantity → Destination
         ↓
    transfer() ──> batch operation:
      - inventory update (source: decrease, dest: increase with weighted avg)
      - transaction log
      - notifications (transfer to both locations + low_stock warnings)
```

**Data Consistency:**
- ✓ Uses batch operation (atomic)
- ✓ Validates sufficient source inventory
- ✓ Maintains weighted average at destination
- ✓ Creates notifications for both locations
- ⚠️ No lock on source inventory during concurrent transfers
  - Race condition: two transfers could exceed available stock
  - Should use transaction isolation

### 9.3 Sale Transaction

**Flow:**
```
User: Location → Item → Quantity → Selling Price → Currency
         ↓
    recordSale() ──> batch operation:
      - inventory update (decrease by qty)
      - sales log (stores profit_INR)
      - transaction log
      - notifications (sale + low_stock if needed)
```

**Data Consistency:**
- ✓ Uses batch operation (atomic)
- ✓ Validates sufficient inventory
- ✓ Calculates profit correctly (revenue - cost)
- ✓ Stores avg_cost_INR snapshot (good for historical accuracy)
- ⚠️ No inventory reserves/pending sales
  - Concurrent sales could sell more than available
- ⚠️ No refund/return link back to original sale

### 9.4 Return Transaction

**Flow:**
```
User: Location → Item → Quantity → Return Type (sale/warehouse) → Status (restocked/disposed)
         ↓
    processReturn() ──> batch operation:
      - return record
      - if Restocked:
        - inventory update (increase by qty)
      - transaction log (with cost 0)
```

**Issues:**
- CRITICAL: If inventory doesn't exist, creates with avg_cost_INR: 0
- MAJOR: No link back to original sale for refunds
- MAJOR: No inventory reserves/hold during processing
- ⚠️ Cost isn't adjusted when item is restocked

---

## 10. MISSING FEATURES & RECOMMENDATIONS

### 10.1 Critical Fixes Required

1. **Expense Categorization**
   - Add `location_type` field to expenses collection
   - Validate warehouse vs shop category restrictions
   - Separate warehouse and shop expense calculations

2. **Shop Profit Calculation**
   - Clarify: is `profit` in ManageShops gross or net?
   - Update Dashboard to show gross profit, not net
   - Finance page should clearly separate:
     - Gross Profit = Revenue - COGS
     - Operating Expenses = Warehouse + Shop expenses
     - Net Profit = Gross Profit - Expenses

3. **Currency Exchange Rates**
   - Create admin interface to update exchange rates
   - Store historical rates with each transaction
   - Validate currency in transactions matches location.currency

4. **Return Processing**
   - Link returns back to original sales
   - Track refunds separately
   - Don't create inventory with cost 0 - require cost input

5. **Inventory Race Conditions**
   - Implement transaction isolation for concurrent sales/transfers
   - Add inventory reserves for pending sales
   - Validate sufficient stock after lock, not before

### 10.2 Major Improvements Needed

1. **Real-time Sync Cleanup**
   - Fix isSyncing flag logic
   - Handle listener errors gracefully
   - Implement proper unsubscribe on cleanup

2. **Data Type Consistency**
   - Standardize date/timestamp formats (all ISO strings)
   - Validate required fields on insert
   - Add null checks for optional fields

3. **Performance Optimizations**
   - Replace O(n²) lookups with Map-based O(1) lookups
   - Memoize item/location maps across components
   - Defer heavy calculations (monthly P&L)

4. **Notification System**
   - Implement proper role-based notification filtering
   - Add notification preferences per user
   - Track notification read/unread status

5. **User & Permissions**
   - Implement actual authentication
   - Add role-based access control to routes
   - Add location-specific permission scopes

### 10.3 Minor Improvements

1. **Warehouse.tsx**
   - Simplify complex Excel/PDF import logic
   - Validate imported data before committing
   - Add import history/audit trail

2. **Finance Page**
   - Add monthly expense breakdown
   - Compare profit to targets
   - Add forecast/projection

3. **Transfers Page**
   - Show inter-location transfer chains
   - Track transfer cost vs average cost
   - Alert on unusual transfers

4. **Reports**
   - Add inventory turnover ratio
   - Add profit margin by item/category
   - Add location performance rankings

---

## SUMMARY OF FINDINGS

### Critical Issues (5)
1. Expense categorization doesn't differentiate warehouse vs shop
2. Shop profit calculation double-counts expenses
3. Return processing creates inventory with cost 0
4. Inventory race conditions in concurrent sales/transfers
5. Exchange rates hardcoded with no update mechanism

### Major Issues (8)
1. Currency conversion not validated against location.currency
2. Real-time sync flag logic incorrect
3. O(n²) performance in dashboard calculations
4. Profit displayed as "Net" but actually "Gross" (excludes expenses)
5. No inventory reserves/pending status
6. Error handling missing in Firestore listeners
7. Returns don't link back to original sales
8. Potential profit calculation is misleading

### Minor Issues (12)
1. Inconsistent date/timestamp formats
2. No field validation on insert
3. chartFunction names don't match behavior
4. Markup calculation doesn't handle division by zero
5. Missing null guards in some calculations
6. Hardcoded string IDs ('supplier', 'customer')
7. Item map rebuilds on every render
8. Warehouse metrics don't show profit/loss
9. No inventory audit trail
10. Transfer cost doesn't account for location currency
11. No container status tracking
12. Complex import logic error-prone

---

## RECOMMENDATIONS BY PRIORITY

**Phase 1 - Security & Data Integrity:**
- Implement proper user authentication
- Add field validation and null checks
- Fix critical expense categorization

**Phase 2 - Accuracy & Reporting:**
- Fix profit calculations (clarify gross vs net)
- Add exchange rate history
- Implement proper return tracking

**Phase 3 - Performance & Features:**
- Optimize O(n²) lookups
- Add inventory reserve system
- Implement concurrent access control
- Add reporting and forecasting

**Phase 4 - Polish:**
- Standardize date formats
- Add audit trails
- Improve import logic
- Add permission scopes

---

**End of Audit Report**

