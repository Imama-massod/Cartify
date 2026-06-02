const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const { adminAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// @route   GET /api/categories
// @desc    Get all active categories
// @access  Public
router.get('/', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC');
            
        res.json({ success: true, count: result.recordset.length, data: result.recordset });
    } catch (err) {
        console.error('Error fetching categories:', err.message);
        res.status(500).json({ success: false, message: 'Server Error fetching categories', error: err.message });
    }
});

// @route   GET /api/categories/:id
// @desc    Get single category by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM categories WHERE id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Error fetching category:', err.message);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// ================= ADMIN ROUTES ================= //

// @route   POST /api/admin/categories
// @desc    Add a new category with an image
// @access  Private (Admin only)
router.post('/', [adminAuth, upload.single('image')], async (req, res) => {
    const { name, slug, parent_id, sort_order, is_active } = req.body;
    let imageUrl = '';

    if (req.file) {
        // Save the relative path so client can fetch it from wwwroot static
        imageUrl = `/uploads/categories/${req.file.filename}`;
    }

    try {
        const pool = await poolPromise;
        
        // Ensure slug is unique
        const checkSlug = await pool.request()
            .input('slug', sql.VarChar, slug)
            .query('SELECT id FROM categories WHERE slug = @slug');
            
        if (checkSlug.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'Category slug must be unique' });
        }

        const insertQuery = `
            INSERT INTO categories (name, slug, image, parent_id, is_active, sort_order)
            OUTPUT INSERTED.*
            VALUES (@name, @slug, @image, @parent_id, @is_active, @sort_order)
        `;

        const result = await pool.request()
            .input('name', sql.VarChar, name)
            .input('slug', sql.VarChar, slug)
            .input('image', sql.VarChar, imageUrl)
            .input('parent_id', sql.Int, parent_id ? parseInt(parent_id) : null)
            .input('is_active', sql.Bit, is_active !== undefined ? is_active : 1)
            .input('sort_order', sql.Int, sort_order || 0)
            .query(insertQuery);

        res.status(201).json({ success: true, message: 'Category created', data: result.recordset[0] });

    } catch (err) {
        console.error('Create category error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @route   PUT /api/admin/categories/:id
// @desc    Update a category
// @access  Private (Admin only)
router.put('/:id', adminAuth, async (req, res) => {
    const { name, parent_id, is_active } = req.body;
    const catId = req.params.id;

    try {
        const pool = await poolPromise;
        
        const updateQuery = `
            UPDATE categories 
            SET name = @name, parent_id = @parent_id, is_active = @is_active
            WHERE id = @id
        `;

        await pool.request()
            .input('name', sql.VarChar, name)
            .input('parent_id', sql.Int, parent_id ? parseInt(parent_id) : null)
            .input('is_active', sql.Bit, is_active !== undefined ? is_active : 1)
            .input('id', sql.Int, catId)
            .query(updateQuery);

        res.json({ success: true, message: 'Category updated successfully' });

    } catch (err) {
        console.error('Update category error:', err.message);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// @desc    Delete a category
// @access  Private (Admin only)
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const pool = await poolPromise;

        // Fetch category to get image path and delete file
        const categoryResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT image FROM categories WHERE id = @id');

        if (categoryResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Delete from database
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM categories WHERE id = @id');

        res.json({ success: true, message: 'Category removed' });
    } catch (err) {
        console.error('Delete category error:', err.message);
        res.status(500).json({ success: false, message: 'Server Error. Ensure no products are attached to this category before deleting.', error: err.message });
    }
});

module.exports = router;
