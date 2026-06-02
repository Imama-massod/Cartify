const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    // Get token from header (Format: Bearer <token>)
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'No token, authorization denied' });
    }

    try {
        let token = authHeader;
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ success: false, message: 'Token is not valid' });
    }
};

const adminAuth = (req, res, next) => {
    auth(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }
    });
};

module.exports = { auth, adminAuth };
