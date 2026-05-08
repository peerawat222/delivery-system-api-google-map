"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  created: "สร้างแล้ว", waiting_rider: "รอไรเดอร์", assigned: "มีไรเดอร์",
  picking_up: "กำลังไปรับ", delivering: "กำลังจัดส่ง", completed: "สำเร็จ", cancelled: "ยกเลิก",
};
const statusLabelsPassenger = {
  ...statusLabels,
  picking_up: "กำลังไปรับผู้โดยสาร", delivering: "กำลังรับส่ง", completed: "รับส่งสำเร็จ",
};

function getCoords(order) {
  const loc = order.location;
  if (!loc) return { pickup: null, dropoff: null };
  return {
    pickup: loc.pickup_lat && loc.pickup_lng ? { lat: Number(loc.pickup_lat), lng: Number(loc.pickup_lng) } : null,
    dropoff: loc.dropoff_lat && loc.dropoff_lng ? { lat: Number(loc.dropoff_lat), lng: Number(loc.dropoff_lng) } : null,
  };
}

export default function Rider() {
   const { isLoggedIn, user, initialized } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileForm, setProfileForm] = useState({ vehicle_type: "", plate_number: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [mapOpenId, setMapOpenId] = useState(null);
  const [todayEarnings, setTodayEarnings] = useState({ gross: 0, net: 0, commission: 0, count: 0 });
  const isRider = user?.role === "rider" || user?.role === "admin";

  const loadEarnings = () => {
    apiFetch("/orders/rider/earnings")
      .then((data) => {
        const t = data?.today;
        if (t) setTodayEarnings({ gross: Number(t.gross), net: Number(t.net), commission: Number(t.commission), count: Number(t.order_count) });
      })
      .catch(() => {});
  };

  const load = () => {
    setLoading(true); setErr("");
    Promise.all([apiFetch("/orders"), apiFetch("/orders/available")])
      .then(([mine, open]) => { setOrders(Array.isArray(mine) ? mine : []); setAvailable(Array.isArray(open) ? open : []); })
      .catch((e) => setErr(e.message || "โหลดออเดอร์ไม่สำเร็จ"))
      .finally(() => setLoading(false));
    loadEarnings();
  };

  const loadProfile = () => {
    if (user?.role !== "rider") return;
    apiFetch("/orders/rider/profile").then((data) => {
      setProfile(data);
      setProfileForm({ vehicle_type: data.vehicle_type || "", plate_number: data.plate_number || "" });
      if (!data.vehicle_type || !data.plate_number) setShowProfileForm(true);
    }).catch(() => {});
  };

  useEffect(() => { if (isLoggedIn && isRider) { load(); loadProfile(); } }, [isLoggedIn, isRider]);

  const update = async (id, order_status) => {
    try {
      await apiFetch(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ order_status }) });
      setOrders((o) => o.map((x) => x.id === id ? { ...x, status: order_status, order_status } : x));
      if (order_status === "completed") loadEarnings();
    } catch (e) { alert("อัปเดตไม่สำเร็จ: " + e.message); }
  };

  const claim = async (id) => {
    try {
      const data = await apiFetch(`/orders/${id}/claim`, { method: "POST" });
      if (data?.order) setOrders((prev) => [{ ...data.order }, ...prev.filter((o) => o.id !== id)]);
      load();
    } catch (e) { alert("รับงานไม่สำเร็จ: " + e.message); }
  };

  const saveProfile = async (e) => {
    e.preventDefault(); setSavingProfile(true); setProfileMsg("");
    try {
      await apiFetch("/orders/rider/profile", { method: "PUT", body: JSON.stringify(profileForm) });
      setProfileMsg("บันทึกโปรไฟล์สำเร็จ");
      loadProfile();
      setTimeout(() => { setShowProfileForm(false); setProfileMsg(""); }, 1200);
    } catch (e) { setProfileMsg("บันทึกไม่สำเร็จ: " + e.message); }
    finally { setSavingProfile(false); }
  };
  if (!initialized) {
    return <div className="page"><p className="muted">กำลังโหลด...</p></div>;
  }
  if (!isLoggedIn) {
    return <div className="page"><h2>Rider</h2><p className="error">กรุณาเข้าสู่ระบบ</p><button className="link-btn" onClick={() => router.push("/login")}>ไปล็อกอิน</button></div>;
  }
  if (!isRider) {
    return <div className="page"><h2>Rider</h2><p className="error">หน้านี้ใช้ได้เฉพาะ Rider หรือ Admin</p></div>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>🛵 Rider Dashboard</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/rider/earnings")} style={{ background: "#16a34a", color: "white", border: "none", fontWeight: 700 }}>💰 รายได้ของฉัน</button>
          <button onClick={load} disabled={loading}>↻ รีเฟรช</button>
        </div>
      </div>

      {user?.role === "rider" && (
        <div className="rider-profile-card">
          <div className="rider-profile-left">
            <div className="rider-avatar-lg">{vehicleIcon(profile?.vehicle_type)}</div>
            <div>
              <div className="rider-name">{profile?.full_name || user?.full_name || "—"}</div>
              <div className="muted small">{user?.email}</div>
              {profile?.vehicle_type ? (
                <div className="rider-plate-row">
                  <span className="vehicle-tag">{profile.vehicle_type}</span>
                  <span className="plate-chip">{profile.plate_number}</span>
                </div>
              ) : (
                <div className="muted small" style={{ color: "#ef4444" }}>⚠️ ยังไม่ได้ตั้งค่าโปรไฟล์</div>
              )}
            </div>
          </div>
          {!profile?.vehicle_type || !profile?.plate_number
            ? <button className="ghost" onClick={() => setShowProfileForm((v) => !v)}>{showProfileForm ? "ซ่อน" : "✏️ ตั้งค่าโปรไฟล์"}</button>
            : <span className="muted small" style={{ fontSize: 12, color: "#6b7280" }}>🔒 แก้ไขได้โดย Admin เท่านั้น</span>
          }
        </div>
      )}

      {showProfileForm && (
        <form className="profile-form card" onSubmit={saveProfile}>
          <h3 style={{ margin: "0 0 10px" }}>ตั้งค่าข้อมูลไรเดอร์</h3>
          <div className="form-grid two-col">
            <label className="form-field">
              <span>ประเภทรถ</span>
              <select className="route-input" value={profileForm.vehicle_type} onChange={(e) => setProfileForm((f) => ({ ...f, vehicle_type: e.target.value }))} required>
                <option value="">เลือกประเภทรถ</option>
                <option value="Motorcycle">Motorcycle</option>
                <option value="Sedan">Sedan</option>
                <option value="Hatchback">Hatchback</option>
                <option value="SUV">SUV</option>
                <option value="Pickup">Pickup</option>
                <option value="Van">Van</option>
              </select>
            </label>
            <label className="form-field">
              <span>เลขทะเบียน</span>
              <input className="route-input" value={profileForm.plate_number} onChange={(e) => setProfileForm((f) => ({ ...f, plate_number: e.target.value }))} placeholder="เช่น กข-1234" required />
            </label>
          </div>
          {profileMsg && <div className={profileMsg.includes("สำเร็จ") ? "muted small" : "error"} style={{ marginTop: 6 }}>{profileMsg}</div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button type="submit" className="primary-btn" style={{ width: "auto" }} disabled={savingProfile}>{savingProfile ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}</button>
            <button type="button" className="ghost" onClick={() => setShowProfileForm(false)}>ยกเลิก</button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: "14px 20px", marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div className="muted small">รายได้สุทธิวันนี้</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#16a34a" }}>
              {todayEarnings.net.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: "#e5e7eb" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div className="muted small">ยอดรวม (ก่อนหัก)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#374151" }}>
              {todayEarnings.gross.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: "#e5e7eb" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div className="muted small">ค่า Commission</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>
              -{todayEarnings.commission.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: "#e5e7eb" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div className="muted small">งานสำเร็จวันนี้</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#2563eb" }}>{todayEarnings.count} งาน</div>
          </div>
        </div>
      </div>

      {loading && <p className="muted">กำลังโหลด...</p>}
      {err && <p className="error">{err}</p>}

      <h3 style={{ marginTop: 16 }}>งานที่เปิดให้รับ</h3>
      {available.length === 0 && !loading && <p className="muted">ยังไม่มีงานที่พร้อมรับ{profile?.vehicle_type ? ` สำหรับรถ ${profile.vehicle_type}` : ""}</p>}
      <div className="grid two-col">
        {available.map((o) => {
          const { pickup, dropoff } = getCoords(o);
          const isMapOpen = mapOpenId === `avail-${o.id}`;
          return (
            <div key={`open-${o.id}`} className="card">
              <div className="order-head">
                <div>
                  <div className="muted small">{o.service_type === "passenger" ? "🧑 รับส่ง" : "📦 ส่งพัสดุ"} • Order #{o.id}</div>
                  <div>
                    <strong>{Number(o.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</strong>
                    {o.rider_earning != null && (
                      <span className="muted small" style={{ marginLeft: 6 }}>
                        → คุณได้ <span style={{ color: "#16a34a", fontWeight: 700 }}>{Number(o.rider_earning).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>
                      </span>
                    )}
                  </div>
                  {o.location?.distance_km && <div className="muted small">~{Number(o.location.distance_km).toFixed(1)} กม.</div>}
                </div>
                <span className="badge">{(o.status || "waiting_rider").toUpperCase()}</span>
              </div>
              {o.location && (
                <div className="muted small" style={{ marginTop: 4 }}>
                  📍 รับ: {o.location.pickup_address || "-"}<br />
                  📍 ส่ง: {o.location.dropoff_address || "-"}
                  {o.location.receiver_name && <> • {o.location.receiver_name} {o.location.receiver_phone}</>}
                </div>
              )}
              {pickup && dropoff && (
                <>
                  <button className="ghost small" style={{ marginTop: 8, color: "#2563eb", borderColor: "#2563eb", width: "100%" }} onClick={() => setMapOpenId(isMapOpen ? null : `avail-${o.id}`)}>
                    {isMapOpen ? "▲ ซ่อนแผนที่" : "🗺️ ดูแผนที่เส้นทาง"}
                  </button>
                  {isMapOpen && <RiderMap pickup={pickup} dropoff={dropoff} height={260} />}
                </>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="primary-btn" style={{ flex: 1 }} onClick={() => claim(o.id)}>รับงานนี้</button>
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 20 }}>ออเดอร์ของฉัน</h3>
      {orders.length === 0 && !loading && <p className="muted">ยังไม่มีงานที่รับไว้</p>}
      <div className="grid two-col">
        {orders.map((o) => {
          const { pickup, dropoff } = getCoords(o);
          const status = o.order_status || o.status || "delivering";
          const isActive = ["assigned", "picking_up", "delivering"].includes(status);
          const isMapOpen = mapOpenId === `mine-${o.id}`;
          return (
            <div key={`mine-${o.id}`} className="card">
              <div className="order-head">
                <div>
                  <div className="muted small">{o.service_type === "passenger" ? "🧑 รับส่ง" : "📦 ส่งพัสดุ"} • Order #{o.id}</div>
                  <div>
                    <strong>{Number(o.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</strong>
                    {o.rider_earning != null && (
                      <div className="muted small">
                        รับสุทธิ <span style={{ color: "#16a34a", fontWeight: 700 }}>{Number(o.rider_earning).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>
                        {" "}• หัก commission {Math.round((o.commission_rate ?? 0.2) * 100)}%
                      </div>
                    )}
                  </div>
                </div>
                <span className="badge" style={{ background: isActive ? "#16a34a" : "#111827" }}>
                  {(o.service_type === "passenger" ? statusLabelsPassenger : statusLabels)[status] || status.toUpperCase()}
                </span>
              </div>
              {o.location && (
                <div className="muted small" style={{ marginTop: 4 }}>
                  📍 รับ: {o.location.pickup_address || "-"}<br />
                  📍 ส่ง: {o.location.dropoff_address || "-"}
                </div>
              )}
              {pickup && dropoff && isActive && <RiderMap pickup={pickup} dropoff={dropoff} height={260} />}
              {pickup && dropoff && !isActive && (
                <>
                  <button className="ghost small" style={{ marginTop: 8, color: "#2563eb", borderColor: "#2563eb", width: "100%" }} onClick={() => setMapOpenId(isMapOpen ? null : `mine-${o.id}`)}>
                    {isMapOpen ? "▲ ซ่อนแผนที่" : "🗺️ ดูแผนที่เส้นทาง"}
                  </button>
                  {isMapOpen && <RiderMap pickup={pickup} dropoff={dropoff} height={260} />}
                </>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={() => update(o.id, "picking_up")} disabled={status === "picking_up" || status === "completed"}>
                  {status === "picking_up"
                    ? (o.service_type === "passenger" ? "🚗 กำลังรับผู้โดยสาร" : "🚗 กำลังไปรับ")
                    : (o.service_type === "passenger" ? "ไปรับผู้โดยสาร" : "ไปรับพัสดุ")}
                </button>
                <button onClick={() => update(o.id, "delivering")} disabled={status === "delivering" || status === "completed"}>
                  {status === "delivering"
                    ? (o.service_type === "passenger" ? "🧑 กำลังรับส่ง" : "📦 กำลังส่ง")
                    : (o.service_type === "passenger" ? "เริ่มรับส่ง" : "เริ่มจัดส่ง")}
                </button>
                <button onClick={() => update(o.id, "completed")} disabled={status === "completed"} className="primary-btn" style={{ background: status === "completed" ? "#9ca3af" : "#16a34a" }}>
                  ✅ ส่งสำเร็จ
                </button>
              </div>
              <div style={{ marginTop: 6 }}>
                <Link href={`/orders/${o.id}`} className="link-btn ghost-link" style={{ fontSize: 13 }}>ดูไทม์ไลน์</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
