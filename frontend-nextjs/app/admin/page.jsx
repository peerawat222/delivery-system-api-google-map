"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS = {
  created: "สร้างแล้ว", waiting_rider: "รอไรเดอร์", assigned: "มีไรเดอร์",
  picking_up: "กำลังรับ", delivering: "กำลังส่ง", completed: "สำเร็จ", cancelled: "ยกเลิก",
};
const STATUS_OPTIONS = ["all", "created", "waiting_rider", "assigned", "picking_up", "delivering", "completed", "cancelled"];
const tabs = [
  { key: "orders", label: "📦 งานจัดส่ง" },
  { key: "users", label: "👥 ผู้ใช้" },
  { key: "top", label: "🏆 บริการขายดี" },
  { key: "revenue", label: "💰 รายรับ Rider" },
  { key: "salesDaily", label: "📅 ยอดรายวัน" },
  { key: "commission", label: "🏦 Commission" },
  { key: "logs", label: "📋 Log" },
];

function StatCard({ icon, label, value, color = "blue", sub }) {
  return (
    <div className="admin-stat-card">
      <div className={`admin-stat-icon ${color}`}>{icon}</div>
      <div className="admin-stat-body">
        <div className="admin-stat-value">{value ?? "—"}</div>
        <div className="admin-stat-label">{label}</div>
        {sub && <div className="admin-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { isLoggedIn, user, initialized } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState("orders");
  const [summary, setSummary] = useState({});
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [riders, setRiders] = useState([]);
  const [topMenus, setTopMenus] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [salesDaily, setSalesDaily] = useState([]);
  const [logs, setLogs] = useState([]);
  const [commission, setCommission] = useState(null);
  const [commFrom, setCommFrom] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`; });
  const [commTo, setCommTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [assignModal, setAssignModal] = useState(null);
  const [createUserModal, setCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ full_name: "", email: "", password: "", role: "customer" });
  const [createUserMsg, setCreateUserMsg] = useState("");
  const [riderProfileModal, setRiderProfileModal] = useState(null);
  const [riderProfileForm, setRiderProfileForm] = useState({ vehicle_type: "", plate_number: "" });
  const [riderProfileMsg, setRiderProfileMsg] = useState("");

  const isAdmin = user?.role === "admin";

  const load = async (signal = { cancelled: false }) => {
    if (!isAdmin) return;
    setLoading(true); setErr("");
    try {
      const results = await Promise.allSettled([
        apiFetch("/admin/summary"), apiFetch("/admin/orders"), apiFetch("/admin/users"), apiFetch("/admin/riders"),
        apiFetch("/admin/reports/top-menus"), apiFetch("/admin/reports/revenue"),
        apiFetch(`/admin/reports/sales-daily?month=${month}`), apiFetch("/admin/reports/order-events?limit=150"),
      ]);
      if (signal.cancelled) return;
      const [sum, ord, usr, rdr, top, rev, sd, lg] = results;
      if (sum.status === "fulfilled") setSummary(sum.value || {});
      if (ord.status === "fulfilled") setOrders(Array.isArray(ord.value) ? ord.value : []);
      if (usr.status === "fulfilled") setUsers(Array.isArray(usr.value) ? usr.value : []);
      if (rdr.status === "fulfilled") setRiders(Array.isArray(rdr.value) ? rdr.value : []);
      if (top.status === "fulfilled") setTopMenus(Array.isArray(top.value) ? top.value : []);
      if (rev.status === "fulfilled") setRevenue(Array.isArray(rev.value) ? rev.value : []);
      if (sd.status === "fulfilled") setSalesDaily(Array.isArray(sd.value) ? sd.value : []);
      if (lg.status === "fulfilled") setLogs(Array.isArray(lg.value) ? lg.value : []);
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) setErr(failed[0].reason?.message || "โหลดข้อมูลบางส่วนไม่สำเร็จ");
    } catch (e) { if (!signal.cancelled) setErr(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (!signal.cancelled) setLoading(false); }
  };

  useEffect(() => {
    if (!isAdmin) return;
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, [isAdmin, month]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    apiFetch(`/admin/earnings?from=${commFrom}&to=${commTo}`)
      .then((data) => { if (!cancelled) setCommission(data); })
      .catch((e) => { if (!cancelled) setErr(e.message || "โหลด commission ไม่สำเร็จ"); });
    return () => { cancelled = true; };
  }, [isAdmin, commFrom, commTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // CRUD: Orders
  const cancelOrder = async (id) => {
    if (!window.confirm(`ยืนยันยกเลิกออเดอร์ #${id}?`)) return;
    try { await apiFetch(`/admin/orders/${id}/cancel`, { method: "PATCH" }); setOrders((p) => p.map((o) => o.id === id ? { ...o, status: "cancelled" } : o)); }
    catch (e) { alert("ยกเลิกไม่สำเร็จ: " + e.message); }
  };
  const deleteOrder = async (id) => {
    if (!window.confirm(`ลบออเดอร์ #${id} ถาวร?`)) return;
    try { await apiFetch(`/admin/orders/${id}`, { method: "DELETE" }); setOrders((p) => p.filter((o) => o.id !== id)); }
    catch (e) { alert("ลบไม่สำเร็จ: " + e.message); }
  };
  const changeOrderStatus = async (id, status) => {
    try { await apiFetch(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); setOrders((p) => p.map((o) => o.id === id ? { ...o, status } : o)); }
    catch (e) { alert("เปลี่ยนสถานะไม่สำเร็จ: " + e.message); }
  };
  const doAssignRider = async (orderId, riderId) => {
    try {
      await apiFetch(`/admin/orders/${orderId}/assign`, { method: "PATCH", body: JSON.stringify({ rider_id: riderId }) });
      const rider = riders.find((r) => r.id === riderId);
      setOrders((p) => p.map((o) => o.id === orderId ? { ...o, status: "assigned", rider_id: riderId, rider_name: rider?.full_name || "" } : o));
      setAssignModal(null);
    } catch (e) { alert("มอบหมายไม่สำเร็จ: " + e.message); }
  };

  // CRUD: Users
  const deleteUser = async (id) => {
    if (id === user?.id) return alert("ไม่สามารถลบบัญชีตัวเองได้");
    if (!window.confirm("ยืนยันลบผู้ใช้?")) return;
    try { await apiFetch(`/admin/users/${id}`, { method: "DELETE" }); setUsers((p) => p.filter((u) => u.id !== id)); }
    catch (e) { alert("ลบไม่สำเร็จ: " + e.message); }
  };
  const changeRole = async (id, role) => {
    try { await apiFetch(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }); setUsers((p) => p.map((u) => u.id === id ? { ...u, role } : u)); }
    catch (e) { alert("เปลี่ยน role ไม่สำเร็จ: " + e.message); }
  };
  const openRiderProfileModal = (u) => {
    setRiderProfileForm({ vehicle_type: u.vehicle_type || "", plate_number: u.plate_number || "" });
    setRiderProfileMsg("");
    setRiderProfileModal(u);
  };
  const doUpdateRiderProfile = async (e) => {
    e.preventDefault(); setRiderProfileMsg("");
    try {
      await apiFetch(`/admin/users/${riderProfileModal.id}/rider-profile`, { method: "PATCH", body: JSON.stringify(riderProfileForm) });
      setRiderProfileMsg("บันทึกสำเร็จ");
      setUsers((prev) => prev.map((u) => u.id === riderProfileModal.id ? { ...u, vehicle_type: riderProfileForm.vehicle_type, plate_number: riderProfileForm.plate_number } : u));
      setTimeout(() => { setRiderProfileModal(null); setRiderProfileMsg(""); }, 1000);
    } catch (e) { setRiderProfileMsg("ไม่สำเร็จ: " + e.message); }
  };

  const doCreateUser = async (e) => {
    e.preventDefault(); setCreateUserMsg("");
    try {
      await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(createUserForm) });
      setCreateUserMsg("สร้างผู้ใช้สำเร็จ");
      setCreateUserForm({ full_name: "", email: "", password: "", role: "customer" });
      setTimeout(() => { setCreateUserModal(false); setCreateUserMsg(""); load(); }, 1000);
    } catch (e) { setCreateUserMsg("ไม่สำเร็จ: " + e.message); }
  };

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      const matchSearch = !q || String(o.id).includes(q) || (o.customer_name || "").toLowerCase().includes(q) || (o.rider_name || "").toLowerCase().includes(q) || (o.pickup_address || "").toLowerCase().includes(q) || (o.dropoff_address || "").toLowerCase().includes(q);
      const matchStatus = orderStatusFilter === "all" || o.status === orderStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, orderSearch, orderStatusFilter]);
    if (!initialized) {
    return <div className="page"><p className="muted">กำลังโหลด...</p></div>;
  }
  if (!isLoggedIn) {
    return <div className="page"><h2>Admin Dashboard</h2><p className="error">กรุณาเข้าสู่ระบบ</p><button className="link-btn" onClick={() => router.push("/login")}>ล็อกอิน</button></div>;
  }
  if (!isAdmin) {
    return <div className="page"><h2>Admin Dashboard</h2><p className="error">สิทธิ์ไม่เพียงพอ (ต้องเป็น admin)</p></div>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>🛠️ Admin Dashboard</h2>
        <button onClick={load} disabled={loading}>↻ รีเฟรช</button>
      </div>
      {loading && <p className="muted">กำลังโหลด...</p>}
      {err && <p className="error">{err}</p>}

      <div className="admin-stat-grid">
        <StatCard icon="👥" label="ผู้ใช้ทั้งหมด" value={summary.total_users} color="blue" sub={`Rider ${summary.total_riders ?? 0} คน`} />
        <StatCard icon="📦" label="ออเดอร์ทั้งหมด" value={summary.total_orders} color="purple" sub={`รอไรเดอร์ ${summary.waiting_rider ?? 0}`} />
        <StatCard icon="🚗" label="กำลังดำเนินการ" value={summary.active_orders} color="green" sub="assigned/picking/delivering" />
        <StatCard icon="💰" label="รายได้วันนี้" value={`${Number(summary.revenue_today ?? 0).toLocaleString()} ฿`} color="orange" sub={`สำเร็จ ${summary.completed_today ?? 0} งาน`} />
      </div>

      <div className="tab-bar">
        {tabs.map((t) => (
          <button key={t.key} className={`tab-btn ${active === t.key ? "active" : ""}`} onClick={() => setActive(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ORDERS TAB */}
      {active === "orders" && (
        <div>
          <div className="admin-toolbar">
            <label className="filter">ค้นหา<input placeholder="Order ID / ชื่อลูกค้า / ไรเดอร์" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} style={{ minWidth: 240 }} /></label>
            <label className="filter">สถานะ<select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === "all" ? "ทั้งหมด" : STATUS_LABELS[s] || s}</option>)}</select></label>
            <span className="muted small">แสดง {filteredOrders.length} / {orders.length} รายการ</span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>#ID</th><th>ประเภท</th><th>ลูกค้า</th><th>ไรเดอร์</th><th>เส้นทาง</th><th>ยอด (฿)</th><th>สถานะ</th><th>ชำระ</th><th>วันที่</th><th>จัดการ</th></tr></thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id}>
                      <td><strong>#{o.id}</strong></td>
                      <td>{o.service_type === "passenger" ? "🧑 รับส่ง" : "📦 พัสดุ"}</td>
                      <td><div style={{ fontWeight: 700 }}>{o.customer_name || `#${o.customer_id}`}</div><div className="muted small">{o.customer_email || ""}</div></td>
                      <td>{o.rider_name ? <div><div style={{ fontWeight: 700 }}>{o.rider_name}</div><div className="muted small">{o.vehicle_type}{o.plate_number ? ` • ${o.plate_number}` : ""}</div></div> : <span className="muted small">ยังไม่มี</span>}</td>
                      <td style={{ maxWidth: 200 }}><div className="muted small">📍 {o.pickup_address?.substring(0, 40) || "-"}</div><div className="muted small">🏁 {o.dropoff_address?.substring(0, 40) || "-"}</div></td>
                      <td><strong>{Number(o.total_price).toLocaleString()}</strong></td>
                      <td>
                        <select className="status-select" value={o.status || "created"} onChange={(e) => changeOrderStatus(o.id, e.target.value)} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td><span className={`badge ${o.payment_status === "paid" ? "status-completed" : ""}`}>{o.payment_status || "pending"}</span></td>
                      <td className="muted small">{o.created_at?.substring(0, 16).replace("T", " ") || "-"}</td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                          <button className="admin-action-btn assign" title="มอบหมายไรเดอร์" onClick={() => setAssignModal({ orderId: o.id })}>🛵</button>
                          <button className="admin-action-btn cancel" title="ยกเลิก" disabled={o.status === "cancelled" || o.status === "completed"} onClick={() => cancelOrder(o.id)}>✕</button>
                          <button className="admin-action-btn delete" title="ลบถาวร" onClick={() => deleteOrder(o.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredOrders.length === 0 && <tr><td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>ไม่พบออเดอร์</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* USERS TAB */}
      {active === "users" && (
        <div>
          <div className="admin-toolbar">
            <button className="primary-btn" style={{ width: "auto" }} onClick={() => setCreateUserModal(true)}>+ สร้างผู้ใช้ใหม่</button>
            <span className="muted small">{users.length} คน</span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>#ID</th><th>ชื่อ</th><th>Email</th><th>บทบาท</th><th>ข้อมูลรถ</th><th>วันที่สมัคร</th><th>จัดการ</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td><strong>#{u.id}</strong></td>
                      <td><div style={{ fontWeight: 700 }}>{u.full_name || "—"}</div>{u.id === user?.id && <span className="muted small">(คุณ)</span>}</td>
                      <td className="muted small">{u.email}</td>
                      <td>
                        <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} disabled={u.id === user?.id} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                          <option value="customer">Customer</option>
                          <option value="rider">Rider</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="muted small">
                        {u.vehicle_type ? `${u.vehicle_type} • ${u.plate_number || "-"}` : "-"}
                        {u.role === "rider" && (
                          <button className="ghost small" style={{ marginLeft: 6, padding: "2px 8px", fontSize: 11 }} onClick={() => openRiderProfileModal(u)}>✏️</button>
                        )}
                      </td>
                      <td className="muted small">{u.created_at?.substring(0, 10) || "-"}</td>
                      <td><button className="admin-action-btn delete" disabled={u.id === user?.id} onClick={() => deleteUser(u.id)}>🗑</button></td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>ไม่พบผู้ใช้</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TOP MENUS */}
      {active === "top" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>อันดับ</th><th>บริการ</th><th>งานทั้งหมด</th><th>รายรับ (฿)</th></tr></thead>
              <tbody>
                {topMenus.map((m, i) => <tr key={m.id || i}><td><strong>#{i + 1}</strong></td><td>{m.name}</td><td>{m.total_qty}</td><td><strong>{Number(m.total_revenue).toLocaleString()}</strong></td></tr>)}
                {topMenus.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>ยังไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REVENUE */}
      {active === "revenue" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>#</th><th>ไรเดอร์</th><th>Email</th><th>ประเภทรถ</th><th>ทะเบียน</th><th>งานสำเร็จ</th><th>รายรับรวม (฿)</th></tr></thead>
              <tbody>
                {revenue.map((r) => <tr key={r.id}><td><strong>#{r.id}</strong></td><td><strong>{r.rider_name || "—"}</strong></td><td className="muted small">{r.email || "—"}</td><td>{r.vehicle_type || "—"}</td><td>{r.plate_number || "—"}</td><td>{r.total_orders}</td><td><strong>{Number(r.revenue).toLocaleString()}</strong></td></tr>)}
                {revenue.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>ยังไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DAILY SALES */}
      {active === "salesDaily" && (
        <div>
          <div className="admin-toolbar">
            <label className="filter">เดือน<input type="month" value={month} onChange={(e) => setMonth(e.target.value || month)} /></label>
            <button onClick={load} disabled={loading}>↻ โหลดใหม่</button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>วันที่</th><th>จำนวนงาน</th><th>ยอดรวม (฿)</th></tr></thead>
                <tbody>
                  {salesDaily.map((row) => <tr key={row.order_date}><td>{row.order_date ? new Date(row.order_date).toLocaleDateString("th-TH") : "—"}</td><td>{row.total_orders}</td><td><strong>{Number(row.total_sales).toLocaleString()}</strong></td></tr>)}
                  {salesDaily.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 24 }}>ยังไม่มีข้อมูลในเดือนนี้</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* COMMISSION */}
      {active === "commission" && (
        <div>
          {/* Date filter */}
          <div className="card" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", padding: "14px 20px", marginBottom: 16 }}>
            <label className="form-field" style={{ flex: 1, minWidth: 140 }}>
              <span className="muted small">ตั้งแต่วันที่</span>
              <input type="date" className="route-input" value={commFrom} onChange={(e) => setCommFrom(e.target.value)} />
            </label>
            <label className="form-field" style={{ flex: 1, minWidth: 140 }}>
              <span className="muted small">ถึงวันที่</span>
              <input type="date" className="route-input" value={commTo} onChange={(e) => setCommTo(e.target.value)} />
            </label>
          </div>

          {commission && (() => {
            const fmt = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
            const s = commission.summary;
            const t = commission.today;
            return (
              <>
                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
                  <div className="card" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", textAlign: "center", padding: 16 }}>
                    <div className="muted small">Commission รวม (ช่วงที่เลือก)</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{fmt(s.commission_total)} ฿</div>
                  </div>
                  <div className="card" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", textAlign: "center", padding: 16 }}>
                    <div className="muted small">Commission วันนี้</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#2563eb" }}>{fmt(t.commission)} ฿</div>
                    <div className="muted small">{t.order_count} งาน</div>
                  </div>
                  <div className="card" style={{ textAlign: "center", padding: 16 }}>
                    <div className="muted small">ยอดรวม Gross (ช่วงที่เลือก)</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(s.gross_total)} ฿</div>
                    <div className="muted small">{s.total_orders} งาน</div>
                  </div>
                  <div className="card" style={{ textAlign: "center", padding: 16 }}>
                    <div className="muted small">จ่ายให้ Rider รวม</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#7c3aed" }}>{fmt(s.rider_total)} ฿</div>
                  </div>
                </div>

                {/* Per-rider breakdown */}
                <div className="card" style={{ padding: 0, marginBottom: 16 }}>
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>สรุปแยก Rider (ทั้งหมด)</div>
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Rider</th>
                          <th>รถ</th>
                          <th style={{ textAlign: "right" }}>งาน</th>
                          <th style={{ textAlign: "right" }}>Gross (฿)</th>
                          <th style={{ textAlign: "right" }}>Commission (฿)</th>
                          <th style={{ textAlign: "right" }}>จ่าย Rider (฿)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commission.by_rider.map((r) => (
                          <tr key={r.rider_id}>
                            <td><strong>{r.full_name}</strong></td>
                            <td><span className="vehicle-tag">{r.vehicle_type || "—"}</span></td>
                            <td style={{ textAlign: "right" }}>{r.total_orders}</td>
                            <td style={{ textAlign: "right" }}>{fmt(r.gross_total)}</td>
                            <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmt(r.commission_total)}</td>
                            <td style={{ textAlign: "right", color: "#7c3aed", fontWeight: 600 }}>{fmt(r.net_total)}</td>
                          </tr>
                        ))}
                        {commission.by_rider.length === 0 && (
                          <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>ยังไม่มีข้อมูล</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Daily breakdown */}
                {commission.daily?.length > 0 && (
                  <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: "12px 20px", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Commission รายวัน</div>
                    <div className="table-responsive">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>วันที่</th>
                            <th style={{ textAlign: "right" }}>งาน</th>
                            <th style={{ textAlign: "right" }}>Gross (฿)</th>
                            <th style={{ textAlign: "right" }}>Commission (฿)</th>
                            <th style={{ textAlign: "right" }}>จ่าย Rider (฿)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commission.daily.map((d) => (
                            <tr key={d.date}>
                              <td>{d.date}</td>
                              <td style={{ textAlign: "right" }}>{d.order_count}</td>
                              <td style={{ textAlign: "right" }}>{fmt(d.gross)}</td>
                              <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmt(d.commission)}</td>
                              <td style={{ textAlign: "right", color: "#7c3aed" }}>{fmt(d.rider_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* LOGS */}
      {active === "logs" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>เวลา</th><th>Order</th><th>เหตุการณ์</th><th>ผู้กระทำ</th><th>ข้อความ</th></tr></thead>
              <tbody>
                {logs.map((l) => <tr key={l.id}><td className="muted small">{new Date(l.created_at).toLocaleString("th-TH")}</td><td><strong>#{l.order_id}</strong></td><td><span className="badge" style={{ fontSize: 11 }}>{l.event_type}</span></td><td className="muted small">{l.actor_name || l.actor_role || "—"}{l.actor_id ? ` #${l.actor_id}` : ""}</td><td>{l.message || "—"}</td></tr>)}
                {logs.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>ยังไม่มี log</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Assign Rider */}
      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>🛵 มอบหมายไรเดอร์ — Order #{assignModal.orderId}</h3>
              <button className="ghost" style={{ padding: "4px 10px" }} onClick={() => setAssignModal(null)}>✕</button>
            </div>
            {riders.length === 0 && <p className="muted">ไม่มีไรเดอร์ในระบบ</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {riders.map((r) => (
                <div key={r.id} className="rider-pick-row">
                  <div><div style={{ fontWeight: 700 }}>{r.full_name || r.email}</div><div className="muted small">{r.vehicle_type || "—"}{r.plate_number ? ` • ${r.plate_number}` : ""}</div></div>
                  <button className="primary-btn" style={{ width: "auto", padding: "6px 14px" }} onClick={() => doAssignRider(assignModal.orderId, r.id)}>เลือก</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Rider Vehicle Profile */}
      {riderProfileModal && (
        <div className="modal-overlay" onClick={() => setRiderProfileModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>✏️ แก้ไขข้อมูลรถ — {riderProfileModal.full_name || riderProfileModal.email}</h3>
              <button className="ghost" style={{ padding: "4px 10px" }} onClick={() => setRiderProfileModal(null)}>✕</button>
            </div>
            <form onSubmit={doUpdateRiderProfile}>
              <div className="form-grid two-col" style={{ gap: 10 }}>
                <label className="form-field">
                  <span>ประเภทรถ</span>
                  <select value={riderProfileForm.vehicle_type} onChange={(e) => setRiderProfileForm((f) => ({ ...f, vehicle_type: e.target.value }))} required>
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
                  <input value={riderProfileForm.plate_number} onChange={(e) => setRiderProfileForm((f) => ({ ...f, plate_number: e.target.value }))} placeholder="เช่น กข-1234" required />
                </label>
              </div>
              {riderProfileMsg && <p className={riderProfileMsg.includes("สำเร็จ") ? "muted small" : "error"} style={{ marginTop: 8 }}>{riderProfileMsg}</p>}
              <div className="row" style={{ marginTop: 14 }}>
                <button type="submit" className="primary-btn" style={{ width: "auto" }}>บันทึก</button>
                <button type="button" className="ghost" onClick={() => setRiderProfileModal(null)}>ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create User */}
      {createUserModal && (
        <div className="modal-overlay" onClick={() => setCreateUserModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>+ สร้างผู้ใช้ใหม่</h3>
              <button className="ghost" style={{ padding: "4px 10px" }} onClick={() => setCreateUserModal(false)}>✕</button>
            </div>
            <form onSubmit={doCreateUser}>
              <div className="form-grid two-col" style={{ gap: 10 }}>
                <label className="form-field"><span>ชื่อ-นามสกุล</span><input value={createUserForm.full_name} onChange={(e) => setCreateUserForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="ชื่อเต็ม" /></label>
                <label className="form-field"><span>Email *</span><input type="email" required value={createUserForm.email} onChange={(e) => setCreateUserForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" /></label>
                <label className="form-field"><span>รหัสผ่าน *</span><input type="password" required minLength={6} value={createUserForm.password} onChange={(e) => setCreateUserForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••" /></label>
                <label className="form-field"><span>บทบาท</span><select value={createUserForm.role} onChange={(e) => setCreateUserForm((f) => ({ ...f, role: e.target.value }))}><option value="customer">Customer</option><option value="rider">Rider</option><option value="admin">Admin</option></select></label>
              </div>
              {createUserMsg && <p className={createUserMsg.includes("สำเร็จ") ? "muted small" : "error"} style={{ marginTop: 8 }}>{createUserMsg}</p>}
              <div className="row" style={{ marginTop: 14 }}>
                <button type="submit" className="primary-btn" style={{ width: "auto" }}>สร้างผู้ใช้</button>
                <button type="button" className="ghost" onClick={() => setCreateUserModal(false)}>ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
