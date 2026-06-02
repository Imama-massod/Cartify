const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const { auth } = require('../middleware/auth');

// @route   GET /api/cart
// @desc    Get user's shopping cart items
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('uid', sql.Int, req.user.id)
            .query(`
                SELECT c.id as cart_item_id, c.product_id, c.color_name, c.size_name, c.quantity,
                       p.name, p.price, p.discount_price, p.flash_sale_price, p.is_flash_sale,
                       (SELECT TOP 1 image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1) as image
                FROM cart_items c
                INNER JOIN products p ON c.product_id = p.id
                WHERE c.user_id = @uid
            `);

        res.json({ success: true, count: result.recordset.length, data: result.recordset });
    } catch (err) {
        console.error('Fetch cart error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching cart', error: err.message });
    }
});

// @route   POST /api/cart/add
// @desc    Add item to cart
// @access  Private
router.post('/add', auth, async (req, res) => {
    const { product_id, color_name, size_name, quantity } = req.body;

    if (!product_id || !quantity) {
        return res.status(400).json({ success: false, message: 'Product ID and quantity are required' });
    }

    try {
        const pool = await poolPromise;

        // Check if item already exists in cart with same variations
        const checkItem = await pool.request()
            .input('uid', sql.Int, req.user.id)
            .input('pid', sql.Int, product_id)
            .input('color', sql.VarChar, color_name || null)
            .input('size', sql.VarChar, size_name || null)
            .query(`
                SELECT id, quantity FROM cart_items 
                WHERE user_id = @uid AND product_id = @pid 
                AND (color_name = @color OR (color_name IS NULL AND @color IS NULL))
                AND (size_name = @size OR (size_name IS NULL AND @size IS NULL))
            `);

        if (checkItem.recordset.length > 0) {
            // Update quantity instead
            const cartId = checkItem.recordset[0].id;
            const newQty = checkItem.recordset[0].quantity + parseInt(quantity);
            
            await pool.request()
                .input('id', sql.Int, cartId)
                .input('qty', sql.Int, newQty)
                .query('UPDATE cart_items SET quantity = @qty WHERE id = @id');
                
            return res.status(200).json({ success: true, message: 'Cart item quantity updated' });
        }

        // Insert new cart item
        await pool.request()
            .input('uid', sql.Int, req.user.id)
            .input('pid', sql.Int, product_id)
            .input('color', sql.VarChar, color_name || null)
            .input('size', sql.VarChar, size_name || null)
            .input('qty', sql.Int, quantity)
            .query(`
                INSERT INTO cart_items (user_id, product_id, color_name, size_name, quantity)
                VALUES (@uid, @pid, @color, @size, @qty)
            `);

        res.status(201).json({ success: true, message: 'Item added to cart' });

    } catch (err) {
        console.error('Add to cart error:', err.message);
        res.status(500).json({ success: false, message: 'Server error adding to cart', error: err.message });
    }
});

// @route   PUT /api/cart/update/:id
// @desc    Update cart item quantity
// @access  Private
router.put('/update/:id', auth, async (req, res) => {
    const { quantity } = req.body;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, req.user.id)
            .input('qty', sql.Int, quantity)
            .query('UPDATE cart_items SET quantity = @qty WHERE id = @id AND user_id = @uid');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, message: 'Cart item not found or unauthorized' });
        }
        res.json({ success: true, message: 'Quantity updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   DELETE /api/cart/remove/:id
// @desc    Remove item from cart
// @access  Private
router.delete('/remove/:id', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('uid', sql.Int, req.user.id)
            .query('DELETE FROM cart_items WHERE id = @id AND user_id = @uid');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, message: 'Cart item not found or unauthorized' });
        }
        res.json({ success: true, message: 'Item removed from cart' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

module.exports = router;
