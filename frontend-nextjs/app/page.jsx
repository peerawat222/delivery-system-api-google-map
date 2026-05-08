"use client";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const allLinks = [
  { href: "/menu/1", label: "🚀 แพ็กเกจขนส่ง", roles: ["customer", "guest"] },
  { href: "/orders", label: "✅ ออเดอร์ของฉัน", roles: ["customer", "guest"] },
  { href: "/admin", label: "🛠️ Admin", roles: ["admin"] },
  { href: "/rider", label: "🛵 ไดรเวอร์", roles: ["rider", "admin"] },
];

export default function Home() {
  const { user, isLoggedIn, initialized } = useAuth();
  const role = isLoggedIn ? (user?.role || "customer") : "guest";
  const links = allLinks.filter((l) => l.roles.includes(role));

  if (!initialized) return null;

  return (
    <div className="page">
      <h1>แพลตฟอร์มจัดส่งออนดีมานด์</h1>
      <p>เลือกโมดูลที่ต้องการบริหาร</p>
      <div className="home-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="home-btn">{l.label}</Link>
        ))}
      </div>
    </div>
  );
}
