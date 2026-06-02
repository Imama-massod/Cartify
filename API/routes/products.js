const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const { adminAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// @route   GET /api/products
// @desc    Get all products with filters (category, age, flash_sale, trending)
// @access  Public
router.get('/', async (req, res) => {
    try {
        const pool = await poolPromise;
        let query = 'SELECT p.id, p.name, p.slug, p.price, p.discount_price, p.flash_sale_price, p.stock, p.age_group, c.name as category_name, p.is_trending, p.is_flash_sale, p.flash_sale_end, p.is_grab_deal, p.views FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1';

        const queries = [];
        const request = pool.request();

        // Filters
        if (req.query.category_id) {
            query += ' AND p.category_id = @categoryId';
            request.input('categoryId', sql.Int, req.query.category_id);
        }
        if (req.query.is_trending) {
            query += ' AND p.is_trending = 1';
        }
        if (req.query.is_flash_sale) {
            query += ' AND p.is_flash_sale = 1 AND p.flash_sale_end > GETDATE()';
        }
        if (req.query.is_grab_deal) {
            query += ' AND p.is_grab_deal = 1';
        }
        if (req.query.age_group) {
            query += ' AND p.age_group = @ageGroup';
            request.input('ageGroup', sql.VarChar, req.query.age_group);
        }

        query += ' ORDER BY p.created_at DESC';

        const result = await request.query(query);

        // Fetch primary image for each product (performance optimization later: do a single join)
        const products = result.recordset;

        for (let p of products) {
            const imgRes = await pool.request()
                .input('pid', sql.Int, p.id)
                .query('SELECT TOP 1 image_url FROM product_images WHERE product_id = @pid AND is_primary = 1 ORDER BY sort_order ASC');
            if (imgRes.recordset.length > 0) {
                p.primary_image = imgRes.recordset[0].image_url;
            } else {
                p.primary_image = null;
            }
        }

        res.json({ success: true, count: products.length, data: products });

    } catch (err) {
        console.error('Fetch products error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching products', error: err.message });
    }
});

// @route   GET /api/products/:id
// @desc    Get a single product with complete details (sizes, colors, images)
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const productId = req.params.id;

        // Base Product
        const productRes = await pool.request()
            .input('id', sql.Int, productId)
            .query('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = @id');

        if (productRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const product = productRes.recordset[0];

        // 1. Fetch Images
        const imgRes = await pool.request()
            .input('pid', sql.Int, productId)
            .query('SELECT id, image_url, is_primary FROM product_images WHERE product_id = @pid ORDER BY sort_order ASC');
        product.images = imgRes.recordset;

        // 2. Fetch Colors
        const colorRes = await pool.request()
            .input('pid', sql.Int, productId)
            .query('SELECT color_name, color_code, stock FROM product_colors WHERE product_id = @pid');
        product.colors = colorRes.recordset;

        // 3. Fetch Sizes
        const sizeRes = await pool.request()
            .input('pid', sql.Int, productId)
            .query('SELECT size_name, stock FROM product_sizes WHERE product_id = @pid');
        product.sizes = sizeRes.recordset;

        // 4. Fetch Specifications
        const specRes = await pool.request()
            .input('pid', sql.Int, productId)
            .query('SELECT spec_key, spec_value FROM product_specifications WHERE product_id = @pid');
        product.specifications = specRes.recordset;

        // Update Views counter asynchronously
        pool.request().input('id', sql.Int, productId).query('UPDATE products SET views = views + 1 WHERE id = @id');

        res.json({ success: true, data: product });

    } catch (err) {
        console.error('Fetch single product error:', err.message);
        res.status(500).json({ success: false, message: 'Server Error fetching product details', error: err.message });
    }
});

