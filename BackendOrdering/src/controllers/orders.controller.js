const pool = require('../config/db');
const https = require('https');

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || "";

const DEFAULT_COMMISSION_RATE = 0.20; // ระบบหัก 20%, rider ได้ 80%

let ensureEventsPromise = null;
function ensureEventsTable() {
  if (!ensureEventsPromise) {
    ensureEventsPromise = pool
      .query(
        `CREATE TABLE IF NOT EXISTS order_events (
          event_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          actor_id INT NULL,
          actor_role VARCHAR(50) NULL,
          event_type VARCHAR(100) NOT NULL,
          message TEXT NULL,
          meta JSON NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY order_id (order_id)
        )`
      )
      .catch((err) => {
        console.error("ensureEventsTable error:", err);
        ensureEventsPromise = null;
      });
  }
  return ensureEventsPromise;
}

let ensureServiceTypePromise = null;
function ensureServiceTypeColumn() {
  if (!ensureServiceTypePromise) {
    ensureServiceTypePromise = (async () => {
      const [cols] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'service_type'`
      );
      if (cols.length === 0) {
        await pool.query(
          `ALTER TABLE orders ADD COLUMN service_type ENUM('passenger','parcel') NOT NULL DEFAULT 'parcel'`
        );
      }
    })().catch((err) => {
      console.error("ensureServiceTypeColumn error:", err);
      ensureServiceTypePromise = null;
    });
  }
  return ensureServiceTypePromise;
}

let ensureOrderColumnsPromise = null;
function ensureOrderColumns() {
  if (!ensureOrderColumnsPromise) {
    ensureOrderColumnsPromise = (async () => {
      const [cols] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'`
      );
      const existing = new Set(cols.map((c) => c.COLUMN_NAME));
      if (!existing.has('commission_rate')) {
        await pool.query(
          `ALTER TABLE orders ADD COLUMN commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.2000`
        );
      }
      if (!existing.has('scheduled_at')) {
        await pool.query(
          `ALTER TABLE orders ADD COLUMN scheduled_at DATETIME DEFAULT NULL`
        );
      }
    })().catch((err) => {
      console.error("ensureOrderColumns error:", err);
      ensureOrderColumnsPromise = null;
    });
  }
  return ensureOrderColumnsPromise;
}

async function fetchRiderInfo(riderId) {
  if (!riderId) return null;
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id AS id, u.full_name, u.phone,
              rp.vehicle_type, rp.plate_number, rp.status AS rider_status
       FROM users u
       LEFT JOIN rider_profiles rp ON rp.rider_id = u.user_id
       WHERE u.user_id = ?`,
      [riderId]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

let ensureProductPromise = null;
function ensureProductTables() {
  if (!ensureProductPromise) {
    ensureProductPromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS product (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          price DECIMAL(10,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_product_order (order_id),
          CONSTRAINT fk_product_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
        )`
      );
      await pool.query(
        `CREATE TABLE IF NOT EXISTS product_details (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          product_name VARCHAR(255) NULL,
          weight_kg DECIMAL(10,2) NULL,
          notes TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_product_details_product (product_id),
          CONSTRAINT fk_product_details_item FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
        )`
      );
    })().catch((err) => {
      console.error("ensureProductTables error:", err);
      ensureProductPromise = null;
    });
  }
  return ensureProductPromise;
}

function toOrderResponse(row, items, riderInfo) {
  const location = {
    pickup_address:  row.pickup_address  || null,
    dropoff_address: row.dropoff_address || null,
    receiver_name:   row.receiver_name   || null,
    receiver_phone:  row.receiver_phone  || null,
    pickup_lat:  row.pickup_lat  != null ? Number(row.pickup_lat)  : null,
    pickup_lng:  row.pickup_lng  != null ? Number(row.pickup_lng)  : null,
    dropoff_lat: row.dropoff_lat != null ? Number(row.dropoff_lat) : null,
    dropoff_lng: row.dropoff_lng != null ? Number(row.dropoff_lng) : null,
    distance_km:    row.distance_km != null ? Number(row.distance_km) : null,
    scheduled_at:   row.scheduled_at   || null,
    scheduled_text: row.scheduled_text || null,
  };
  const totalPrice = Number(row.total_price || 0);
  const commissionRate = row.commission_rate != null ? Number(row.commission_rate) : DEFAULT_COMMISSION_RATE;
  const commissionAmount = Math.round(totalPrice * commissionRate * 100) / 100;
  const riderEarning = Math.round((totalPrice - commissionAmount) * 100) / 100;

  return {
    ...row,
    id: row.order_id,
    order_status: row.status || "created",
    payment_status: row.payment_status || "pending",
    service_type: row.service_type || "parcel",
    location,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    rider_earning: riderEarning,
    items: items || [],
    rider: riderInfo !== undefined ? riderInfo : null,
  };
}

