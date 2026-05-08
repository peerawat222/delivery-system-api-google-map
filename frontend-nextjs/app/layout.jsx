import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "logisTix — ระบบจัดส่งออนดีมานด์",
  description: "แพลตฟอร์มจัดส่งพัสดุและรับส่งผู้โดยสารออนดีมานด์",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
