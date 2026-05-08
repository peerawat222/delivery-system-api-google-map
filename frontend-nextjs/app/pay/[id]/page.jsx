"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Pay() {
  const { id } = useParams();
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [order, setOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isLoggedIn) return;
    setLoadingOrder(true);
    apiFetch("/orders/my")
      .then((orders) => {
        const found = Array.isArray(orders) ? orders.find((o) => String(o.id) === String(id)) : null;
        if (!found) setErr("ไม่พบคำสั่งซื้อของคุณ");
        setOrder(found || null);
      })
      .catch((e) => setErr(e.message || "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoadingOrder(false));
  }, [id, isLoggedIn]);

  const payNow = async () => {
    if (!isLoggedIn) { router.push("/login"); return; }
    if (order && (order.payment_status || "pending") === "paid") { alert("ชำระเงินแล้ว"); router.push("/orders"); return; }
    setLoading(true);
    try {
      await apiFetch(`/orders/${id}/pay`, { method: "POST" });
      alert("ชำระเงินสำเร็จ!");
      router.push("/orders");
    } catch (e) {
      alert("จ่ายไม่สำเร็จ: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const qrUrl = useMemo(() => {
    const payload = `PAY|ORDER=${id}|AMOUNT=${order?.total_price ?? "N/A"}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
  }, [id, order]);

  if (!isLoggedIn) {
    return (
      <div className="page">
        <h2>ชำระค่าขนส่ง</h2>
        <p className="error">กรุณาเข้าสู่ระบบก่อน</p>
        <button className="link-btn" onClick={() => router.push("/login")}>ไปหน้าเข้าสู่ระบบ</button>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>ชำระค่าขนส่ง</h2>
      <p className="muted">สแกน QR เพื่อชำระ แล้วกดยืนยัน</p>

      <div className="card" style={{ maxWidth: 360 }}>
        <div>Order ID: {id}</div>
        {order && <div>ยอดชำระ: <strong>{order.total_price} ฿</strong></div>}
        {order && <div>สถานะ: {(order.payment_status || "pending").toUpperCase()}</div>}
        {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
        {loadingOrder && <div className="muted">กำลังโหลด...</div>}

        <div style={{ marginTop: 12, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR ชำระค่าขนส่ง" style={{ width: 220, height: 220, borderRadius: 8 }} />
        </div>

        <button style={{ marginTop: 12 }} onClick={payNow} disabled={loading || (!order && !err)}>
          {loading ? "กำลังยืนยัน..." : "ยืนยันการชำระ"}
        </button>
        <button style={{ marginTop: 8 }} className="ghost danger" onClick={() => router.push("/orders")} disabled={loading}>
          ยกเลิกการชำระ
        </button>
      </div>
    </div>
  );
}
