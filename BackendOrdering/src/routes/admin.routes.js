const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authRequired } = require('../middleware/auth');
const { isAdmin } = require('../middleware/role');

const auth = [authRequired, isAdmin];

// ── Summary ────────────────────────────────────────────────────────────────────
router.get('/summary', ...auth, adminController.getSummary);

// ── Users ──────────────────────────────────────────────────────────────────────
router.get('/users',              ...auth, adminController.getAllUsers);
router.post('/users',             ...auth, adminController.createUser);
router.patch('/users/:id/role',   ...auth, adminController.changeUserRole);
router.delete('/users/:id',       ...auth, adminController.deleteUser);

// ── Riders ─────────────────────────────────────────────────────────────────────
router.get('/riders', ...auth, adminController.getAllRiders);
router.patch('/users/:id/rider-profile', ...auth, adminController.updateRiderProfile);

// ── Orders ─────────────────────────────────────────────────────────────────────
router.get('/orders',               ...auth, adminController.getAllOrders);
router.patch('/orders/:id/status',  ...auth, adminController.updateOrderStatus);
router.patch('/orders/:id/assign',  ...auth, adminController.assignRider);
router.patch('/orders/:id/cancel',  ...auth, adminController.cancelOrder);
router.delete('/orders/:id',        ...auth, adminController.deleteOrder);

// ── Reports ────────────────────────────────────────────────────────────────────
router.get('/reports/sales',        ...auth, adminController.getSalesReport);
router.get('/reports/top-menus',    ...auth, adminController.getTopMenus);
router.get('/reports/revenue',      ...auth, adminController.getRevenueByRider);
router.get('/reports/sales-daily',  ...auth, adminController.getSalesDaily);
router.get('/reports/order-events', ...auth, adminController.getOrderEventsLog);

// ── Commission / Earnings ──────────────────────────────────────────────────────
router.get('/earnings', ...auth, adminController.getCommissionReport);

module.exports = router;
