"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "customer",
    plate_number: "",
    vehicle_type: "",
  });

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
      router.push("/");
    } catch (err) {
      alert(err.message || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h2 className="auth-title">
          {mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </h2>

        <form className="form-card" onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <label className="form-field">
                <span>ชื่อ-สกุล</span>
                <input type="text" name="full_name" value={form.full_name} onChange={onChange} required placeholder="เช่น สมชาย ใจดี" />
              </label>
              <label className="form-field">
                <span>บทบาท</span>
                <select name="role" value={form.role} onChange={onChange}>
                  <option value="customer">Customer</option>
                  <option value="rider">Rider</option>
                </select>
              </label>
              {form.role === "rider" && (
                <>
                  <label className="form-field">
                    <span>เลขทะเบียนรถ</span>
                    <input type="text" name="plate_number" value={form.plate_number} onChange={onChange} required placeholder="เช่น กข 1234 กรุงเทพฯ" />
                  </label>
                  <label className="form-field">
                    <span>ประเภทรถ</span>
                    <select name="vehicle_type" value={form.vehicle_type} onChange={onChange} required>
                      <option value="">เลือกประเภทรถ</option>
                      <option value="motorcycle">Motorcycle</option>
                      <option value="sedan">Sedan</option>
                      <option value="hatchback">Hatchback</option>
                      <option value="suv">SUV</option>
                    </select>
                  </label>
                </>
              )}
            </>
          )}

          <label className="form-field">
            <span>Email</span>
            <input type="email" name="email" value={form.email} onChange={onChange} required placeholder="you@example.com" />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input type="password" name="password" value={form.password} onChange={onChange} required placeholder="••••••••" />
          </label>

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        </form>

        <div className="muted auth-switch">
          {mode === "login" ? (
            <>ยังไม่มีบัญชี?{" "}
              <button className="link-button" type="button" onClick={() => setMode("register")}>สมัครสมาชิก</button>
            </>
          ) : (
            <>มีบัญชีอยู่แล้ว?{" "}
              <button className="link-button" type="button" onClick={() => setMode("login")}>กลับไปล็อกอิน</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
