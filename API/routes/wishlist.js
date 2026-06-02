const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const { auth } = require('../middleware/auth');

// @route   GET /api/wishlist
// @desc    Get all wishlist items for logged-in user
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('uid', sql.Int, req.user.id)
            .query(`
                SELECT w.id as wishlist_id, w.product_id, w.added_at,
                       p.name, p.price, p.discount_price, p.flash_sale_price, p.is_flash_sale,
                       p.stock, p.slug,
                       (SELECT TOP 1 image_url FROM product_images pi 
                        WHERE pi.product_id = p.id AND pi.is_primary = 1) as image
                FROM wishlist w
                INNER JOIN products p ON w.product_id = p.id
                WHERE w.user_id = @uid
                ORDER BY w.added_at DESC
            `);
        res.json({ success: true, count: result.recordset.length, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   POST /api/wishlist/toggle/:productId
// @desc    Toggle wishlist — add if not there, remove if already added
// @access  Private
router.post('/toggle/:productId', auth, async (req, res) => {
    const productId = parseInt(req.params.productId);
    try {
        const pool = await poolPromise;

        // Check if already in wishlist
        const existing = await pool.request()
            .input('uid', sql.Int, req.user.id)
            .input('pid', sql.Int, productId)
            .query('SELECT id FROM wishlist WHERE user_id = @uid AND product_id = @pid');

        if (existing.recordset.length > 0) {
            // Remove from wishlist
            await pool.request()
                .input('uid', sql.Int, req.user.id)
                .input('pid', sql.Int, productId)
                .query('DELETE FROM wishlist WHERE user_id = @uid AND product_id = @pid');

            res.json({ success: true, action: 'removed', message: 'Removed from wishlist' });
        } else {
            // Add to wishlist
            await pool.request()
                .input('uid', sql.Int, req.user.id)
                .input('pid', sql.Int, productId)
                .query('INSERT INTO wishlist (user_id, product_id) VALUES (@uid, @pid)');

            res.json({ success: true, action: 'added', message: 'Added to wishlist' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   GET /api/wishlist/check/:productId
// @desc    Check if a specific product is in the user's wishlist
// @access  Private
router.get('/check/:productId', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('uid', sql.Int, req.user.id)
            .input('pid', sql.Int, req.params.productId)
            .query('SELECT id FROM wishlist WHERE user_id = @uid AND product_id = @pid');

        res.json({ success: true, isWishlisted: result.recordset.length > 0 });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   DELETE /api/wishlist/:id
// @desc    Remove a specific wishlist item by wishlist id
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, req.user.id)
            .query('DELETE FROM wishlist WHERE id = @id AND user_id = @uid');

        res.json({ success: true, message: 'Removed from wishlist' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

module.exports = router;
