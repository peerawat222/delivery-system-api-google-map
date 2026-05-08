"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const vehicleIcon = (type) => {
  switch ((type || "").toLowerCase()) {
    case "motorcycle": return "🛵";
    case "sedan": return "🚗";
    case "hatchback": return "🚙";
    case "suv": return "🚙";
    case "pickup": return "🛻";
    case "van": return "🚐";
    default: return "🛵";
  }
};

const statusLabels = {
  created: "สร้างคำสั่งซื้อ",
  waiting_rider: "รอไรเดอร์",
  assigned: "มีไรเดอร์แล้ว",
  picking_up: "กำลังไปรับ",
  delivering: "กำลังจัดส่ง",
  completed: "ส่งสำเร็จ",
  cancelled: "ยกเลิก",
};

export default function Orders() {
  const { isLoggedIn } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    apiFetch("/orders/my")
      .then(setOrders)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div className="page">
        <h2>งานจัดส่งของฉัน</h2>
        <p className="muted">กรุณาเข้าสู่ระบบเพื่อดูประวัติการจัดส่ง</p>
        <Link href="/login" className="link-btn">ไปหน้าเข้าสู่ระบบ</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>งานจัดส่งของฉัน</h2>
        <button onClick={load} disabled={loading}>↻ รีเฟรช</button>
      </div>

      {loading && <p className="muted">กำลังโหลด...</p>}
      {err && <p className="error">{err}</p>}
      {orders.length === 0 && !loading && <p>ยังไม่มีงานจัดส่ง</p>}

      {orders.map((o) => (
        <div key={o.id} className="card order-card">
          <div className="order-head">
            <div>
              <strong>Order #{o.id}</strong>
              <div className="muted">รวม {o.total_price} ฿</div>
              {o.location?.distance_km && <div className="muted">ระยะทาง ~{Number(o.location.distance_km).toFixed(2)} กม.</div>}
            </div>
            <div className="status-col">
              <span className="badge">{statusLabels[o.order_status || o.status || "created"] || (o.status || "created").toUpperCase()}</span>
              <small className="muted">ชำระ: {o.payment_status || "pending"}</small>
            </div>
          </div>

          {o.items?.length > 0 && (
            <ul className="order-items">
              {o.items.map((item) => (
                <li key={item.id || `${item.order_id}-${item.menu_id}`}>
                  {item.product_name || `เมนู #${item.menu_id}`} x {item.quantity} — {item.price} ฿
                </li>
              ))}
            </ul>
          )}

          <div className="muted small">{o.created_at?.substring(0, 16).replace("T", " ") || "-"}</div>
          {o.location && (
            <div className="muted">
              📍 รับ: {o.location?.pickup_address || "-"}<br />
              📍 ส่ง: {o.location?.dropoff_address || "-"}
            </div>
          )}

          {o.rider && (
            <div className="rider-info-card">
              <div className="rider-avatar">{vehicleIcon(o.rider.vehicle_type)}</div>
              <div className="rider-detail">
                <div className="rider-name">{o.rider.full_name || "ไรเดอร์"}</div>
                <div className="muted small">{o.rider.vehicle_type || "ไม่ระบุรถ"}{o.rider.plate_number && <> • <strong>{o.rider.plate_number}</strong></>}</div>
              </div>
              <span className="pill subtle rider-badge">Rider</span>
            </div>
          )}

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            {(o.payment_status || "pending") !== "paid" && (
              <Link href={`/pay/${o.id}`} className="link-btn">ชำระค่าขนส่ง</Link>
            )}
            <Link href={`/orders/${o.id}`} className="link-btn ghost-link">ดูไทม์ไลน์</Link>
          </div>
        </div>
      ))}
    </div>
  );
}
