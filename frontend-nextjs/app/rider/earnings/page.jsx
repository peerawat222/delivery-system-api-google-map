"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const fmt = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default function RiderEarningsPage() {
  const { isLoggedIn, user } = useAuth();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    setErr("");
    apiFetch(`/orders/rider/earnings?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => setErr(e.message || "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isLoggedIn) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoggedIn) {
    return (
      <div className="page">
        <p className="error">กรุณาเข้าสู่ระบบ</p>
        <button className="link-btn" onClick={() => router.push("/login")}>ไปล็อกอิน</button>
      </div>
    );
  }
  if (user?.role !== "rider" && user?.role !== "admin") {
    return <div className="page"><p className="error">หน้านี้ใช้ได้เฉพาะ Rider</p></div>;
  }

  const s = data?.summary;
  const t = data?.today;
  const commissionPct = s && s.gross_total > 0
    ? Math.round((s.commission_total / s.gross_total) * 100)
    : 20;

  return (
    <div className="page">
      <div className="page-head">
        <h2>💰 รายได้ของฉัน</h2>
        <button className="ghost" onClick={() => router.push("/rider")}>← กลับ Dashboard</button>
      </div>

      {t && (
        <div className="card" style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div className="muted small" style={{ marginBottom: 8, fontWeight: 600 }}>วันนี้</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div className="muted small">รายได้สุทธิ</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#16a34a" }}>{fmt(t.net)} ฿</div>
            </div>
            <div style={{ width: 1, background: "#e5e7eb" }} />
            <div style={{ textAlign: "center", flex: 1 }}>
              <div className="muted small">ยอดรวม</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(t.gross)} ฿</div>
            </div>
            <div style={{ width: 1, background: "#e5e7eb" }} />
            <div style={{ textAlign: "center", flex: 1 }}>
              <div className="muted small">Commission {commissionPct}%</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>-{fmt(t.commission)} ฿</div>
            </div>
            <div style={{ width: 1, background: "#e5e7eb" }} />
            <div style={{ textAlign: "center", flex: 1 }}>
              <div className="muted small">งานสำเร็จ</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#2563eb" }}>{t.order_count} งาน</div>
            </div>
          </div>
        </div>
      )}

      {/* Date filter */}
      <div className="card" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", padding: "14px 20px", marginBottom: 16 }}>
        <label className="form-field" style={{ flex: 1, minWidth: 140 }}>
          <span className="muted small">ตั้งแต่วันที่</span>
          <input type="date" className="route-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="form-field" style={{ flex: 1, minWidth: 140 }}>
          <span className="muted small">ถึงวันที่</span>
          <input type="date" className="route-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="primary-btn" style={{ width: "auto", marginBottom: 2 }} onClick={load} disabled={loading}>
          {loading ? "กำลังโหลด..." : "ค้นหา"}
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {/* Period summary */}
      {s && (
        <div className="card" style={{ padding: "14px 20px", marginBottom: 16 }}>
          <div className="muted small" style={{ marginBottom: 8, fontWeight: 600 }}>สรุปช่วงที่เลือก</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
            <div className="card" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", textAlign: "center", padding: 14 }}>
              <div className="muted small">รายได้สุทธิ</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>{fmt(s.net_total)} ฿</div>
            </div>
            <div className="card" style={{ background: "#f8fafc", textAlign: "center", padding: 14 }}>
              <div className="muted small">ยอดรวมทั้งหมด</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(s.gross_total)} ฿</div>
            </div>
            <div className="card" style={{ background: "#fff1f2", border: "1px solid #fecdd3", textAlign: "center", padding: 14 }}>
              <div className="muted small">ค่า Commission</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>-{fmt(s.commission_total)} ฿</div>
            </div>
            <div className="card" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", textAlign: "center", padding: 14 }}>
              <div className="muted small">งานสำเร็จ</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#2563eb" }}>{s.total_orders} งาน</div>
            </div>
          </div>
        </div>
      )}

      {/* History table */}
      {data?.history?.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>ประวัติรายวัน</div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th style={{ textAlign: "right" }}>งาน</th>
                  <th style={{ textAlign: "right" }}>ยอดรวม (฿)</th>
                  <th style={{ textAlign: "right" }}>Commission (฿)</th>
                  <th style={{ textAlign: "right" }}>รับสุทธิ (฿)</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td style={{ textAlign: "right" }}>{row.order_count}</td>
                    <td style={{ textAlign: "right" }}>{fmt(row.gross)}</td>
                    <td style={{ textAlign: "right", color: "#ef4444" }}>-{fmt(row.commission)}</td>
                    <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 700 }}>{fmt(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.history?.length === 0 && !loading && (
        <p className="muted" style={{ textAlign: "center", marginTop: 24 }}>ไม่มีข้อมูลในช่วงที่เลือก</p>
      )}
    </div>
  );
}
