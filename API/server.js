const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (images) from wwwroot (public/uploads) 
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Import Routes
const categoryRoutes = require('./routes/categories');
const authRoutes = require('./routes/auth'); // NEW: Import Auth routes
const productRoutes = require('./routes/products'); // NEW: Import Product routes
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const wishlistRoutes = require('./routes/wishlist'); // Wishlist routes

// Swagger UI
const swaggerConfig = require('./config/swagger');
app.use('/api-docs', swaggerConfig.serve, swaggerConfig.setup);

// Use Routes
app.use('/api/auth', authRoutes);                 // NEW: Auth Base Route
app.use('/api/admin/dashboard', adminRoutes);     // Admin stats & metrics
app.use('/api/admin/categories', categoryRoutes); // Admin routes for categories
app.use('/api/categories', categoryRoutes);       // Public routes for categories
app.use('/api/admin/products', productRoutes);    // Admin routes for products
app.use('/api/products', productRoutes);          // Public routes for products
app.use('/api/cart', cartRoutes);                 // Private routes for Cart
app.use('/api/orders', orderRoutes);              // Private routes for Orders (also handles Admin)
app.use('/api/wishlist', wishlistRoutes);          // Private routes for Wishlist

// Basic route to check backend health
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Welcome to Cartify API Backend' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
