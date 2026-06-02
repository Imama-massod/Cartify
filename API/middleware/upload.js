const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/products');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure categories directory exists
const categoryDir = path.join(__dirname, '../public/uploads/categories');
if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        // Determine path based on the route uploading it
        if (req.originalUrl.includes('/categories')) {
            cb(null, categoryDir);
        } else {
            cb(null, uploadDir);
        }
    },
    filename: function(req, file, cb) {
        // Create a unique filename: timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload only images.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 5 // 5MB limit max
    },
    fileFilter: fileFilter
});

module.exports = upload;
