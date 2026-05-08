"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import dynamic from "next/dynamic";

const RiderMap = dynamic(() => import("@/components/RiderMap"), { ssr: false });

const formatScheduleLabel = (iso) => {
  if (!iso) return "รับทันที (Now)";
  try { return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }); } catch { return "รับล่วงหน้า"; }
};
const buildLocalIso = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0).toISOString();
};

export default function PlaceOrder() {
  const { id } = useParams();
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  const [order, setOrder] = useState(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [scheduledAt, setScheduledAt] = useState(null);
  const [scheduledLabel, setScheduledLabel] = useState("รับทันที (Now)");
  const [showSchedule, setShowSchedule] = useState(false);
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [draftTime, setDraftTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [packageCount, setPackageCount] = useState(1);
  const [weightBand, setWeightBand] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [itemTypes, setItemTypes] = useState({ food: false, office: false, apparel: false, household: false, electronics: false, fragile: false, others: false });

  useEffect(() => {
    if (!isLoggedIn || !id) return;
    setLoading(true);
    apiFetch(`/orders/${id}`)
      .then((data) => {
        setOrder(data);
        const loc = data?.location;
        const iso = loc?.scheduled_at || null;
        if (iso) {
          setScheduledAt(iso);
          setScheduledLabel(loc?.scheduled_text || formatScheduleLabel(iso));
          const dt = new Date(iso);
          setDraftDate(dt.toISOString().slice(0, 10));
          setDraftTime(dt.toTimeString().slice(0, 5));
        }
      })
      .catch((e) => setErr(e.message || "โหลดคำสั่งซื้อไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [id, isLoggedIn]);

  const locationData = order?.location || null;
  const pickup = useMemo(() => {
    if (!locationData) return null;
    return locationData.pickup_lat ? { lat: Number(locationData.pickup_lat), lng: Number(locationData.pickup_lng) } : null;
  }, [locationData]);
  const dropoff = useMemo(() => {
    if (!locationData) return null;
    return locationData.dropoff_lat ? { lat: Number(locationData.dropoff_lat), lng: Number(locationData.dropoff_lng) } : null;
  }, [locationData]);

  const vehicle = useMemo(() => {
    if (order?.items?.length) { const first = order.items[0]; return { name: first.product_name || "พัสดุ", price: first.price || 0 }; }
    return null;
  }, [order]);

  const total = order?.total_price ?? vehicle?.price ?? 0;
  const phone = order?.location?.receiver_phone || "-";
  const receiver = order?.location?.receiver_name || "-";
  const pickupAddress = order?.location?.pickup_address || "-";
  const dropoffAddress = order?.location?.dropoff_address || "-";

  const toggleType = (key) => setItemTypes((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleScheduleConfirm = async () => {
    const iso = buildLocalIso(draftDate, draftTime);
    setScheduledAt(iso);
    setScheduledLabel(formatScheduleLabel(iso));
    setShowSchedule(false);
    if (!id) return;
    setSavingSchedule(true);
    try {
      await apiFetch(`/orders/${id}/schedule`, { method: "PATCH", body: JSON.stringify({ scheduled_at: iso, scheduled_text: formatScheduleLabel(iso) }) });
    } catch (e) { console.error(e); } finally { setSavingSchedule(false); }
  };

  const goToPayment = () => {
    if (!paymentMethod) return alert("โปรดเลือกวิธีชำระเงิน");
    router.push(`/pay/${id}`);
  };

  if (!isLoggedIn) {
    return (
      <div className="page">
        <h2>Place Order</h2>
        <p className="error">กรุณาเข้าสู่ระบบ</p>
        <button className="link-btn" onClick={() => router.push("/login")}>ไปหน้าเข้าสู่ระบบ</button>
      </div>
    );
  }

  return (
    <div className="page place-shell">
      <div className="place-head">
        <div className="eyebrow">Place Order</div>
        <div>
          <h2 className="page-title">ยืนยันรายละเอียดงานจัดส่ง</h2>
          <p className="muted small">ตรวจสอบจุดรับ-ส่ง รายละเอียดพัสดุ และข้อมูลผู้ติดต่อ</p>
        </div>
        <div className="pill subtle">Order #{id}</div>
      </div>

      <div className="place-grid">
        <div className="place-panel">
          <section className="place-section">
            <header className="section-head"><div><div className="section-kicker">Delivery Date & Contact</div><h3>เวลาส่ง & ข้อมูลติดต่อ</h3></div></header>
            <div className="form-field">
              <span>Time</span>
              <div className="schedule-inline">
                <div className="pill subtle">{scheduledLabel}</div>
                <button type="button" className="ghost" onClick={() => setShowSchedule(true)}>เปลี่ยนเวลา</button>
              </div>
              {savingSchedule && <div className="muted small">กำลังบันทึก...</div>}
            </div>
            <div className="form-field"><span>Phone Number</span><input value={phone} readOnly /></div>
          </section>

          <section className="place-section">
            <header className="section-head">
              <div><div className="section-kicker">Delivery Item Details</div><h3>รายละเอียดพัสดุ</h3></div>
              <span className="pill subtle">{vehicle?.name || "พัสดุ"} • 1 งาน</span>
            </header>
            <div className="tag-grid">
              {Object.entries(itemTypes).map(([key, val]) => (
                <label key={key} className="checkbox-card">
                  <input type="checkbox" checked={val} onChange={() => toggleType(key)} />
                  <span>{{food:"Food & Beverage",household:"Household items",office:"Office items",electronics:"Electronics",apparel:"Apparel",fragile:"Fragile items",others:"Others"}[key]}</span>
                </label>
              ))}
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Number of packages</span>
                <div className="stepper">
                  <button type="button" onClick={() => setPackageCount((c) => Math.max(1, c - 1))}>-</button>
                  <input type="number" min={1} value={packageCount} onChange={(e) => setPackageCount(Math.max(1, Number(e.target.value) || 1))} />
                  <button type="button" onClick={() => setPackageCount((c) => c + 1)}>+</button>
                </div>
              </label>
              <label className="form-field">
                <span>Total weight (kg)</span>
                <select className="route-input" value={weightBand} onChange={(e) => setWeightBand(e.target.value)}>
                  <option value="">Select weight</option>
                  <option value="<1">Less than 1 kg</option>
                  <option value="1-5">1 – 5 kg</option>
                  <option value="5-10">5 – 10 kg</option>
                  <option value="10-20">10 – 20 kg</option>
                  <option value="20+">More than 20 kg</option>
                </select>
              </label>
            </div>
            <div className="place-box"><div className="muted">Pickup</div><div className="strong">{pickupAddress}</div></div>
            <div className="place-box"><div className="muted">Drop-off</div><div className="strong">{dropoffAddress}</div></div>
            <div className="place-box"><div className="muted">ผู้รับ</div><div className="strong">{receiver} • {phone}</div></div>
          </section>

          <section className="place-section">
            <header className="section-head"><div><div className="section-kicker">Notes</div><h3>หมายเหตุถึงไดรเวอร์</h3></div></header>
            <textarea className="note-area" maxLength={500} placeholder="เช่น ฝากโทรหาก่อนถึง / ฝากวางหน้าประตู" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="muted small">{500 - (notes?.length || 0)} characters left</div>
          </section>

          <section className="place-section">
            <header className="section-head"><div><div className="section-kicker">Payment</div><h3>วิธีชำระเงิน</h3></div></header>
            <select className="route-input select-dark" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="" disabled>เลือกวิธีชำระ</option>
              <option value="cod">เงินสดปลายทาง</option>
              <option value="card">โอน/บัตรเครดิต</option>
              <option value="wallet">วอลเล็ท</option>
            </select>
          </section>

          <div className="place-footer">
            <button className="ghost" onClick={() => router.back()} disabled={loading}>กลับ</button>
            <div className="footer-total">
              <div className="muted small">ค่าส่งโดยประมาณ</div>
              <div className="price-big">{total} ฿</div>
              <div className="muted small">{vehicle?.name || "Vehicle"}</div>
            </div>
            <button className="primary-btn wide" onClick={goToPayment}>ดำเนินการต่อ</button>
          </div>
          {err && <div className="error">{err}</div>}
          {loading && <div className="muted">กำลังโหลด...</div>}
        </div>

        <div className="place-map">
          <div className="map-pane-head"><div><div className="section-kicker">Route Map</div><h3>ตรวจสอบตำแหน่งรับ-ส่ง</h3></div></div>
          <div className="map-pane">
            <RiderMap pickup={pickup} dropoff={dropoff} height={560} />
            <div className="map-meta">
              <div className="meta-block"><div className="meta-title">Pickup</div><div className="meta-value">{pickupAddress}</div></div>
              <div className="meta-block"><div className="meta-title">Drop-off</div><div className="meta-value">{dropoffAddress}</div></div>
              <div className="meta-block"><div className="meta-title">เวลารับ</div><div className="meta-value">{scheduledLabel}</div></div>
            </div>
          </div>
        </div>
      </div>

      {showSchedule && (
        <div className="sheet-backdrop" onClick={() => setShowSchedule(false)}>
          <div className="schedule-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><div><div className="section-kicker">Pickup Time</div><h3>เลือกวันและเวลารับพัสดุ</h3></div><button className="ghost" onClick={() => setShowSchedule(false)}>✕</button></div>
            <div className="sheet-body">
              <label className="form-field"><span>วันที่</span><input type="date" value={draftDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDraftDate(e.target.value)} /></label>
              <label className="form-field"><span>เวลา</span><input type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} /></label>
            </div>
            <div className="sheet-actions">
              <button type="button" className="ghost" onClick={() => { setScheduledAt(null); setScheduledLabel("รับทันที (Now)"); setShowSchedule(false); }}>รับทันที</button>
              <button type="button" className="ghost" onClick={() => setShowSchedule(false)}>ยกเลิก</button>
              <button type="button" className="primary-btn" onClick={handleScheduleConfirm}>ยืนยัน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
