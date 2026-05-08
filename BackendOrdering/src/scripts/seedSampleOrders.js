const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: process.env.DOTENV_PATH || ".env/.env" });

const {
  DB_HOST = "localhost",
  DB_PORT = 3306,
  DB_USER = "root",
  DB_PASSWORD,
  DB_PASS,
  DB_NAME = "logis_db",
} = process.env;

const DB_AUTH_PASSWORD = DB_PASSWORD ?? DB_PASS ?? "12345678";

async function ensureUser(conn, { email, full_name, role, password }) {
  const [rows] = await conn.query("SELECT user_id FROM users WHERE email = ?", [
    email,
  ]);
  if (rows.length > 0) return rows[0].user_id;
  const password_hash = await bcrypt.hash(password, 10);
  const [result] = await conn.query(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)",
    [full_name, email, password_hash, role]
  );
  return result.insertId;
}

async function seedOrder(conn, { customerId, riderId }) {
  const [existing] = await conn.query("SELECT COUNT(*) AS cnt FROM orders");
  if (existing[0].cnt > 0) {
    console.log("Order history already exists; skipping seed.");
    return;
  }

  const location = {
    pickup_address: "170/20 หมู่บ้าน 3 แขวงลาดพร้าว",
    dropoff_address: "สยามสแควร์ ซอย 2",
    receiver_name: "คุณลูกค้า",
    receiver_phone: "081-999-0000",
    pickup_lat: 13.804,
    pickup_lng: 100.589,
    dropoff_lat: 13.746,
    dropoff_lng: 100.534,
    distance_km: 9.1,
    duration_min: 27,
    parcel_type: "เอกสาร",
    note_to_rider: "ฝากโทรก่อนถึง",
  };

  const [orderResult] = await conn.query(
    `INSERT INTO orders (
      customer_id, rider_id, vehicle_type, service_type,
      receiver_name, receiver_phone,
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      distance_km, total_price,
      payment_method, payment_status, status,
      commission_rate, paid_at
    ) VALUES (?, ?, 'motorcycle', 'parcel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivering', 0.2000, NOW())`,
    [
      customerId, riderId,
      location.receiver_name, location.receiver_phone,
      location.pickup_address, location.pickup_lat, location.pickup_lng,
      location.dropoff_address, location.dropoff_lat, location.dropoff_lng,
      location.distance_km, 49,
      "QR", "paid",
    ]
  );

  const orderId = orderResult.insertId;

  await conn.query(
    `INSERT INTO product (order_id, quantity, price)
     VALUES (?, 1, ?)`,
    [orderId, 49]
  );

  const [productRows] = await conn.query(
    `SELECT id FROM product WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
    [orderId]
  );
  if (productRows.length > 0) {
    await conn.query(
      `INSERT INTO product_details (product_id, product_name, weight_kg, notes)
       VALUES (?, ?, ?, ?)`,
      [productRows[0].id, "Motorcycle (ส่งด่วน)", 3.2, location.note_to_rider]
    );
  }

  await conn.query(
    `INSERT INTO payments (order_id, amount, payment_method, status, paid_at)
     VALUES (?, ?, ?, 'paid', NOW())`,
    [orderId, 49, "QR"]
  );

  await conn.query(
    `INSERT INTO order_events (order_id, event_type, message, actor_role, actor_id, meta)
     VALUES (?, 'created', 'สร้างคำสั่งซื้อ', 'customer', ?, ?),
            (?, 'paid', 'ชำระเงินแล้ว', 'customer', ?, NULL),
            (?, 'status_delivering', 'ไรเดอร์กำลังจัดส่ง', 'rider', ?, NULL)`,
    [orderId, customerId, JSON.stringify({ step: "created" }),
     orderId, customerId,
     orderId, riderId]
  );

  console.log(`Seeded order #${orderId} for customer ${customerId} / rider ${riderId}`);
}

async function run() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_AUTH_PASSWORD,
    database: DB_NAME,
  });

  try {
    await ensureUser(connection, {
      email: "admin@example.com",
      full_name: "Admin System",
      role: "admin",
      password: "admin1234",
    });
    console.log("Admin user ready: admin@example.com / admin1234");

    const customerId = await ensureUser(connection, {
      email: "customer@example.com",
      full_name: "Customer Demo",
      role: "customer",
      password: "password123",
    });

    const riderId = await ensureUser(connection, {
      email: "rider@example.com",
      full_name: "สมชาย ขับดี",
      role: "rider",
      password: "password123",
    });

    // สร้าง rider profile ถ้ายังไม่มี
    const [rp] = await connection.query(
      `SELECT rider_id FROM rider_profiles WHERE rider_id = ?`,
      [riderId]
    );
    if (rp.length === 0) {
      await connection.query(
        `INSERT INTO rider_profiles (rider_id, vehicle_type, plate_number, status) VALUES (?, ?, ?, 'available')`,
        [riderId, 'Motorcycle', 'กข-1234']
      );
      console.log(`Created rider_profile for rider #${riderId}`);
    }

    await seedOrder(connection, { customerId, riderId });
  } finally {
    await connection.end();
  }
}

run().catch((err) => {
  console.error("Seed sample orders failed:", err);
  process.exit(1);
});