function requireRider(req, res) {
  const role = req.user?.role;
  if (role !== 'rider' && role !== 'admin') {
    res.status(403).json({ message: 'อนุญาตเฉพาะ Rider หรือ Admin' });
    return false;
  }
  return true;
}

function haversineDistanceKm(p1, p2) {
  if (!p1 || !p2) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad((p2.lat || 0) - (p1.lat || 0));
  const dLng = toRad((p2.lng || 0) - (p1.lng || 0));
  const lat1 = toRad(p1.lat || 0);
  const lat2 = toRad(p2.lat || 0);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function fetchDirectionsDistance(pickup, dropoff) {
  return new Promise((resolve) => {
    if (!GOOGLE_MAPS_KEY || !pickup || !dropoff) return resolve(null);
    const origin = `${pickup.lat},${pickup.lng}`;
    const destination = `${dropoff.lat},${dropoff.lng}`;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_KEY}`;

    https
      .get(url, (resp) => {
        let data = "";
        resp.on("data", (chunk) => (data += chunk));
        resp.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.status !== "OK" || !json.routes?.length) {
              return resolve(null);
            }
            const leg = json.routes[0].legs?.[0];
            if (!leg) return resolve(null);
            resolve({
              distance_km: leg.distance?.value ? leg.distance.value / 1000 : null,
              duration_min: leg.duration?.value ? leg.duration.value / 60 : null,
            });
          } catch (err) {
            console.error("parse directions error", err);
            resolve(null);
          }
        });
      })
      .on("error", (err) => {
        console.error("directions http error", err);
        resolve(null);
      });
  });
}

async function logEvent(orderId, { actorId, actorRole, eventType, message, meta }) {
  await ensureEventsTable();
  try {
    await pool.query(
      `INSERT INTO order_events (order_id, actor_id, actor_role, event_type, message, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        orderId,
        actorId ?? null,
        actorRole ?? null,
        eventType,
        message || null,
        meta ? JSON.stringify(meta) : null,
      ]
    );
  } catch (err) {
    console.error("logEvent error:", err);
  }
}

function normalizePaymentMethod(method) {
  if (!method) return null;
  const upper = String(method).toUpperCase();
  if (["COD", "QR", "TRANSFER"].includes(upper)) return upper;
  return null;
}

