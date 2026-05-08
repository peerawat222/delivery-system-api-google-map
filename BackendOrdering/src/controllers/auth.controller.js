const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const allowedRoles = ['customer', 'rider'];
const allowedVehicleTypes = ['motorcycle', 'sedan', 'hatchback', 'suv'];
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

exports.register = async (req, res) => {
  const { full_name, email, password, role, plate_number, vehicle_type } = req.body;

  const safeRole = allowedRoles.includes(role) ? role : 'customer';

  try {
    const [rows] = await pool.query(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );

    if (rows.length > 0) {
      return res.status(400).json({ message: 'Email นี้ถูกใช้แล้ว' });
    }

    if (safeRole === 'rider') {
      if (!plate_number || !vehicle_type) {
        return res.status(400).json({
          message: 'กรุณากรอกเลขทะเบียนรถและเลือกประเภทรถ'
        });
      }

      if (!allowedVehicleTypes.includes(vehicle_type)) {
        return res.status(400).json({
          message: 'ประเภทรถไม่ถูกต้อง'
        });
      }
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [full_name, email, hash, safeRole]
    );

    const userId = result.insertId;

    if (safeRole === 'rider') {
      await pool.query(
        'INSERT INTO rider_profiles (rider_id, vehicle_type, plate_number) VALUES (?, ?, ?)',
        [userId, vehicle_type, plate_number]
      );
    }

    res.status(201).json({
      message: 'สมัครสมาชิกสำเร็จ',
      id: userId
    });
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = jwt.sign(
      { id: user.user_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};