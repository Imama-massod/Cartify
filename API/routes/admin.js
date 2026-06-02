const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const { adminAuth } = require('../middleware/auth');

// @route   GET /api/admin/dashboard/stats
// @desc    Dashboard overview statistics
// @access  Private (Admin Only)
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const metrics = {};

        // 1. Total active products
        const productsCountRes = await pool.request().query('SELECT COUNT(id) as total FROM products');
        metrics.total_products = productsCountRes.recordset[0].total;

        // 2. Total active users
        const usersCountRes = await pool.request().query("SELECT COUNT(id) as total FROM users WHERE role = 'user'");
        metrics.total_users = usersCountRes.recordset[0].total;

        // 3. New Orders (Pending)
        const newOrdersRes = await pool.request().query("SELECT COUNT(id) as total FROM orders WHERE order_status = 'Pending'");
        metrics.pending_orders = newOrdersRes.recordset[0].total;

        // 4. Monthly Revenue
        const revenueRes = await pool.request().query(`
            SELECT SUM(total_amount) as total_revenue
            FROM orders
            WHERE order_date >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)
        `);
        metrics.monthly_revenue = revenueRes.recordset[0].total_revenue || 0;

        // 5. Low Stock alerts
        const lowStockRes = await pool.request().query('SELECT id, name, stock FROM products WHERE stock < 10 ORDER BY stock ASC');
        metrics.low_stock_products = lowStockRes.recordset;

        // 6. Recent Orders
        const recentOrdersRes = await pool.request().query('SELECT TOP 5 order_number, customer_name, total_amount, order_status, order_date FROM orders ORDER BY order_date DESC');
        metrics.recent_orders = recentOrdersRes.recordset;

        res.json({ success: true, data: metrics });

    } catch (err) {
        console.error('Dashboard Stats Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching dashboard metrics', error: err.message });
    }
});

module.exports = router;