exports.createOrder = async (req, res) => {
  const {
    service_type,
    items,
    location,
    pickup_address,
    dropoff_address,
    receiver_name,
    receiver_phone,
    scheduled_at,
    scheduled_text,
    payment_method,
  } = req.body;

  const allowedVehicleTypes = ['motorcycle', 'sedan', 'hatchback', 'suv', 'pickup', 'van'];
  const rawVehicleType = (req.body.vehicle_type || items?.[0]?.product_name || '').split(' ')[0].toLowerCase();
  const normalizedVehicleType = allowedVehicleTypes.includes(rawVehicleType) ? rawVehicleType : null;
  if (!normalizedVehicleType) {
    return res.status(400).json({ message: "กรุณาเลือกประเภทรถ" });
  }

  const serviceType = service_type === 'passenger' ? 'passenger' : 'parcel';
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ" });
  }

  const customerId = req.user?.id;
  if (!customerId) {
    return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  }

  const pickupCoord = location?.pickup || {
    lat: location?.pickup_lat,
    lng: location?.pickup_lng,
  };
  const dropoffCoord = location?.dropoff || {
    lat: location?.dropoff_lat ?? location?.lat,
    lng: location?.dropoff_lng ?? location?.lng,
  };

  const hasPickup =
    pickupCoord &&
    Number.isFinite(pickupCoord.lat) &&
    Number.isFinite(pickupCoord.lng);
  const hasDropoff =
    dropoffCoord &&
    Number.isFinite(dropoffCoord.lat) &&
    Number.isFinite(dropoffCoord.lng);

  if (!hasPickup || !hasDropoff) {
    return res.status(400).json({ message: "กรุณาปักหมุดจุดรับและจุดส่ง" });
  }
  if (!pickup_address || !dropoff_address) {
    return res.status(400).json({ message: "กรอกที่อยู่รับ/ส่งให้ครบ" });
  }

  await ensureServiceTypeColumn();
  await ensureOrderColumns();
  await ensureProductTables();

  const normalizedItems = items.map((item) => ({
    quantity: Number(item.quantity || item.qty || 1),
    price: Number(item.price || 0),
    product_name: item.product_name || item.name || "พัสดุ",
    weight_kg: Number(item.weight_kg || item.weight || 0) || null,
    notes: item.notes || null,
  }));

  const total = normalizedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const weightKg = normalizedItems.find((i) => i.weight_kg)?.weight_kg || null;

  let distanceInfo = null;
  try {
    distanceInfo = await fetchDirectionsDistance(pickupCoord, dropoffCoord);
  } catch {
    distanceInfo = null;
  }
  if (!distanceInfo) {
    const distKm = haversineDistanceKm(pickupCoord, dropoffCoord);
    distanceInfo = { distance_km: distKm, duration_min: null };
  }

  const paymentMethod = normalizePaymentMethod(payment_method || location?.payment_method) || 'QR';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (customer_id, vehicle_type, total_price, payment_method, payment_status, status, service_type,
         pickup_address, dropoff_address, receiver_name, receiver_phone,
         pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km,
         commission_rate, scheduled_at, scheduled_text)
       VALUES (?, ?, ?, ?, 'pending', 'created', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId, normalizedVehicleType, total, paymentMethod, serviceType,
        pickup_address || null, dropoff_address || null,
        receiver_name || null, receiver_phone || null,
        pickupCoord?.lat ?? null, pickupCoord?.lng ?? null,
        dropoffCoord?.lat ?? null, dropoffCoord?.lng ?? null,
        distanceInfo?.distance_km ?? null,
        DEFAULT_COMMISSION_RATE,
        scheduled_at || null,
        scheduled_text || null,
      ]
    );

    const orderId = orderResult.insertId;

    const values = normalizedItems.map((i) => [orderId, i.quantity, i.price]);
    const [itemsResult] = await conn.query(
      `INSERT INTO product (order_id, quantity, price)
       VALUES ?`,
      [values]
    );

    const firstItemId = itemsResult.insertId;
    const detailRows = normalizedItems.map((i, idx) => [
      firstItemId + idx,
      i.product_name,
      i.weight_kg,
      i.notes,
    ]);
    if (detailRows.length > 0) {
      await conn.query(
        `INSERT INTO product_details (product_id, product_name, weight_kg, notes) VALUES ?`,
        [detailRows]
      );
    }

    await conn.commit();

    await logEvent(orderId, {
      actorId: customerId,
      actorRole: req.user?.role,
      eventType: "created",
      message: "สร้างคำสั่งซื้อ",
      meta: { total, pickup_address, dropoff_address },
    });

    res.status(201).json({
      message: 'สร้างคำสั่งซื้อสำเร็จ',
      order_id: orderId,
      id: orderId,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  } finally {
    conn.release();
  }
};

