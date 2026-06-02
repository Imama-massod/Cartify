const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../config/db');
const { auth } = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
    const { name, email, password, phone } = req.body;

    // Validate request
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide required fields: name, email, password' });
    }

    try {
        const pool = await poolPromise;

        // Check if user exists
        const checkUser = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id FROM users WHERE email = @email');

        if (checkUser.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'User already exists with this email' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert User
        const insertUserQuery = `
            INSERT INTO users (name, email, password, phone) 
            OUTPUT INSERTED.id, INSERTED.role, INSERTED.name, INSERTED.email 
            VALUES (@name, @email, @password, @phone)
        `;
        
        const result = await pool.request()
            .input('name', sql.VarChar, name)
            .input('email', sql.VarChar, email)
            .input('password', sql.VarChar, hashedPassword)
            .input('phone', sql.VarChar, phone || '')
            .query(insertUserQuery);

        const user = result.recordset[0];

        // Create JWT
        const payload = {
            user: { id: user.id, role: user.role }
        };

        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
            if (err) throw err;
            res.status(201).json({
                success: true,
                message: 'Registration successful',
                token,
                user: { id: user.id, name: user.name, email: user.email, role: user.role }
            });
        });

    } catch (err) {
        console.error('Registration error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during registration', error: err.message });
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    try {
        const pool = await poolPromise;

        // Find user by email
        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT id, name, email, password, role FROM users WHERE email = @email AND is_active = 1');

        if (result.recordset.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid Credentials' });
        }

        const user = result.recordset[0];

        // Match the hashed password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid Credentials' });
        }

        // Create JWT
        const payload = {
            user: { id: user.id, role: user.role }
        };

        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
            if (err) throw err;
            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: { id: user.id, name: user.name, email: user.email, role: user.role }
            });
        });

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during login', error: err.message });
    }
});

// @route   GET /api/auth/profile
// @desc    Get logged in user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.user.id)
            .query('SELECT id, name, email, phone, role, is_active, created_at FROM users WHERE id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Profile fetch error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching profile', error: err.message });
    }
});

module.exports = router;
