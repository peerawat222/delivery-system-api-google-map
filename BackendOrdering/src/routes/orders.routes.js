const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const ordersController = require('../controllers/orders.controller');

// ── Static paths (must be before /:id) ─────────────────────────
// Customer: ออเดอร์ตัวเอง
router.get('/my', authRequired, ordersController.getMyOrders);
// Rider: งานของตัวเอง
router.get('/', authRequired, ordersController.getAssignedOrders);
// Rider: งานที่เปิดให้รับ
router.get('/available', authRequired, ordersController.getAvailableOrders);
// Rider: โปรไฟล์
router.get('/rider/profile', authRequired, ordersController.getRiderProfile);
router.put('/rider/profile', authRequired, ordersController.updateRiderProfile);
// Rider: รายได้ + ประวัติ
router.get('/rider/earnings', authRequired, ordersController.getRiderEarnings);

// Create order
router.post('/', authRequired, ordersController.createOrder);

// ── Dynamic /:id paths ──────────────────────────────────────────
router.post('/:id/claim', authRequired, ordersController.claimOrder);
router.post('/:id/pay', authRequired, ordersController.payOrder);
router.patch('/:id/schedule', authRequired, ordersController.updateSchedule);
router.patch('/:id/status', authRequired, ordersController.updateStatusRider);
router.get('/:id/events', authRequired, ordersController.getOrderEvents);
router.get('/:id', authRequired, ordersController.getOrderDetail);

module.exports = router;
