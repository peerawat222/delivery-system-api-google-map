const pool = require('../config/db');
const bcrypt = require('bcrypt');

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
        console.error('ensureEventsTable error:', err);
        ensureEventsPromise = null;
      });
  }
  return ensureEventsPromise;
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
      console.error('ensureProductTables error:', err);
      ensureProductPromise = null;
    });
  }
  return ensureProductPromise;
}

exports.getSummary = async (_req, res) => {
  try {
    const [[stats]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users)                                                                    AS total_users,
        (SELECT COUNT(*) FROM orders)                                                                   AS total_orders,
        (SELECT COUNT(*) FROM orders WHERE status IN ('assigned','picking_up','delivering'))            AS active_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'waiting_rider')                                   AS waiting_rider,
        (SELECT COALESCE(SUM(total_price),0) FROM orders WHERE status='completed'
          AND DATE(created_at)=CURDATE())                                                              AS revenue_today,
        (SELECT COUNT(*) FROM orders WHERE status='completed' AND DATE(created_at)=CURDATE())          AS completed_today,
        (SELECT COUNT(*) FROM users WHERE role='rider')                                                AS total_riders
    `);
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};

exports.getAllUsers = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.user_id AS id, u.full_name, u.email, u.role, u.created_at,
             rp.vehicle_type, rp.plate_number, rp.status AS rider_status
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.rider_id = u.user_id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};

exports.createUser = async (req, res) => {
  const { full_name, email, password, role = 'customer' } = req.body;
  const validRoles = ['customer', 'rider', 'admin'];
  if (!email || !password) return res.status(400).json({ message: 'กรุณากรอก email และ password' });
  if (!validRoles.includes(role)) return res.status(400).json({ message: 'role ไม่ถูกต้อง' });

  try {
    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ message: 'email นี้ถูกใช้แล้ว' });

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [full_name || email, email, password_hash, role]
    );
    const userId = result.insertId;

    if (role === 'rider') {
      await pool.query(
        `INSERT IGNORE INTO rider_profiles (rider_id, status) VALUES (?, 'available')`,
        [userId]
      );
    }
    res.status(201).json({ message: 'สร้างผู้ใช้สำเร็จ', id: userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.changeUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const validRoles = ['customer', 'rider', 'admin'];
  if (!validRoles.includes(role)) return res.status(400).json({ message: 'role ไม่ถูกต้อง' });

  try {
    const [result] = await pool.query('UPDATE users SET role = ? WHERE user_id = ?', [role, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });

    if (role === 'rider') {
      await pool.query(
        `INSERT IGNORE INTO rider_profiles (rider_id, status) VALUES (?, 'available')`,
        [id]
      );
    }
    res.json({ message: 'เปลี่ยนบทบาทสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user?.id) {
    return res.status(400).json({ message: 'ไม่สามารถลบบัญชีตัวเองได้' });
  }
  try {
    const [result] = await pool.query('DELETE FROM users WHERE user_id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    res.json({ message: 'ลบผู้ใช้สำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.updateRiderProfile = async (req, res) => {
  const { id } = req.params;
  const { vehicle_type, plate_number } = req.body;
  const allowed = ['Motorcycle', 'Sedan', 'Hatchback', 'SUV', 'Pickup', 'Van'];
  if (!vehicle_type || !plate_number) return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });
  if (!allowed.includes(vehicle_type)) return res.status(400).json({ message: 'ประเภทรถไม่ถูกต้อง' });
  try {
    const [userRows] = await pool.query('SELECT role FROM users WHERE user_id = ?', [id]);
    if (userRows.length === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    if (userRows[0].role !== 'rider') return res.status(400).json({ message: 'ผู้ใช้นี้ไม่ใช่ rider' });
    const [existing] = await pool.query('SELECT rider_id FROM rider_profiles WHERE rider_id = ?', [id]);
    if (existing.length > 0) {
      await pool.query('UPDATE rider_profiles SET vehicle_type = ?, plate_number = ? WHERE rider_id = ?', [vehicle_type, plate_number, id]);
    } else {
      await pool.query("INSERT INTO rider_profiles (rider_id, vehicle_type, plate_number, status) VALUES (?, ?, ?, 'available')", [id, vehicle_type, plate_number]);
    }
    res.json({ message: 'อัปเดตข้อมูลรถสำเร็จ', vehicle_type, plate_number });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.getAllRiders = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.user_id AS id, u.full_name, u.email,
             rp.vehicle_type, rp.plate_number, rp.status AS availability
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.rider_id = u.user_id
      WHERE u.role IN ('rider','admin')
      ORDER BY u.full_name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.getAllOrders = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        o.order_id AS id,
        o.status,
        o.payment_status,
        o.total_price,
        o.service_type,
        o.created_at,
        o.updated_at,
        o.rider_id,
        o.customer_id,
        o.pickup_address,
        o.dropoff_address,
        o.receiver_name,
        o.receiver_phone,
        c.full_name  AS customer_name,
        c.email      AS customer_email,
        r.full_name  AS rider_name,
        r.email      AS rider_email,
        rp.vehicle_type,
        rp.plate_number
      FROM orders o
      LEFT JOIN users c  ON c.user_id  = o.customer_id
      LEFT JOIN users r  ON r.user_id  = o.rider_id
      LEFT JOIN rider_profiles rp ON rp.rider_id = o.rider_id
      ORDER BY o.created_at DESC
      LIMIT 300
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.assignRider = async (req, res) => {
  const orderId = Number(req.params.id);
  const { rider_id } = req.body;
  if (!orderId || !rider_id) return res.status(400).json({ message: 'กรุณาระบุ rider_id' });

  try {
    const [riders] = await pool.query(
      `SELECT user_id FROM users WHERE user_id = ? AND role IN ('rider','admin')`,
      [rider_id]
    );
    if (riders.length === 0) return res.status(404).json({ message: 'ไม่พบไรเดอร์' });

    await pool.query(
      `UPDATE orders SET rider_id = ?, status = 'assigned' WHERE order_id = ?`,
      [rider_id, orderId]
    );

    await ensureEventsTable();
    await pool.query(
      `INSERT INTO order_events (order_id, actor_id, actor_role, event_type, message)
       VALUES (?, ?, 'admin', 'assigned', ?)`,
      [orderId, req.user?.id || null, `มอบหมายไรเดอร์ #${rider_id} โดยแอดมิน`]
    );

    res.json({ message: 'มอบหมายไรเดอร์สำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const orderId = Number(req.params.id);
  const { status } = req.body;
  const valid = ['created', 'waiting_rider', 'assigned', 'picking_up', 'delivering', 'completed', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ message: 'status ไม่ถูกต้อง' });

  try {
    const [result] = await pool.query(
      `UPDATE orders SET status = ? WHERE order_id = ?`,
      [status, orderId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบออเดอร์' });

    await ensureEventsTable();
    await pool.query(
      `INSERT INTO order_events (order_id, actor_id, actor_role, event_type, message)
       VALUES (?, ?, 'admin', ?, ?)`,
      [orderId, req.user?.id || null, `status_${status}`, `Admin เปลี่ยนสถานะเป็น ${status}`]
    );

    res.json({ message: 'อัปเดตสถานะสำเร็จ', status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.cancelOrder = async (req, res) => {
  const orderId = Number(req.params.id);
  if (!orderId) return res.status(400).json({ message: 'order_id ไม่ถูกต้อง' });

  try {
    const [rows] = await pool.query(`SELECT status FROM orders WHERE order_id = ?`, [orderId]);
    if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบออเดอร์' });

    await pool.query(`UPDATE orders SET status = 'cancelled' WHERE order_id = ?`, [orderId]);

    await ensureEventsTable();
    await pool.query(
      `INSERT INTO order_events (order_id, actor_id, actor_role, event_type, message)
       VALUES (?, ?, 'admin', 'status_cancelled', 'ยกเลิกโดยแอดมิน')`,
      [orderId, req.user?.id || null]
    );

    res.json({ message: 'ยกเลิกออเดอร์สำเร็จ', status: 'cancelled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.deleteOrder = async (req, res) => {
  const orderId = Number(req.params.id);
  if (!orderId) return res.status(400).json({ message: 'order_id ไม่ถูกต้อง' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM order_events WHERE order_id = ?`, [orderId]);
    await conn.query(
      `DELETE pd FROM product_details pd
       JOIN product p ON pd.product_id = p.id
       WHERE p.order_id = ?`,
      [orderId]
    );
    await conn.query(`DELETE FROM product WHERE order_id = ?`, [orderId]);
    const [result] = await conn.query(`DELETE FROM orders WHERE order_id = ?`, [orderId]);
    await conn.commit();

    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบออเดอร์' });
    res.json({ message: 'ลบออเดอร์สำเร็จ' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  } finally {
    conn.release();
  }
};

exports.getSalesReport = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        'ALL' AS name,
        COALESCE(SUM(o.total_price), 0) AS total_sales,
        COUNT(o.order_id)               AS total_orders
      FROM orders o
      WHERE o.status = 'completed'
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.getTopMenus = async (_req, res) => {
  try {
    await ensureProductTables();
    const [rows] = await pool.query(`
      SELECT
        COALESCE(d.product_name, CONCAT('Product #', p.id)) AS name,
        SUM(p.quantity)              AS total_qty,
        SUM(p.quantity * p.price)    AS total_revenue,
        MIN(p.id)                    AS id
      FROM product p
      LEFT JOIN product_details d ON d.product_id = p.id
      GROUP BY name
      ORDER BY total_qty DESC
      LIMIT 20
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.getRevenueByRider = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        u.user_id AS id,
        COALESCE(u.full_name, u.email)    AS rider_name,
        u.email,
        rp.vehicle_type,
        rp.plate_number,
        COALESCE(SUM(o.total_price), 0)   AS revenue,
        COUNT(o.order_id)                 AS total_orders
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.rider_id = u.user_id
      LEFT JOIN orders o ON o.rider_id = u.user_id AND o.status = 'completed'
      WHERE u.role = 'rider'
      GROUP BY u.user_id, rider_name, u.email, rp.vehicle_type, rp.plate_number
      ORDER BY revenue DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.getSalesDaily = async (req, res) => {
  try {
    const monthParam = req.query.month;
    let start;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      start = `${monthParam}-01`;
    } else {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      start = `${yyyy}-${mm}-01`;
    }

    const [rows] = await pool.query(
      `SELECT
         DATE(o.created_at)        AS order_date,
         SUM(o.total_price)        AS total_sales,
         COUNT(o.order_id)         AS total_orders
       FROM orders o
       WHERE o.created_at >= ? AND o.created_at < DATE_ADD(DATE(?), INTERVAL 1 MONTH)
       GROUP BY order_date
       ORDER BY order_date DESC`,
      [start, start]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.getOrderEventsLog = async (req, res) => {
  const { limit = 100, order_id } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  try {
    await ensureEventsTable();
    const params = [];
    let where = '';
    if (order_id) {
      where = 'WHERE e.order_id = ?';
      params.push(Number(order_id));
    }
    const [rows] = await pool.query(
      `SELECT e.event_id AS id, e.order_id, e.event_type, e.message, e.meta,
              e.created_at, e.actor_role, e.actor_id,
              u.full_name AS actor_name
       FROM order_events e
       LEFT JOIN users u ON u.user_id = e.actor_id
       ${where}
       ORDER BY e.created_at DESC, e.event_id DESC
       LIMIT ${safeLimit}`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};

exports.getCommissionReport = async (req, res) => {
  const { from, to } = req.query;
  const todayStr = new Date().toISOString().slice(0, 10);

  const buildDateWhere = () => {
    const parts = [`o.status = 'completed'`];
    const p = [];
    if (from) { parts.push("DATE(o.updated_at) >= ?"); p.push(from); }
    if (to)   { parts.push("DATE(o.updated_at) <= ?"); p.push(to); }
    return { where: "WHERE " + parts.join(" AND "), params: p };
  };

  try {
    const { where, params } = buildDateWhere();

    const [[summary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(o.total_price), 0) AS gross_total,
         COALESCE(SUM(o.total_price * o.commission_rate), 0) AS commission_total,
         COALESCE(SUM(o.total_price * (1 - o.commission_rate)), 0) AS rider_total
       FROM orders o ${where}`,
      params
    );

    const [[todaySummary]] = await pool.query(
      `SELECT
         COUNT(*) AS order_count,
         COALESCE(SUM(o.total_price), 0) AS gross,
         COALESCE(SUM(o.total_price * o.commission_rate), 0) AS commission,
         COALESCE(SUM(o.total_price * (1 - o.commission_rate)), 0) AS rider_total
       FROM orders o
       WHERE o.status = 'completed' AND DATE(o.updated_at) = ?`,
      [todayStr]
    );

    const [byRider] = await pool.query(
      `SELECT
         u.user_id AS rider_id,
         u.full_name,
         rp.vehicle_type,
         rp.plate_number,
         COUNT(o.order_id) AS total_orders,
         ROUND(COALESCE(SUM(o.total_price), 0), 2) AS gross_total,
         ROUND(COALESCE(SUM(o.total_price * o.commission_rate), 0), 2) AS commission_total,
         ROUND(COALESCE(SUM(o.total_price * (1 - o.commission_rate)), 0), 2) AS net_total,
         MAX(o.updated_at) AS last_completed
       FROM users u
       LEFT JOIN rider_profiles rp ON rp.rider_id = u.user_id
       LEFT JOIN orders o ON o.rider_id = u.user_id AND o.status = 'completed'
       WHERE u.role = 'rider'
       GROUP BY u.user_id, u.full_name, rp.vehicle_type, rp.plate_number
       ORDER BY net_total DESC`,
      []
    );

    const [daily] = await pool.query(
      `SELECT
         DATE(o.updated_at) AS date,
         COUNT(*) AS order_count,
         ROUND(SUM(o.total_price), 2) AS gross,
         ROUND(SUM(o.total_price * o.commission_rate), 2) AS commission,
         ROUND(SUM(o.total_price * (1 - o.commission_rate)), 2) AS rider_total
       FROM orders o ${where}
       GROUP BY DATE(o.updated_at)
       ORDER BY date DESC
       LIMIT 60`,
      params
    );

    res.json({
      summary: {
        total_orders: Number(summary.total_orders),
        gross_total: Number(summary.gross_total),
        commission_total: Number(summary.commission_total),
        rider_total: Number(summary.rider_total),
      },
      today: {
        order_count: Number(todaySummary.order_count),
        gross: Number(todaySummary.gross),
        commission: Number(todaySummary.commission),
        rider_total: Number(todaySummary.rider_total),
      },
      by_rider: byRider.map((r) => ({
        ...r,
        total_orders: Number(r.total_orders),
        gross_total: Number(r.gross_total),
        commission_total: Number(r.commission_total),
        net_total: Number(r.net_total),
      })),
      daily,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
};
