const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

// @route   POST /api/orders
// @desc    Place an order from cart
// @access  Private
router.post('/', auth, async (req, res) => {
    const { 
        customer_name, customer_email, customer_phone, 
        address_street, address_city, address_state, address_pincode, 
        shipping_charge, payment_method, notes 
    } = req.body;

    // Basic Validation
    if (!customer_name || !address_street || !address_city) {
        return res.status(400).json({ success: false, message: 'Please provide full shipping details' });
    }

    try {
        const pool = await poolPromise;
        
        // 1. Fetch Cart
        const cartRes = await pool.request()
            .input('uid', sql.Int, req.user.id)
            .query(`
                SELECT c.*, p.price, p.discount_price, p.flash_sale_price, p.is_flash_sale, p.name 
                FROM cart_items c 
                INNER JOIN products p ON c.product_id = p.id 
                WHERE c.user_id = @uid
            `);
            
        const cartItems = cartRes.recordset;
        
        if (cartItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        // Calculate Totals — Flash sale price takes priority
        let subtotal = 0;
        cartItems.forEach(item => {
            let finalPrice = item.price;
            if (item.is_flash_sale && item.flash_sale_price) {
                finalPrice = item.flash_sale_price;
            } else if (item.discount_price) {
                finalPrice = item.discount_price;
            }
            subtotal += finalPrice * item.quantity;
        });

        const finalShipping = shipping_charge || 0;
        const totalAmount = subtotal + finalShipping; // Coupons could affect this normally
        
        const orderNumber = 'ORD-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 1000);

        // TRANSACTION START
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 2. Insert Order
            const trReq = new sql.Request(transaction);
            const insertOrderQuery = `
                INSERT INTO orders (
                    order_number, user_id, customer_name, customer_email, customer_phone,
                    address_street, address_city, address_state, address_pincode,
                    subtotal, shipping_charge, total_amount, payment_method, notes
                ) OUTPUT INSERTED.id 
                VALUES (
                    @number, @uid, @name, @email, @phone, 
                    @street, @city, @state, @pin, 
                    @sub, @ship, @total, @pay, @notes
                )
            `;
            
            trReq.input('number', sql.VarChar, orderNumber);
            trReq.input('uid', sql.Int, req.user.id);
            trReq.input('name', sql.VarChar, customer_name);
            trReq.input('email', sql.VarChar, customer_email || null);
            trReq.input('phone', sql.VarChar, customer_phone || null);
            trReq.input('street', sql.VarChar, address_street);
            trReq.input('city', sql.VarChar, address_city);
            trReq.input('state', sql.VarChar, address_state);
            trReq.input('pin', sql.VarChar, address_pincode);
            trReq.input('sub', sql.Decimal(10,2), subtotal);
            trReq.input('ship', sql.Decimal(10,2), finalShipping);
            trReq.input('total', sql.Decimal(10,2), totalAmount);
            trReq.input('pay', sql.VarChar, payment_method || 'COD');
            trReq.input('notes', sql.VarChar(sql.MAX), notes || '');

            const orderResult = await trReq.query(insertOrderQuery);
            const orderId = orderResult.recordset[0].id;

            // 3. Move items to order_items & deduct stock
            for (const item of cartItems) {
                // Flash sale price takes priority over discount_price
                let finalPrice = item.price;
                if (item.is_flash_sale && item.flash_sale_price) {
                    finalPrice = item.flash_sale_price;
                } else if (item.discount_price) {
                    finalPrice = item.discount_price;
                }
                const lineTotal = finalPrice * item.quantity;
                
                const itemReq = new sql.Request(transaction);
                
                await itemReq
                    .input('oid', sql.Int, orderId)
                    .input('pid', sql.Int, item.product_id)
                    .input('pname', sql.VarChar, item.name)
                    .input('pimg', sql.VarChar, '') // Should be fetched from product_images realistically
                    .input('color', sql.VarChar, item.color_name)
                    .input('size', sql.VarChar, item.size_name)
                    .input('qty', sql.Int, item.quantity)
                    .input('price', sql.Decimal(10,2), finalPrice)
                    .input('ltotal', sql.Decimal(10,2), lineTotal)
                    .query(`
                        INSERT INTO order_items (order_id, product_id, product_name, product_image, color_name, size_name, quantity, price, total)
                        VALUES (@oid, @pid, @pname, @pimg, @color, @size, @qty, @price, @ltotal)
                    `);
                    
                // Decrement stock in products
                await itemReq.query('UPDATE products SET stock = stock - @qty WHERE id = @pid');
            }

            // 4. Initial Order History
            await new sql.Request(transaction)
                .input('oid', sql.Int, orderId)
                .input('to', sql.VarChar, 'Pending')
                .input('by', sql.VarChar, customer_name)
                .query("INSERT INTO order_status_history (order_id, status_from, status_to, note, changed_by) VALUES (@oid, 'Created', @to, 'Order Placed', @by)");

            // 5. Empty Cart
            await new sql.Request(transaction)
                .input('uid', sql.Int, req.user.id)
                .query('DELETE FROM cart_items WHERE user_id = @uid');

            await transaction.commit();
            res.status(201).json({ success: true, message: 'Order Placed Successfully', orderId, orderNumber });

        } catch (txnErr) {
            await transaction.rollback();
            console.error('Order Transaction Failed:', txnErr.message);
            res.status(500).json({ success: false, message: 'Transaction rolled back', error: txnErr.message });
        }

    } catch (err) {
        console.error('Order logic error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   GET /api/orders
// @desc    Get logged in user's orders
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('uid', sql.Int, req.user.id)
            .query('SELECT * FROM orders WHERE user_id = @uid ORDER BY order_date DESC');
            
        res.json({ success: true, count: result.recordset.length, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// ================= ADMIN ROUTES ================= //

// @route   GET /api/admin/orders
// @desc    Get ALL orders
// @access  Private (Admin Only)
router.get('/all', adminAuth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT * FROM orders ORDER BY order_date DESC');
            
        res.json({ success: true, count: result.recordset.length, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   GET /api/admin/orders/:id
// @desc    Get order details
// @access  Private (Admin Only)
router.get('/:id', adminAuth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const orderRes = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM orders WHERE id = @id');
            
        if (orderRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        const order = orderRes.recordset[0];
        
        const itemsRes = await pool.request()
            .input('oid', sql.Int, req.params.id)
            .query('SELECT * FROM order_items WHERE order_id = @oid');
            
        order.items = itemsRes.recordset;
        
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   PUT /api/admin/orders/:id/status
// @desc    Update order status
// @access  Private (Admin Only)
router.put('/:id/status', adminAuth, async (req, res) => {
    const { order_status } = req.body;
    try {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const reqTr = new sql.Request(transaction);
            // Fetch old state
            const oldRes = await reqTr
                .input('id', sql.Int, req.params.id)
                .query('SELECT order_status FROM orders WHERE id = @id');
            
            const oldStatus = oldRes.recordset[0].order_status;

            // Update state
            await reqTr
                .input('new_status', sql.VarChar, order_status)
                .query('UPDATE orders SET order_status = @new_status WHERE id = @id');

            // Log history
            await reqTr
                .input('oldStatus', sql.VarChar, oldStatus)
                .input('by', sql.VarChar, 'Admin ('+req.user.id+')')
                .query('INSERT INTO order_status_history (order_id, status_from, status_to, changed_by) VALUES (@id, @oldStatus, @new_status, @by)');
            
            await transaction.commit();
            res.json({ success: true, message: 'Order status updated successfully' });

        } catch (txnErr) {
            await transaction.rollback();
            throw txnErr;
        }

    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

module.exports = router;
