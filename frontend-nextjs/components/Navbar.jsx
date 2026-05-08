"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoggedIn, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const linkClass = (href) =>
    "nav-link" + (pathname === href || pathname.startsWith(href + "/") ? " active" : "");

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const role = user?.role;

  return (
    <nav className="navbar">
      <Link href="/" className="brand">
        🚚 logisTix
      </Link>

      <div className="nav-links">
        <Link href="/menu/1" className={linkClass("/menu")}>
          📦 แพ็กเกจขนส่ง
        </Link>

        <Link href="/orders" className={linkClass("/orders")}>
          ✅ ออเดอร์ของฉัน
        </Link>

        {mounted && role === "rider" && (
          <Link href="/rider" className={linkClass("/rider")}>
            🛵 Rider
          </Link>
        )}

        {mounted && role === "admin" && (
          <Link href="/admin" className={linkClass("/admin")}>
            🛠️ Admin
          </Link>
        )}

        {!mounted || !isLoggedIn ? (
          <Link href="/login" className={linkClass("/login")}>
            🔑 เข้าสู่ระบบ
          </Link>
        ) : (
          <button type="button" className="nav-link ghost" onClick={handleLogout}>
            🚪 ออกจากระบบ
          </button>
        )}
      </div>

      <div className="right-box">
        {mounted && isLoggedIn && (
          <div className="user-chip" title={user?.email}>
            👤 {user?.full_name || user?.email}
          </div>
        )}
      </div>
    </nav>
  );
}
