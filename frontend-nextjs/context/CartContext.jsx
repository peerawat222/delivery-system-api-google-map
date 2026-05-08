"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  const add = useCallback((menu) => {
    setCart([{ ...menu, qty: 1 }]);
  }, []);

  const increment = useCallback((id) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, qty: (item.qty || 1) + 1 } : item
      )
    );
  }, []);

  const decrement = useCallback((id) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id
            ? { ...item, qty: Math.max(1, (item.qty || 1) - 1) }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  }, []);

  const remove = useCallback((id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    setCart([]);
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, m) => sum + (m.price || 0) * (m.qty || 1), 0),
    [cart]
  );

  const count = useMemo(
    () => cart.reduce((sum, m) => sum + (m.qty || 1), 0),
    [cart]
  );

  const itemsForApi = useMemo(
    () =>
      cart.map((m) => ({
        menu_id: m.id,
        quantity: m.qty || 1,
        price: m.price || 0,
        product_name: m.name || "พัสดุ",
        weight_kg: m.weight_kg || null,
        length_cm: m.length_cm || null,
        width_cm: m.width_cm || null,
        height_cm: m.height_cm || null,
      })),
    [cart]
  );

  const value = useMemo(
    () => ({
      cart,
      add,
      increment,
      decrement,
      remove,
      clear,
      total,
      count,
      itemsForApi,
    }),
    [cart, add, increment, decrement, remove, clear, total, count, itemsForApi]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}