// @route   POST /api/admin/products
// @desc    Add a completely new product with arrays of colors/sizes/specs and single primary image upload
// @access  Private (Admin Only)
router.post('/', [adminAuth, upload.array('images', 5)], async (req, res) => {
    // Body will contain JSON strings for nested objects if sending FormData
    const { 
        name, slug, category_id, description, price, discount_price, flash_sale_price, stock, age_group,
        is_featured, is_trending, is_flash_sale, flash_sale_end, is_grab_deal,
        colors, sizes, specs 
    } = req.body;

    // Uploaded static files via multer
    const imageFiles = req.files;

    if (!name || !slug || !price) {
        return res.status(400).json({ success: false, message: 'Name, Slug, and Price are required' });
    }

    try {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Check for duplicate slug
            const checkQuery = await new sql.Request(transaction)
                .input('slug', sql.VarChar, slug)
                .query('SELECT id FROM products WHERE slug = @slug');
                
            if (checkQuery.recordset.length > 0) {
                await transaction.rollback();
                return res.status(400).json({ success: false, message: 'Product slug already exists' });
            }

            // 1. Insert Base Product
            const insertProductQuery = `
                INSERT INTO products (name, slug, category_id, description, price, discount_price, flash_sale_price, stock, age_group, is_featured, is_trending, is_flash_sale, flash_sale_end, is_grab_deal)
                OUTPUT INSERTED.id
                VALUES (@name, @slug, @cat, @desc, @price, @dprice, @flashPrice, @stock, @age, @feat, @trend, @flash, @flashEnd, @grabDeal)
            `;

            const request = new sql.Request(transaction)
                .input('name', sql.VarChar, name)
                .input('slug', sql.VarChar, slug)
                .input('cat', sql.Int, category_id ? parseInt(category_id) : null)
                .input('desc', sql.VarChar(sql.MAX), description || '')
                .input('price', sql.Decimal(10,2), price)
                .input('dprice', sql.Decimal(10,2), discount_price ? discount_price : null)
                .input('flashPrice', sql.Decimal(10,2), flash_sale_price ? flash_sale_price : null)
                .input('stock', sql.Int, stock ? parseInt(stock) : 0)
                .input('age', sql.VarChar, age_group || null)
                .input('feat', sql.Bit, String(is_featured) === 'true' || String(is_featured) === '1' ? 1 : 0)
                .input('trend', sql.Bit, String(is_trending) === 'true' || String(is_trending) === '1' ? 1 : 0)
                .input('flash', sql.Bit, String(is_flash_sale) === 'true' || String(is_flash_sale) === '1' ? 1 : 0)
                .input('flashEnd', sql.DateTime, is_flash_sale && flash_sale_end ? flash_sale_end : null)
                .input('grabDeal', sql.Bit, String(is_grab_deal) === 'true' || String(is_grab_deal) === '1' ? 1 : 0);

            const result = await request.query(insertProductQuery);
            const productId = result.recordset[0].id;

            // 2. Insert Images (Files) array
            if (imageFiles && imageFiles.length > 0) {
                for (let i = 0; i < imageFiles.length; i++) {
                    const localPath = '/uploads/products/' + imageFiles[i].filename;
                    const isPrimary = (i === 0) ? 1 : 0; // First uploaded image is primary

                    await new sql.Request(transaction)
                        .input('pid', sql.Int, productId)
                        .input('url', sql.VarChar, localPath)
                        .input('prim', sql.Bit, isPrimary)
                        .input('sort', sql.Int, i)
                        .query('INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (@pid, @url, @prim, @sort)');
                }
            }

            // 3. Insert Colors (Assuming colors is a JSON string passed from FD)
            if (colors) {
                const colorsArray = typeof colors === 'string' ? JSON.parse(colors) : colors;
                for (const c of colorsArray) {
                    await new sql.Request(transaction)
                        .input('pid', sql.Int, productId)
                        .input('cn', sql.VarChar, c.color_name)
                        .input('cc', sql.VarChar, c.color_code || null)
                        .input('cstock', sql.Int, c.stock || 0)
                        .query('INSERT INTO product_colors (product_id, color_name, color_code, stock) VALUES (@pid, @cn, @cc, @cstock)');
                }
            }

            // 4. Insert Sizes
            if (sizes) {
                const sizesArray = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
                for (const s of sizesArray) {
                    await new sql.Request(transaction)
                        .input('pid', sql.Int, productId)
                        .input('sn', sql.VarChar, s.size_name)
                        .input('sstock', sql.Int, s.stock || 0)
                        .query('INSERT INTO product_sizes (product_id, size_name, stock) VALUES (@pid, @sn, @sstock)');
                }
            }

            // 5. Insert Specs
            if (specs) {
                const specsArray = typeof specs === 'string' ? JSON.parse(specs) : specs;
                for (const s of specsArray) {
                    await new sql.Request(transaction)
                        .input('pid', sql.Int, productId)
                        .input('sk', sql.VarChar, s.spec_key)
                        .input('sv', sql.VarChar, Object.values(s)[1] || s.spec_value)
                        .query('INSERT INTO product_specifications (product_id, spec_key, spec_value) VALUES (@pid, @sk, @sv)');
                }
            }

            await transaction.commit();
            res.status(201).json({ success: true, message: 'Complex Product Created Successfully!', productId });

        } catch (txnErr) {
            await transaction.rollback();
            console.error('Transaction failed:', txnErr.message);
            res.status(500).json({ success: false, message: 'Database failed generating product, rolled back.', error: txnErr.message });
        }

    } catch (err) {
        console.error('API Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   PUT /api/admin/products/:id
// @desc    Update basic product details
// @access  Private (Admin Only)
router.put('/:id', adminAuth, async (req, res) => {
    const { name, category_id, description, price, stock, is_grab_deal } = req.body;
    const productId = req.params.id;

    try {
        const pool = await poolPromise;
        const updateQuery = `
            UPDATE products 
            SET name = @name, category_id = @cat, description = @desc, price = @price, stock = @stock,
                is_grab_deal = @grabDeal, updated_at = GETDATE()
            WHERE id = @pid
        `;

        await pool.request()
            .input('name', sql.VarChar, name || '')
            .input('cat', sql.Int, category_id ? parseInt(category_id) : null)
            .input('desc', sql.VarChar(sql.MAX), description || '')
            .input('price', sql.Decimal(10,2), price || 0)
            .input('stock', sql.Int, stock ? parseInt(stock) : 0)
            .input('grabDeal', sql.Bit, String(is_grab_deal) === 'true' || String(is_grab_deal) === '1' ? 1 : 0)
            .input('pid', sql.Int, productId)
            .query(updateQuery);

        res.json({ success: true, message: 'Product updated successfully' });
    } catch (err) {
        console.error('Update product error:', err.message);
        res.status(500).json({ success: false, message: 'Server error updating product', error: err.message });
    }
});

// @route   PUT /api/admin/products/:id/flash-sale-price
// @desc    Set flash sale price for a product
// @access  Private (Admin Only)
router.put('/:id/flash-sale-price', adminAuth, async (req, res) => {
    const { flash_sale_price, is_flash_sale, flash_sale_end } = req.body;
    const productId = req.params.id;

    if (!flash_sale_price || isNaN(parseFloat(flash_sale_price))) {
        return res.status(400).json({ success: false, message: 'Valid flash_sale_price is required' });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('flashPrice', sql.Decimal(10,2), parseFloat(flash_sale_price))
            .input('flash', sql.Bit, 1)
            .input('flashEnd', sql.DateTime, flash_sale_end || null)
            .input('pid', sql.Int, productId)
            .query(`
                UPDATE products 
                SET flash_sale_price = @flashPrice, is_flash_sale = @flash, flash_sale_end = @flashEnd, updated_at = GETDATE()
                WHERE id = @pid
            `);

        res.json({ success: true, message: 'Flash sale price set successfully' });
    } catch (err) {
        console.error('Flash sale price error:', err.message);
        res.status(500).json({ success: false, message: 'Server error setting flash sale price', error: err.message });
    }
});

// @route   DELETE /api/admin/products/:id
// @desc    Delete a product (including images, sizes, colors and specs)
// @access  Private (Admin Only)
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const productId = req.params.id;

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const trReq = new sql.Request(transaction).input('pid', sql.Int, productId);

            // Fetch images to delete from filesystem eventually
            const imagesRes = await trReq.query('SELECT image_url FROM product_images WHERE product_id = @pid');
            // Remove attributes
            await trReq.query('DELETE FROM product_colors WHERE product_id = @pid');
            await trReq.query('DELETE FROM product_sizes WHERE product_id = @pid');
            await trReq.query('DELETE FROM product_specifications WHERE product_id = @pid');
            await trReq.query('DELETE FROM product_images WHERE product_id = @pid');
            
            // Remove cart and wishlist dependencies optionally if required by FK? 
            // Better to soft delete in real world, but hard deleting here
            await trReq.query('DELETE FROM wishlist WHERE product_id = @pid');
            await trReq.query('DELETE FROM cart_items WHERE product_id = @pid');

            // Finally base product
            await trReq.query('DELETE FROM products WHERE id = @pid');

            await transaction.commit();
            res.json({ success: true, message: 'Product & all related data effectively destroyed.' });

        } catch (txnErr) {
            await transaction.rollback();
            throw txnErr;
        }

    } catch (err) {
        console.error('Delete product error:', err.message);
        res.status(500).json({ success: false, message: 'Server error deleting product (It may have ordered history)', error: err.message });
    }
});

module.exports = router;
