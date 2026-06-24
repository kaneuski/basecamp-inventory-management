import { ref } from "vue";

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
