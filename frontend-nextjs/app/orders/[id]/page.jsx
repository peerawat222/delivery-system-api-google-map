"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import dynamic from "next/dynamic";

const RiderMap = dynamic(() => import("@/components/RiderMap"), { ssr: false });

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
  picking_up: "กำลังไปรับ",
  delivering: "กำลังจัดส่ง",
  completed: "ส่งสำเร็จ",
  cancelled: "ยกเลิก",
};

function formatDate(ts) {
  if (!ts) return "-";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function buildFallbackEvents(order) {
  if (!order) return [];
  const events = [];
  if (order.created_at) events.push({ event_type: "created", message: "สร้างคำสั่งซื้อ", created_at: order.created_at });
  if (order.payment_status === "paid") events.push({ event_type: "paid", message: "ชำระเงินแล้ว", created_at: order.paid_at || order.created_at });
  if (order.status) events.push({ event_type: `status_${order.status}`, message: statusLabels[order.status] || order.status, created_at: order.updated_at || order.created_at });
  return events;
}

export default function OrderTrack() {
  const { id } = useParams();
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [order, setOrder] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    Promise.all([apiFetch(`/orders/${id}`), apiFetch(`/orders/${id}/events`)])
      .then(([od, ev]) => { setOrder(od); setEvents(Array.isArray(ev) ? ev : []); })
      .catch((e) => setErr(e.message || "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [id, isLoggedIn]);

  const timeline = useMemo(() => events.length > 0 ? events : buildFallbackEvents(order), [events, order]);

  if (!isLoggedIn) {
    return (
      <div className="page">
        <h2>ติดตามงาน #{id}</h2>
        <p className="error">กรุณาเข้าสู่ระบบ</p>
        <button className="link-btn" onClick={() => router.push("/login")}>ไปหน้าเข้าสู่ระบบ</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>ติดตามงาน #{id}</h2>
        <Link href="/orders" className="link-btn ghost-link">กลับไปออเดอร์ของฉัน</Link>
      </div>

      {loading && <p className="muted">กำลังโหลด...</p>}
      {err && <p className="error">{err}</p>}

      {order && (
        <div className="card">
          <div className="order-head">
            <div>
              <div className="muted small">{order.service_type === "passenger" ? "🧑 รับส่ง" : "📦 ส่งพัสดุ"} • Order #{order.id}</div>
              <strong>สถานะ: {statusLabels[order.status] || order.status}</strong>
              <div className="muted">ชำระเงิน: {order.payment_status || "pending"}</div>
            </div>
            <div className="status-col">
              <span className="badge">ยอด {order.total_price} ฿</span>
              <small className="muted">{formatDate(order.created_at)}</small>
            </div>
          </div>
          {order.location && (
            <div className="muted" style={{ marginTop: 6 }}>
              📍 รับ: {order.location.pickup_address || "-"}<br />
              📍 ส่ง: {order.location.dropoff_address || "-"}
              {order.location.receiver_name && <> • {order.service_type === "passenger" ? "ผู้โดยสาร" : "ผู้รับ"}: {order.location.receiver_name}</>}
              {order.location.distance_km && <> • ~{Number(order.location.distance_km).toFixed(1)} กม.</>}
            </div>
          )}
          {order.rider && (
            <div className="rider-info-card" style={{ marginTop: 10 }}>
              <div className="rider-avatar">{vehicleIcon(order.rider.vehicle_type)}</div>
              <div className="rider-detail">
                <div className="rider-name">{order.rider.full_name || "ไรเดอร์"}</div>
                <div className="muted small">{order.rider.vehicle_type || "ไม่ระบุรถ"}{order.rider.plate_number && <> • <strong>{order.rider.plate_number}</strong></>}</div>
              </div>
              <span className="badge" style={{ background: "#16a34a" }}>Rider</span>
            </div>
          )}
          {order.location?.pickup_lat && order.location?.dropoff_lat && (
            <RiderMap
              pickup={{ lat: Number(order.location.pickup_lat), lng: Number(order.location.pickup_lng) }}
              dropoff={{ lat: Number(order.location.dropoff_lat), lng: Number(order.location.dropoff_lng) }}
              height={280}
            />
          )}
        </div>
      )}

      <div className="card">
        <h3>ไทม์ไลน์</h3>
        {timeline.length === 0 && <p className="muted">ยังไม่มีอีเวนต์</p>}
        <ul className="timeline">
          {timeline.map((ev) => (
            <li key={`${ev.id || ev.event_type}-${ev.created_at}`} className="timeline-item">
              <div className="timeline-dot" />
              <div className="timeline-body">
                <div className="timeline-head">
                  <span className="timeline-type">{ev.event_type}</span>
                  <span className="timeline-time">{formatDate(ev.created_at)}</span>
                </div>
                <div className="timeline-msg">{ev.message || "-"}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
