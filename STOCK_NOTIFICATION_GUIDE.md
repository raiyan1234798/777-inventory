# Stock Limit Notification System Guide

## Overview

The stock notification system has been enhanced to send targeted notifications based on location type and staff assignments. This ensures that:

- **Warehouse Staff** are notified about warehouse stock operations
- **Shop Staff** are notified about their specific shop stock operations  
- **Admins & Super Admins** are always notified about all operations
- **Low Stock Alerts** are sent to relevant staff when inventory falls below minimum limits

---

## Key Features

### 1. **Location-Based Notifications**

Notifications are now smart about which staff members should be notified based on the location type:

#### For Warehouse Stock Entry:
- ✅ Warehouse Staff at that warehouse
- ✅ Admin users
- ✅ Super Admin (always)

#### For Shop Stock Entry/Transfer:
- ✅ Shop Staff at that shop
- ✅ Admin users
- ✅ Super Admin (always)

### 2. **Automatic Low Stock Alerts**

When stock is added (via `stockEntry`, `transfer`, or `recordSale`) if the new quantity falls below `item.min_stock_limit`, an alert is automatically generated with:
- Clear messaging about the shortage
- Exact quantities: current vs. minimum required
- Call-to-action for immediate restocking

### 3. **Super Admin Coverage**

As requested, **Super Admin users always receive all notifications**:
- Stock entries at any location
- Transfers between locations
- Low stock alerts
- Sales records

---

## How to Set Up

### Step 1: Add Staff Members to Locations

Go to the **Team Directory** page and:

1. Click **"Add Member"**
2. Fill in the staff member details:
   - **Full Identity Name**: Staff name
   - **Electronic Mail Vector**: Email address
   - **Access Privilege**: Select role:
     - `Super Admin` - Receives all notifications
     - `Admin` - Receives all notifications
     - `Warehouse Staff` - For warehouse locations
     - `Shop Staff` - For shop locations
   - **Primary Node Assignment**: Select the location (warehouse or shop) they're assigned to
   - **Status Flag**: Set to "Active"

3. Click **"Enroll Member"**

### Step 2: Assign Minimum Stock Limits

For each item in your warehouse:

1. Go to **Warehouse** → **Items Tab**
2. For each item, set the `min_stock_limit` (default is 10 units)
3. When stock falls below this limit, notifications are triggered

### Step 3: Monitor Notifications

Go to the **Notifications** page to:
- View all notifications you're authorized to see
- Filter by type: Low Stock, Stock Entry, Transfer, Sale
- Mark notifications as read
- See the scope and location of each notification

---

## Notification Types

### 📦 Stock Entry
**Triggered when:** Stock is added from a supplier/container to a warehouse or transferred to a shop

**Notified:**
- Warehouse/Shop staff at the receiving location
- Admins
- Super Admin

**Message format:**
```
📦 Stock Transfer: [Item Name] — [Qty] units added to [Location Type].
```

### ⚠️ Low Stock Alert
**Triggered when:** After any stock operation, if quantity < min_stock_limit

**Notified:**
- Warehouse/Shop staff at the affected location
- Admins
- Super Admin

**Message format:**
```
⚠️ Low Stock Alert: [Item Name] at [Location] is below minimum 
([Current]/[Minimum] units). Immediate action required.
```

### 🔄 Transfer
**Triggered when:** Stock is transferred between locations

**Two notifications sent:**
1. **Transfer Out** - Notifies staff at source location
2. **Transfer In** - Notifies staff at destination location

**Notified:**
- Staff at both source and destination locations
- Admins
- Super Admin

### 🛍️ Sale
**Triggered when:** A sale is recorded at a shop

**Notified:**
- Shop staff at that location
- Admins
- Super Admin

**Message format:**
```
🛍️ Sale Recorded: [Qty]x [Item Name] sold at [Shop] by [Staff Name].
```

---

## Architecture & Code

### Helper Functions Added

