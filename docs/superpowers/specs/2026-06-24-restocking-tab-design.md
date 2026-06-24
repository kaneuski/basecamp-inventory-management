# Restocking Tab — Design Spec

**Date:** 2026-06-24  
**Status:** Approved

---

## Overview

Add a "Restocking" tab to the inventory management app. Users set an available budget via a slider, receive a prioritized list of items to restock (drawn from the demand forecast), select which items to include, and place the order. Submitted orders appear immediately in the Orders tab under a new "Submitted Orders" section.

---

## Architecture

### New files

| File                                            | Purpose                                                    |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `client/src/views/Restocking.vue`               | Page view for the Restocking tab                           |
| `client/src/composables/useRestockingOrders.js` | Module-level singleton holding submitted restocking orders |

### Modified files

| File                          | Change                                                         |
| ----------------------------- | -------------------------------------------------------------- |
| `client/src/main.js`          | Add `/restocking` route                                        |
| `client/src/App.vue`          | Add "Restocking" nav tab                                       |
| `client/src/views/Orders.vue` | Render "Submitted Orders" section at top, read from composable |

### No backend changes required.

Data flow:

1. `Restocking.vue` fetches demand forecasts + inventory on mount (existing `api.js` methods)
2. A `computed` property re-runs the recommendation algorithm whenever the budget slider value changes
3. "Place Order" calls `submitOrder()` on the composable, then navigates to `/orders`
4. `Orders.vue` reads `submittedOrders` from the same module-level ref — reactive across routes without prop drilling

---

## Composable: `useRestockingOrders.js`

Module-level `submittedOrders` ref (singleton pattern, same as `useFilters.js`).

```js
const submittedOrders = ref([]);

export function useRestockingOrders() {
  const submitOrder = (items, totalValue) => {
    const now = new Date();
    const delivery = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    submittedOrders.value.unshift({
      id: `rst-${Date.now()}`,
      order_number: `RST-${String(submittedOrders.value.length + 1).padStart(4, "0")}`,
      order_date: now.toISOString(),
      expected_delivery: delivery.toISOString(),
      items,
      total_value: totalValue,
      status: "Processing",
      type: "restocking",
    });
  };
  return { submittedOrders, submitOrder };
}
```

---

## Restocking.vue

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Restocking                                                  │
│  Recommend items to restock based on demand forecast        │
├─────────────────────────────────────────────────────────────┤
│  Budget                                                      │
│  [$0 ─────────────●──────────── $500K]                      │
│  Available budget: $150,000                                  │
├─────────────────────────────────────────────────────────────┤
│  Recommended Items  (12 items · $148,200 of $150,000)       │
│  ┌──────┬──────────────────┬──────┬──────────┬──────────┐   │
│  │  ☑  │ SKU              │ Qty  │ Unit Cost│ Subtotal │   │
│  │  ☑  │ SEN-101 ...      │  450 │   $24.50 │ $11,025  │   │
│  │  ☑  │ MCU-402 ...      │  289 │   $34.50 │  $9,970  │   │
│  └──────┴──────────────────┴──────┴──────────┴──────────┘   │
│                                                              │
│  [  Place Order — $148,200  ]  (disabled if none selected)  │
└─────────────────────────────────────────────────────────────┘
```

### Budget slider

- Range: $0–$500,000, step: $1,000
- Displays formatted current value below the slider
- Changing the value immediately triggers recomputation of recommendations

### Recommendation algorithm (`computed`)

1. Cross-reference demand forecasts with inventory items by SKU to get `unit_cost`
2. Sort by trend priority: `increasing` → `stable` → `decreasing`; within each group, sort by `forecasted_demand` descending
3. Greedy fill: iterate sorted list, include item if `forecasted_demand × unit_cost ≤ remaining_budget`; skip items that don't fit, continue to next
4. Return the included items list

### Item selection

- Each row has a checkbox, checked by default
- Deselecting an item removes its cost from the running total and may allow a previously-skipped item to fit
- "Place Order" button is disabled when no items are checked
- Button label shows the current selected total: `Place Order — $148,200`

### Place Order

1. Collect checked items (sku, name, quantity, unit_cost, subtotal)
2. Call `submitOrder(items, total)` on the composable
3. `vue-router` navigates to `/orders`

---

## Orders.vue changes

- Import and destructure `submittedOrders` from `useRestockingOrders`
- Render a "Submitted Orders" card above the existing orders card, only when `submittedOrders.length > 0`
- Table columns: Order #, Items (count, expandable), Order Date, Expected Delivery, Total Value, Status

### Submitted Orders section layout

```
┌─────────────────────────────────────────────────────────────┐
│  Submitted Orders  (3)                                       │
│  ┌────────────┬──────────┬────────────┬─────────┬────────┐  │
│  │ Order #    │ Items    │ Order Date │ Est.Del │ Value  │  │
│  │ RST-0003   │ 8 items  │ Jun 24     │ Jul 8   │$92,400 │  │
│  └────────────┴──────────┴────────────┴─────────┴────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  All Orders  (47)                                            │
│  ...existing table...                                        │
└─────────────────────────────────────────────────────────────┘
```

- Delivery lead time is always **14 days** from `order_date`
- Status badge is always "Processing" (blue `info` badge)
- No filter bar interaction — submitted orders are always shown regardless of active filters

---

## Edge Cases

| Scenario                          | Behavior                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Budget too low to afford any item | Show empty state: "Increase your budget to see recommendations"                     |
| No demand forecasts loaded        | Show loading/error state (existing pattern)                                         |
| All items deselected              | "Place Order" button disabled                                                       |
| Page refresh                      | Submitted orders are cleared (consistent with all other in-memory data in this app) |

---

## Styling

Follows the existing design system:

- Slate/gray palette (`#0f172a`, `#64748b`, `#e2e8f0`)
- `.card` / `.card-header` / `.card-title` global classes
- `.badge.info` for "Processing" status
- Slider uses native `<input type="range">` styled to match the app
- No emojis in UI