exports.getAssignedOrders = async (req, res) => {
  if (!requireRider(req, res)) return;
  const riderId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT o.*, o.order_id AS id
       FROM orders o
       WHERE o.rider_id = ?
       ORDER BY o.created_at DESC`,
      [riderId]
    );
    const mapped = rows.map((row) => toOrderResponse(row));
    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};

exports.getAvailableOrders = async (req, res) => {
  if (!requireRider(req, res)) return;

  const riderId = req.user.id;

  try {
    const [riderRows] = await pool.query(
      `SELECT vehicle_type FROM rider_profiles WHERE rider_id = ?`,
      [riderId]
    );

    if (riderRows.length === 0 || !riderRows[0].vehicle_type) {
      return res.status(400).json({ message: "ไม่พบประเภทรถของ rider" });
    }

    const riderVehicle = riderRows[0].vehicle_type;

    const [rows] = await pool.query(
      `SELECT o.*, o.order_id AS id
       FROM orders o
       WHERE o.rider_id IS NULL
         AND o.status = 'waiting_rider'
         AND o.payment_status = 'paid'
         AND LOWER(o.vehicle_type) = LOWER(?)
       ORDER BY o.created_at ASC`,
      [riderVehicle]
    );

    res.json(rows.map((row) => toOrderResponse(row)));
  } catch (err) {
    console.error("GET AVAILABLE ORDERS ERROR:", err);
    res.status(500).json({ message: err.message || "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
  }
};

exports.claimOrder = async (req, res) => {
  if (!requireRider(req, res)) return;
  const riderId = req.user.id;
  const orderId = Number(req.params.id);
  try {
    const [rows] = await pool.query(
      `SELECT order_id, rider_id, status FROM orders WHERE order_id=?`,
      [orderId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบออเดอร์" });
    const order = rows[0];
    if (order.rider_id) {
      return res.status(400).json({ message: "มีผู้รับงานแล้ว" });
    }
    if (order.status !== "waiting_rider") {
      return res.status(400).json({ message: "ออเดอร์ยังไม่พร้อมให้ไรเดอร์รับ" });
    }
    await pool.query(
      `UPDATE orders SET rider_id = ?, status = 'delivering' WHERE order_id = ?`,
      [riderId, orderId]
    );
    await logEvent(orderId, {
      actorId: riderId,
      actorRole: req.user?.role,
      eventType: "driver_claimed",
      message: "ไรเดอร์รับงาน",
    });
    const [detailRows] = await pool.query(
      `SELECT o.*, o.order_id AS id
       FROM orders o
       WHERE o.order_id = ?`,
      [orderId]
    );
    res.json({ message: "รับงานสำเร็จ", order: toOrderResponse(detailRows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};

exports.updateStatusRider = async (req, res) => {
  if (!requireRider(req, res)) return;
  const { id } = req.params;
  const { order_status } = req.body;
  const allowed = ["picking_up", "delivering", "completed"];
  if (!allowed.includes(order_status)) {
    return res.status(400).json({ message: "สถานะไม่ถูกต้อง" });
  }
  try {
    const riderId = req.user.id;
    const [rows] = await pool.query(`SELECT rider_id FROM orders WHERE order_id=?`, [id]);
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบออเดอร์" });
    if (rows[0].rider_id !== riderId && req.user.role !== "admin") {
      return res.status(403).json({ message: "คุณไม่ได้รับงานนี้" });
    }
    await pool.query(`UPDATE orders SET status=? WHERE order_id=?`, [order_status, id]);
    await logEvent(id, {
      actorId: riderId,
      actorRole: req.user?.role,
      eventType: `status_${order_status}`,
      message: `อัปเดตสถานะ: ${order_status}`,
    });
    res.json({ message: "อัปเดตสถานะสำเร็จ" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};

exports.payOrder = async (req, res) => {
  const orderId = Number(req.params.id);
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const paymentMethodBody = req.body?.payment_method;

  if (!userId) {
    return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  }
  if (!orderId) {
    return res.status(400).json({ message: "order_id ไม่ถูกต้อง" });
  }

  try {
    const [rows] = await pool.query(`SELECT * FROM orders WHERE order_id = ?`, [orderId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบคำสั่งซื้อ" });
    }

    const order = rows[0];
    const isOwner = order.customer_id === userId;
    const isAdmin = userRole === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์ชำระออเดอร์นี้" });
    }

    if (order.payment_status === "paid") {
      return res.json({
        message: "คำสั่งซื้อนี้ชำระเงินแล้ว",
        order_id: orderId,
        payment_status: "paid",
      });
    }

    const paymentMethod = normalizePaymentMethod(paymentMethodBody || order.payment_method) || "QR";
    const amount = Number(order.total_price || 0);

    await pool.query(
      `UPDATE orders 
       SET payment_status = 'paid',
           status = IF(status = 'created', 'waiting_rider', status),
           payment_method = COALESCE(?, payment_method, 'QR'),
           paid_at = NOW()
       WHERE order_id = ?`,
      [paymentMethod, orderId]
    );

    await pool.query(
      `INSERT INTO payments (order_id, amount, payment_method, status, paid_at)
       VALUES (?, ?, ?, 'paid', NOW())`,
      [orderId, amount, paymentMethod]
    );
    await logEvent(orderId, {
      actorId: userId,
      actorRole: userRole,
      eventType: "paid",
      message: "ชำระเงินแล้ว",
    });

    return res.json({
      message: "ชำระเงินสำเร็จ",
      order_id: orderId,
      payment_status: "paid",
      status: order.status === "created" ? "waiting_rider" : order.status,
      rider_id: order.rider_id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
  }
};

exports.getMyOrders = async (req, res) => {
  const customerId = req.user?.id;
  if (!customerId) {
    return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  }

  try {
    const [orders] = await pool.query(
      `SELECT o.*, o.order_id AS id
       FROM orders o
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`,
      [customerId]
    );

    const orderIds = orders.map((o) => o.order_id);
    let itemsByOrder = {};
    let riderMap = {};

    if (orderIds.length > 0) {
      await ensureProductTables();
      const [items] = await pool.query(
        `SELECT p.*,
                d.product_name, d.weight_kg, d.notes
         FROM product p
         LEFT JOIN product_details d ON d.product_id = p.id
         WHERE p.order_id IN (?)`,
        [orderIds]
      );
      itemsByOrder = items.reduce((acc, item) => {
        if (!acc[item.order_id]) acc[item.order_id] = [];
        acc[item.order_id].push(item);
        return acc;
      }, {});
    }

    const riderIds = [...new Set(orders.filter((o) => o.rider_id).map((o) => o.rider_id))];
    if (riderIds.length > 0) {
      const [riderRows] = await pool.query(
        `SELECT u.user_id AS id, u.full_name, u.phone,
                rp.vehicle_type, rp.plate_number, rp.status AS rider_status
         FROM users u
         LEFT JOIN rider_profiles rp ON rp.rider_id = u.user_id
         WHERE u.user_id IN (?)`,
        [riderIds]
      );
      riderMap = riderRows.reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
    }

    const result = orders.map((o) => toOrderResponse(o, itemsByOrder[o.order_id] || [], riderMap[o.rider_id] || null));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};

exports.getOrderDetail = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const orderId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  }
  if (!orderId) {
    return res.status(400).json({ message: "order_id ไม่ถูกต้อง" });
  }

  try {
    const [orders] = await pool.query(`SELECT o.*, o.order_id AS id FROM orders o WHERE o.order_id = ?`, [orderId]);
    if (orders.length === 0) {
      return res.status(404).json({ message: "ไม่พบออเดอร์" });
    }

    const order = orders[0];
    const isOwner = order.customer_id === userId;
    const isAdmin = role === "admin";
    const isRider = role === "rider" && order.rider_id === userId;

    if (!isOwner && !isAdmin && !isRider) {
      return res.status(403).json({ message: "ดูได้เฉพาะออเดอร์ของตัวเอง" });
    }

    await ensureProductTables();
    const [items] = await pool.query(
      `SELECT p.*,
              d.product_name, d.weight_kg, d.notes
       FROM product p
       LEFT JOIN product_details d ON d.product_id = p.id
       WHERE p.order_id = ?`,
      [orderId]
    );

    const riderInfo = await fetchRiderInfo(order.rider_id);
    return res.json(toOrderResponse(order, items, riderInfo));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
  }
};

exports.getOrderEvents = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const orderId = Number(req.params.id);

  if (!userId) return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  if (!orderId) return res.status(400).json({ message: "order_id ไม่ถูกต้อง" });

  try {
    const [orders] = await pool.query(`SELECT order_id, customer_id, rider_id FROM orders WHERE order_id=?`, [orderId]);
    if (orders.length === 0) return res.status(404).json({ message: "ไม่พบออเดอร์" });

    const order = orders[0];
    const isOwner = order.customer_id === userId;
    const isAdmin = role === "admin";
    const isRider = role === "rider" && order.rider_id === userId;

    if (!isOwner && !isAdmin && !isRider) {
      return res.status(403).json({ message: "ดูได้เฉพาะออเดอร์ของตัวเอง" });
    }

    await ensureEventsTable();
    const [events] = await pool.query(
      `SELECT event_id AS id, order_id, event_type, message, meta, created_at
       FROM order_events WHERE order_id = ? ORDER BY created_at ASC, event_id ASC`,
      [orderId]
    );
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
  }
};

exports.updateSchedule = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const orderId = Number(req.params.id);
  const { scheduled_at, scheduled_text } = req.body;

  if (!userId) return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  if (!orderId) return res.status(400).json({ message: "order_id ไม่ถูกต้อง" });

  try {
    const [rows] = await pool.query(`SELECT customer_id FROM orders WHERE order_id = ?`, [orderId]);
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบออเดอร์" });

    const isOwner = rows[0].customer_id === userId;
    const isAdmin = role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "แก้ไขได้เฉพาะออเดอร์ของตัวเอง" });
    }

    await pool.query(
      `UPDATE orders SET scheduled_at = ?, scheduled_text = ? WHERE order_id = ?`,
      [scheduled_at || null, scheduled_text || null, orderId]
    );
    await logEvent(orderId, {
      actorId: userId,
      actorRole: role,
      eventType: "scheduled",
      message: scheduled_at ? `ตั้งเวลารับ ${scheduled_at}` : "ตั้งเป็นรับทันที",
      meta: { scheduled_at, scheduled_text },
    });

    res.json({ message: "อัปเดตเวลารับสำเร็จ", scheduled_at, scheduled_text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
  }
};

exports.getRiderProfile = async (req, res) => {
  const riderId = req.user?.id;
  if (!riderId) return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });

  try {
    const [rows] = await pool.query(
      `SELECT u.user_id AS id, u.full_name, u.email, u.phone,
              rp.vehicle_type, rp.plate_number, rp.status AS rider_status
       FROM users u
       LEFT JOIN rider_profiles rp ON rp.rider_id = u.user_id
       WHERE u.user_id = ?`,
      [riderId]
    );
    res.json(rows[0] || { id: riderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};

exports.updateRiderProfile = async (req, res) => {
  const riderId = req.user?.id;
  if (!riderId) return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  if (req.user.role !== 'rider' && req.user.role !== 'admin') {
    return res.status(403).json({ message: "สำหรับ Rider เท่านั้น" });
  }

  const { vehicle_type, plate_number } = req.body;
  if (!vehicle_type || !plate_number) {
    return res.status(400).json({ message: "กรุณากรอกประเภทรถและเลขทะเบียน" });
  }

  try {
    const [existing] = await pool.query(
      `SELECT rider_id FROM rider_profiles WHERE rider_id = ?`,
      [riderId]
    );
    if (existing.length > 0) {
      await pool.query(
        `UPDATE rider_profiles SET vehicle_type = ?, plate_number = ? WHERE rider_id = ?`,
        [vehicle_type, plate_number, riderId]
      );
    } else {
      await pool.query(
        `INSERT INTO rider_profiles (rider_id, vehicle_type, plate_number, status) VALUES (?, ?, ?, 'available')`,
        [riderId, vehicle_type, plate_number]
      );
    }
    res.json({ message: "อัปเดตโปรไฟล์สำเร็จ", vehicle_type, plate_number });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
};

exports.getRiderEarnings = async (req, res) => {
  const riderId = req.user?.id;
  if (!riderId) return res.status(401).json({ message: "ต้องเข้าสู่ระบบก่อน" });
  if (req.user.role !== "rider" && req.user.role !== "admin") {
    return res.status(403).json({ message: "สำหรับ Rider เท่านั้น" });
  }

  const { from, to } = req.query;
  const params = [riderId];
  let dateWhere = "";
  if (from) { dateWhere += " AND DATE(o.updated_at) >= ?"; params.push(from); }
  if (to)   { dateWhere += " AND DATE(o.updated_at) <= ?"; params.push(to); }

  try {
    const CR = "IFNULL(o.commission_rate, 0.20)";

    const [[summary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(o.total_price), 0) AS gross_total,
         COALESCE(SUM(o.total_price * ${CR}), 0) AS commission_total,
         COALESCE(SUM(o.total_price * (1 - ${CR})), 0) AS net_total
       FROM orders o
       WHERE o.rider_id = ? AND o.status = 'completed'${dateWhere}`,
      params
    );

    const [[today]] = await pool.query(
      `SELECT
         COUNT(*) AS order_count,
         COALESCE(SUM(o.total_price), 0) AS gross,
         COALESCE(SUM(o.total_price * ${CR}), 0) AS commission,
         COALESCE(SUM(o.total_price * (1 - ${CR})), 0) AS net
       FROM orders o
       WHERE o.rider_id = ? AND o.status = 'completed' AND DATE(o.updated_at) = CURDATE()`,
      [riderId]
    );

    const [history] = await pool.query(
      `SELECT
         DATE(o.updated_at) AS date,
         COUNT(*) AS order_count,
         ROUND(SUM(o.total_price), 2) AS gross,
         ROUND(COALESCE(SUM(o.total_price * ${CR}), 0), 2) AS commission,
         ROUND(COALESCE(SUM(o.total_price * (1 - ${CR})), 0), 2) AS net
       FROM orders o
       WHERE o.rider_id = ? AND o.status = 'completed'${dateWhere}
       GROUP BY DATE(o.updated_at)
       ORDER BY date DESC
       LIMIT 90`,
      params
    );

    res.json({
      summary: {
        total_orders: Number(summary.total_orders),
        gross_total:  Number(summary.gross_total),
        commission_total: Number(summary.commission_total),
        net_total: Number(summary.net_total),
      },
      today: {
        order_count: Number(today.order_count),
        gross: Number(today.gross),
        commission: Number(today.commission),
        net: Number(today.net),
      },
      history,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
  }
};
