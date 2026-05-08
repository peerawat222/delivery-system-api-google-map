"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import dynamic from "next/dynamic";

const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

const formatScheduleLabel = (iso) => {
  if (!iso) return "รับทันที (Now)";
  try {
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch { return "รับล่วงหน้า"; }
};

const buildLocalIso = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0).toISOString();
};

const haversineKm = (a, b) => {
  if (!a || !b) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad((b.lat || 0) - (a.lat || 0));
  const dLng = toRad((b.lng || 0) - (a.lng || 0));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat || 0)) * Math.cos(toRad(b.lat || 0)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const vehicleOptions = [
  { id: 1, name: "Motorcycle", menu_category: "ส่งด่วน", description: "เอกสาร/กล่องเล็ก เข้าซอยง่าย ถึงไวในเมือง", price: 49, icon: "🛵", badge: "เร็วสุด" },
  { id: 2, name: "Sedan", menu_category: "ทั่วไป", description: "กล่องกลาง/ของมีมูลค่า นั่งสบาย กันแดดฝน", price: 120, icon: "🚗", badge: "ยอดนิยม" },
  { id: 3, name: "Hatchback", menu_category: "คุ้มค่า", description: "พัสดุหลายชิ้น พับเบาะได้ เหมาะกับรอบส่ง", price: 160, icon: "🚙" },
  { id: 4, name: "SUV", menu_category: "บรรทุก", description: "ชิ้นใหญ่ น้ำหนักเยอะ หรือหลายกล่องในทริปเดียว", price: 240, icon: "🚙", badge: "บรรทุกเยอะ" },
];

export default function Menu() {
  const router = useRouter();
  const { total, add, clear, count } = useCart();
  const { isLoggedIn } = useAuth();

  const [serviceType, setServiceType] = useState("parcel");
  const [location, setLocation] = useState({ pickup: null, dropoff: null });
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [parcelType, setParcelType] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [noteToRider, setNoteToRider] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicleOptions[0].id);
  const [pinFocus, setPinFocus] = useState("pickup");
  const [geoPickup, setGeoPickup] = useState(null);
  const [geoStatus, setGeoStatus] = useState("loading");
  const [swapTrigger, setSwapTrigger] = useState(0);
  const [swapCoords, setSwapCoords] = useState({ pickup: null, dropoff: null });
  const [scheduledAt, setScheduledAt] = useState(null);
  const [scheduledLabel, setScheduledLabel] = useState("รับทันที (Now)");
  const [showSchedule, setShowSchedule] = useState(false);
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [draftTime, setDraftTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [distanceKm, setDistanceKm] = useState(null);
  const [durationText, setDurationText] = useState("");
  const [weightKg, setWeightKg] = useState("");

 useEffect(() => {
  if (count === 0) {
    add(vehicleOptions[0]);
  }
}, [count, add]);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoStatus("denied"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoPickup({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("ok");
        setPinFocus("dropoff");
      },
      () => setGeoStatus("denied"),
      { timeout: 8000 }
    );
  }, []);

  const selectedVehicle = useMemo(
    () => vehicleOptions.find((v) => v.id === selectedVehicleId) || vehicleOptions[0],
    [selectedVehicleId]
  );

  const hasPickup = useMemo(() => location?.pickup && Number.isFinite(location.pickup.lat) && Number.isFinite(location.pickup.lng), [location]);
  const hasDropoff = useMemo(() => location?.dropoff && Number.isFinite(location.dropoff.lat) && Number.isFinite(location.dropoff.lng), [location]);

  useEffect(() => {
    if (hasPickup && hasDropoff) setDistanceKm(haversineKm(location.pickup, location.dropoff));
    else setDistanceKm(null);
  }, [hasPickup, hasDropoff, location]);

  const deliveryPrice = useMemo(() => {
    const base = selectedVehicle.price || 0;
    if (!distanceKm) return base;
    return Math.round(base + Math.max(0, distanceKm - 1) * 8);
  }, [selectedVehicle, distanceKm]);

  const checkout = useCallback(async () => {
    if (submitting) return;
    if (count === 0) return alert("ยังไม่ได้เลือกประเภทรถ");
    if (!isLoggedIn) { alert("กรุณาเข้าสู่ระบบก่อน"); router.push("/login"); return; }
    if (!pickupAddress || !dropoffAddress) return alert("กรอกที่อยู่รับและส่งให้ครบ");
    if (!hasPickup || !hasDropoff) return alert("ปักหมุดจุดรับและจุดส่งบนแผนที่ก่อน");

    setSubmitting(true);
    try {
      const itemsPayload = [{
        menu_id: selectedVehicle.id,
        quantity: serviceType === "passenger" ? passengerCount : 1,
        price: deliveryPrice,
        product_name: `${selectedVehicle.name}${serviceType === "passenger" ? ` (${passengerCount} คน)` : ""}`,
        weight_kg: serviceType === "parcel" ? (Number(weightKg) || null) : null,
      }];

      const created = await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          service_type: serviceType,
          items: itemsPayload,
          pickup_address: pickupAddress,
          dropoff_address: dropoffAddress,
          receiver_name: receiverName,
          receiver_phone: receiverPhone,
          scheduled_at: scheduledAt,
          scheduled_text: scheduledLabel,
          location: {
            pickup_address: pickupAddress,
            dropoff_address: dropoffAddress,
            receiver_name: receiverName,
            receiver_phone: receiverPhone,
            pickup_lat: location?.pickup?.lat ?? null,
            pickup_lng: location?.pickup?.lng ?? null,
            dropoff_lat: location?.dropoff?.lat ?? null,
            dropoff_lng: location?.dropoff?.lng ?? null,
            scheduled_at: scheduledAt,
            distance_km: distanceKm ?? null,
            parcel_type: parcelType || null,
            note_to_rider: noteToRider || null,
          },
        }),
      });

      const orderId = created?.id || created?.order_id || created?.orderId;
      clear();
      router.push(orderId ? `/pay/${orderId}` : "/orders");
    } catch (e) {
      alert("สั่งไม่สำเร็จ: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, count, isLoggedIn, pickupAddress, dropoffAddress, hasPickup, hasDropoff, selectedVehicle, serviceType, passengerCount, deliveryPrice, weightKg, receiverName, receiverPhone, scheduledAt, scheduledLabel, distanceKm, parcelType, noteToRider, location, router, clear]);

  const handleSwap = useCallback(() => {
    if (!hasPickup || !hasDropoff) return;
    const newPickup = location.dropoff;
    const newDropoff = location.pickup;
    setLocation({ pickup: newPickup, dropoff: newDropoff });
    setSwapCoords({ pickup: newPickup, dropoff: newDropoff });
    const tmpAddr = pickupAddress;
    setPickupAddress(dropoffAddress);
    setDropoffAddress(tmpAddr);
    setSwapTrigger((v) => v + 1);
  }, [hasPickup, hasDropoff, location, pickupAddress, dropoffAddress]);

  return (
    <div className="page booking-page">
      <div className="booking-hero">
        <div>
          <div className="eyebrow">Route (สูงสุด 20 จุด)</div>
          <h2 className="page-title">{serviceType === "passenger" ? "จองรถรับส่ง" : "จองส่งพัสดุ"}</h2>
          <p className="muted">เพิ่มจุดรับ-ส่ง ปักหมุดบนแผนที่ แล้วเลือกประเภทรถให้ตรงกับงาน</p>
        </div>
      </div>

      <div className="booking-grid">
        <div className="planner-panel">
          <div className="service-type-bar">
            <button type="button" className={`service-type-btn ${serviceType === "parcel" ? "active" : ""}`} onClick={() => setServiceType("parcel")}>
              <span className="svc-icon">📦</span>
              <div><div className="svc-label">ส่งพัสดุ</div><div className="svc-desc">ส่งสินค้า เอกสาร กล่องพัสดุ</div></div>
            </button>
            <button type="button" className={`service-type-btn ${serviceType === "passenger" ? "active" : ""}`} onClick={() => setServiceType("passenger")}>
              <span className="svc-icon">🧑</span>
              <div><div className="svc-label">รับส่ง</div><div className="svc-desc">รับ-ส่งผู้โดยสาร เดินทาง</div></div>
            </button>
          </div>

          <div className="route-card">
            <div className="section-head">
              <div><div className="section-kicker">Route</div><h3>จัดการจุดรับ-จุดส่ง</h3></div>
              <span className="pill subtle">ปักหมุดแล้วกรอกที่อยู่</span>
            </div>

            <div className="schedule-row">
              <div>
                <div className="section-kicker">เวลารับ</div>
                <div className="strong">{scheduledLabel}</div>
              </div>
              <div className="schedule-actions">
                <button type="button" className="pill subtle" onClick={() => setShowSchedule(true)}>🗓️ กำหนดล่วงหน้า</button>
                {scheduledAt && <button type="button" className="ghost small" onClick={() => { setScheduledAt(null); setScheduledLabel("รับทันที (Now)"); }}>รีเซ็ต</button>}
              </div>
            </div>

            <div className="route-list">
              <div className="route-item" onClick={() => setPinFocus("pickup")}>
                <div className="route-marker pickup">1</div>
                <div className="route-body">
                  <label className="route-label">จุดรับ (Pickup)</label>
                  <input className="route-input" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} onFocus={() => setPinFocus("pickup")} placeholder="เช่น ฟิวเจอร์พาร์ครังสิต" />
                  {location.pickup && <div className="coord-chip">พิกัดรับ: {location.pickup.lat.toFixed(5)}, {location.pickup.lng.toFixed(5)}</div>}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
                <button
                  type="button"
                  onClick={handleSwap}
                  disabled={!hasPickup || !hasDropoff}
                  title="สลับจุดรับ-ส่ง"
                  style={{ background: hasPickup && hasDropoff ? "#f0f9ff" : "#f3f4f6", border: "1px solid #bae6fd", borderRadius: 999, width: 36, height: 36, fontSize: 18, cursor: hasPickup && hasDropoff ? "pointer" : "not-allowed", color: hasPickup && hasDropoff ? "#0284c7" : "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ⇅
                </button>
              </div>

              <div className="route-item" onClick={() => setPinFocus("dropoff")}>
                <div className="route-marker drop">⦿</div>
                <div className="route-body">
                  <label className="route-label">จุดส่ง (Drop-off)</label>
                  <input className="route-input" value={dropoffAddress} onChange={(e) => setDropoffAddress(e.target.value)} onFocus={() => setPinFocus("dropoff")} placeholder="เช่น มหาวิทยาลัยรังสิต" />
                  {location.dropoff && <div className="coord-chip">พิกัดส่ง: {location.dropoff.lat.toFixed(5)}, {location.dropoff.lng.toFixed(5)}</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="info-grid two-col">
            <label className="form-field">
              <span>{serviceType === "passenger" ? "ชื่อผู้โดยสาร" : "ชื่อผู้รับ"}</span>
              <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="เช่น คุณสมชาย" />
            </label>
            <label className="form-field">
              <span>{serviceType === "passenger" ? "เบอร์ผู้โดยสาร" : "เบอร์ผู้รับ"}</span>
              <input value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} placeholder="081-234-5678" />
            </label>
          </div>

          {serviceType === "parcel" && (
            <div className="form-grid two-col">
              <label className="form-field">
                <span>ชนิดพัสดุ</span>
                <input value={parcelType} onChange={(e) => setParcelType(e.target.value)} placeholder="เช่น เอกสาร/กล่องสินค้า" />
              </label>
              <label className="form-field">
                <span>น้ำหนัก (กก.)</span>
                <input type="number" min="0" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="เช่น 2.5" />
              </label>
            </div>
          )}


          <label className="form-field">
            <span>หมายเหตุถึง Rider</span>
            <textarea value={noteToRider} onChange={(e) => setNoteToRider(e.target.value)} placeholder="เช่น ถึงแล้วให้โทรหา / ฝากวางหน้าประตู" />
          </label>

          <div className="vehicle-section">
            <div className="section-head">
              <div><div className="section-kicker">Vehicle Type</div><h3>เลือกประเภทรถ</h3></div>
              <span className="pill subtle">เลือกได้ 1 ประเภทต่อทริป</span>
            </div>
            <div className="vehicle-grid">
              {vehicleOptions.map((v) => {
                const active = selectedVehicleId === v.id;
                return (
                  <button key={v.id} type="button" className={`vehicle-card ${active ? "active" : ""}`} onClick={() => { setSelectedVehicleId(v.id); add(v); }}>
                    <div className="vehicle-icon">{v.icon}</div>
                    <div className="vehicle-body">
                      <div className="vehicle-top">
                        <div><div className="vehicle-name">{v.name}</div><div className="vehicle-desc">{v.description}</div></div>
                        {v.badge && <span className="pill">{v.badge}</span>}
                      </div>
                      <div className="vehicle-meta">
                        <span className="vehicle-tag">{v.menu_category}</span>
                        <span className="vehicle-price">เริ่ม {v.price}฿</span>
                      </div>
                    </div>
                    <span className="vehicle-arrow">›</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="planner-footer">
            <div>
              <div className="muted small">ค่าส่งโดยประมาณ</div>
              <div className="price-big">{deliveryPrice} ฿</div>
              <div className="muted small">
                {selectedVehicle?.name} • {count || 1} งาน
                {distanceKm && <> • ~{distanceKm.toFixed(2)} กม.</>}
                {durationText && <> • {durationText}</>}
              </div>
            </div>
            <button type="button" className="primary-btn wide" onClick={checkout} disabled={count === 0 || submitting || !hasPickup || !hasDropoff}>
              {submitting ? "กำลังส่งคำสั่ง..." : "ยืนยันคำสั่งจัดส่ง"}
            </button>
          </div>
        </div>

        <div className="map-pane">
          <div className="map-pane-head">
            <div><div className="section-kicker">Map</div><h3>ปักหมุดบนแผนที่</h3></div>
            <span className="pill subtle">คลิกเพื่อวางหมุด</span>
          </div>
          {geoStatus === "loading" && (
            <div className="muted small" style={{ marginBottom: 8, padding: "6px 10px", background: "#f3f4f6", borderRadius: 8 }}>
              📡 กำลังระบุตำแหน่งปัจจุบัน...
            </div>
          )}
          {geoStatus === "ok" && (
            <div className="muted small" style={{ marginBottom: 8, padding: "6px 10px", background: "#dcfce7", borderRadius: 8, color: "#15803d" }}>
              ✓ ตั้งจุดรับจากตำแหน่งปัจจุบันแล้ว — คลิกแผนที่เพื่อเปลี่ยน
            </div>
          )}
          {geoStatus === "denied" && (
            <div className="muted small" style={{ marginBottom: 8, padding: "6px 10px", background: "#fef9c3", borderRadius: 8, color: "#854d0e" }}>
              ⚠️ ไม่สามารถระบุตำแหน่งได้ — กรุณาปักหมุดจุดรับบนแผนที่เอง
            </div>
          )}
          <MapPicker
            initialPickup={geoPickup}
            swapTrigger={swapTrigger}
            swapPickup={swapCoords.pickup}
            swapDropoff={swapCoords.dropoff}
            onChange={(data) => {
              setLocation({ pickup: data.pickup, dropoff: data.dropoff });
              if (data.pickupAddress) setPickupAddress(data.pickupAddress);
              if (data.dropoffAddress) setDropoffAddress(data.dropoffAddress);
              if (data.routeKm !== null) setDistanceKm(data.routeKm);
              if (data.durationText) setDurationText(data.durationText);
            }}
            activePin={pinFocus}
            onActivePinChange={setPinFocus}
            height={640}
          />
          <div className="map-meta">
            <div className="meta-block"><div className="meta-title">จุดรับ</div><div className="meta-value">{pickupAddress || "ยังไม่ได้กรอก"}</div></div>
            <div className="meta-block"><div className="meta-title">จุดส่ง</div><div className="meta-value">{dropoffAddress || "ยังไม่ได้กรอก"}</div></div>
          </div>
        </div>
      </div>

      {showSchedule && (
        <div className="sheet-backdrop" onClick={() => setShowSchedule(false)}>
          <div className="schedule-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div><div className="section-kicker">Pickup Time</div><h3>เลือกวันและเวลารับพัสดุ</h3></div>
              <button className="ghost" onClick={() => setShowSchedule(false)}>✕</button>
            </div>
            <div className="sheet-body">
              <label className="form-field"><span>วันที่</span><input type="date" value={draftDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDraftDate(e.target.value)} /></label>
              <label className="form-field"><span>เวลา</span><input type="time" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} /></label>
            </div>
            <div className="sheet-actions">
              <button type="button" className="ghost" onClick={() => { setScheduledAt(null); setScheduledLabel("รับทันที (Now)"); setShowSchedule(false); }}>รับทันที</button>
              <button type="button" className="ghost" onClick={() => setShowSchedule(false)}>ยกเลิก</button>
              <button type="button" className="primary-btn" onClick={() => {
                const iso = buildLocalIso(draftDate, draftTime);
                setScheduledAt(iso);
                setScheduledLabel(formatScheduleLabel(iso));
                setShowSchedule(false);
              }}>ยืนยัน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
