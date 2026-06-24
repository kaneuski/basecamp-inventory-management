<template>
  <div class="restocking">
    <div class="page-header">
      <h2>Restocking</h2>
      <p>Recommend items to restock based on demand forecast</p>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <!-- Budget card -->
      <div class="card budget-card">
        <div class="card-header">
          <h3 class="card-title">Budget</h3>
        </div>
        <div class="budget-body">
          <input
            type="range"
            v-model.number="budget"
            min="0"
            max="500000"
            step="1000"
            class="budget-slider"
          />
          <div class="budget-label">
            Available budget: {{ formatCurrency(budget) }}
          </div>
        </div>
      </div>

      <!-- Recommended Items card -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            Recommended Items
            <span class="badge info">{{ recommendedItems.length }} items</span>
            <span class="budget-summary">
              {{ formatCurrency(selectedTotal) }} of
              {{ formatCurrency(budget) }}
            </span>
          </h3>
          <button
            class="place-order-btn"
            :disabled="checkedItems.size === 0"
            @click="placeOrder"
          >
            Place Order &mdash; {{ formatCurrency(selectedTotal) }}
          </button>
        </div>

        <div v-if="recommendedItems.length === 0" class="empty-state">
          Increase your budget to see recommendations
        </div>
        <div v-else class="table-container">
          <table>
            <thead>
              <tr>
                <th class="col-check"></th>
                <th>SKU</th>
                <th>Name</th>
                <th>Qty</th>
                <th>Unit Cost</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in recommendedItems" :key="item.sku">
                <td class="col-check">
                  <input
                    type="checkbox"
                    :checked="checkedItems.has(item.sku)"
                    @change="toggleItem(item.sku)"
                  />
                </td>
                <td>
                  <strong>{{ item.sku }}</strong>
                </td>
                <td>{{ item.name }}</td>
                <td>{{ item.quantity }}</td>
                <td>{{ formatCurrency(item.unit_cost) }}</td>
                <td>
                  <strong>{{ formatCurrency(item.subtotal) }}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useRestockingOrders } from "../composables/useRestockingOrders";

export default {
  name: "Restocking",
  setup() {
    const router = useRouter();
    const { submitOrder } = useRestockingOrders();

    const loading = ref(true);
    const error = ref(null);
    const forecasts = ref([]);
    const inventoryItems = ref([]);

    // Budget slider — default $150,000
    const budget = ref(150000);

    // Checked items set (SKUs)
    const checkedItems = ref(new Set());

    const loadData = async () => {
      try {
        loading.value = true;
        error.value = null;
        const [forecastsData, inventoryData] = await Promise.all([
          api.getDemandForecasts(),
          api.getInventory(),
        ]);
        forecasts.value = forecastsData;
        inventoryItems.value = inventoryData;
      } catch (err) {
        error.value = "Failed to load data: " + err.message;
      } finally {
        loading.value = false;
      }
    };

    // Build a SKU → unit_cost map from inventory
    const inventoryBySku = computed(() => {
      const map = {};
      for (const item of inventoryItems.value) {
        map[item.sku] = item;
      }
      return map;
    });

    // Trend priority order for sorting
    const TREND_ORDER = { increasing: 0, stable: 1, decreasing: 2 };

    // Greedy recommendation algorithm
    const recommendedItems = computed(() => {
      // Cross-reference forecasts with inventory to get unit_cost
      const candidates = forecasts.value
        .map((f) => {
          const inv = inventoryBySku.value[f.item_sku];
          if (!inv) return null;
          return {
            sku: f.item_sku,
            name: f.item_name,
            quantity: f.forecasted_demand,
            unit_cost: inv.unit_cost,
            subtotal: f.forecasted_demand * inv.unit_cost,
            trend: f.trend,
          };
        })
        .filter(Boolean);

      // Sort: increasing → stable → decreasing, then by forecasted_demand desc within each group
      candidates.sort((a, b) => {
        const trendDiff =
          (TREND_ORDER[a.trend] ?? 3) - (TREND_ORDER[b.trend] ?? 3);
        if (trendDiff !== 0) return trendDiff;
        return b.quantity - a.quantity;
      });

      // Greedy fill within budget
      let remaining = budget.value;
      const included = [];
      for (const item of candidates) {
        if (item.subtotal <= remaining) {
          included.push(item);
          remaining -= item.subtotal;
        }
        // Skip items that don't fit, continue checking others
      }

      return included;
    });

    // When recommendedItems changes, reset checkedItems to all SKUs
    watch(
      recommendedItems,
      (items) => {
        checkedItems.value = new Set(items.map((i) => i.sku));
      },
      { immediate: true },
    );

    const selectedTotal = computed(() => {
      return recommendedItems.value
        .filter((item) => checkedItems.value.has(item.sku))
        .reduce((sum, item) => sum + item.subtotal, 0);
    });

    const toggleItem = (sku) => {
      // Replace the Set with a new one to trigger reactivity
      const next = new Set(checkedItems.value);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }
      checkedItems.value = next;
    };

    const formatCurrency = (value) => {
      return value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
    };

    const placeOrder = () => {
      const items = recommendedItems.value.filter((item) =>
        checkedItems.value.has(item.sku),
      );
      if (items.length === 0) return;
      submitOrder(items, selectedTotal.value);
      router.push("/orders");
    };

    onMounted(loadData);

    return {
      loading,
      error,
      budget,
      checkedItems,
      recommendedItems,
      selectedTotal,
      toggleItem,
      formatCurrency,
      placeOrder,
    };
  },
};
</script>

<style scoped>
.page-header {
  margin-bottom: 1.5rem;
}

.page-header h2 {
  margin-bottom: 0.25rem;
}

.page-header p {
  color: #64748b;
  font-size: 0.875rem;
}

.budget-card .card-header {
  margin-bottom: 0;
}

.budget-body {
  padding: 1.25rem 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.budget-slider {
  width: 100%;
  height: 6px;
  appearance: none;
  -webkit-appearance: none;
  background: #e2e8f0;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  accent-color: #2563eb;
}

.budget-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2563eb;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.4);
}

.budget-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2563eb;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.4);
}

.budget-label {
  font-size: 0.938rem;
  color: #0f172a;
  font-weight: 600;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.budget-summary {
  font-size: 0.875rem;
  font-weight: 500;
  color: #64748b;
}

.place-order-btn {
  padding: 0.625rem 1.5rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.938rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.place-order-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.place-order-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  color: #64748b;
  font-size: 0.938rem;
}

.col-check {
  width: 40px;
}

.loading,
.error {
  padding: 2rem;
  text-align: center;
  color: #64748b;
}

.error {
  color: #ef4444;
}
</style>