#### `getStaffByLocation(users, locationId)`
Returns all active staff members assigned to a specific location.

```typescript
const shopStaff = getStaffByLocation(users, shopLocationId);
```

#### `getTargetRolesForLocationStockEntry(locationType)`
Determines which roles should be notified based on location type.

**Returns:**
- For `warehouse`: `['super_admin', 'admin', 'warehouse_staff']`
- For `shop`: `['super_admin', 'admin', 'shop_staff']`

```typescript
const targetRoles = getTargetRolesForLocationStockEntry('warehouse');
```

### Updated Functions

The following store functions now use the location-aware notification system:

1. **`stockEntry()`** - Warehouse/shop stock entry from supplier
2. **`transfer()`** - Transfer between locations
3. **`recordSale()`** - Sales from shops

All functions now:
- Detect location type (warehouse vs. shop)
- Calculate appropriate target roles
- Send notifications to relevant staff
- Include super_admin in all notifications

---

## Notification Filtering (User Perspective)

In the **Notifications** page, users only see notifications they're authorized for:

### Super Admin & Admin Users
See all notifications from all locations

### Warehouse Staff
Only see notifications for their assigned warehouse and warehouse-related transfers

### Shop Staff
Only see notifications for their assigned shop and shop-related transfers

The filtering is automatic based on:
- User's role
- User's assigned location (`location_id`)
- Notification's target location(s)

---

## Flow Example

### Scenario: Adding stock to a shop

**Step 1:** Admin adds 50 units of "Nike Shoes" to "Downtown Shop"

**Step 2:** The system:
1. Updates inventory
2. Checks if 50 < min_stock_limit (e.g., 30)
3. Creates "Stock Entry" notification
4. Since 50 > 30, no low stock alert

**Step 3:** Notifications are sent to:
- ✅ All shop_staff assigned to "Downtown Shop"
- ✅ All admin users
- ✅ All super_admin users

**Step 4:** Each user sees the notification based on their authorization

---

## Best Practices

### For Super Admins:
- Monitor the **Notifications** dashboard regularly
- Set reasonable `min_stock_limit` values for items
- Review low stock alerts and reorder as needed

### For Location Managers (Admins):
- Ensure all staff are properly assigned to their locations
- Set status to "Inactive" for departed team members
- Review notifications relevant to your operations

### For Staff Members:
- Ensure your role and location are correctly set
- Mark notifications as read after review
- Report any missed notifications to management

---

## Troubleshooting

### Issue: Not receiving notifications?

**Check:**
1. Is your user status set to **Active**?
2. Is your role correctly set (warehouse_staff/shop_staff)?
3. Are you assigned to the correct **location**?
4. Did a stock operation actually occur?

### Issue: Seeing notifications from other locations?

**This is expected if:**
- You're an Admin or Super Admin (you should see all)
- The notification involves a transfer to/from your location

### Issue: Too many notifications?

**Use the filters in the Notifications page:**
- Filter by type: "Low Stock", "Stock Entry", etc.
- Filter by "Unread Only" to focus on new alerts

---

## Configuration Reference

### Item Configuration
```typescript
interface Item {
  id: string;
  name: string;
  min_stock_limit: number;  // ← Alert threshold
  category: string;
  sku: string;
  // ... other fields
}
```

### User Configuration
```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff';
  location_id: string;  // ← Determines which notifications they see
  status: 'Active' | 'Inactive';
}
```

### Location Configuration
```typescript
interface Location {
  id: string;
  name: string;
  type: 'warehouse' | 'shop';  // ← Determines notification targets
  country: string;
  currency: string;
}
```

---

## Summary

The notification system is now fully integrated with:
- ✅ Location-aware targeting
- ✅ Role-based filtering
- ✅ Automatic low stock alerts
- ✅ Super admin oversight on all operations
- ✅ Clear, actionable messages
- ✅ Flexible notification viewing

All notifications automatically respect the location and role hierarchy, ensuring the right person gets the right notification at the right time.
