const bcrypt = require('bcryptjs');
const { sql, poolPromise } = require('./config/db');

async function seedAdmin() {
    try {
        const pool = await poolPromise;
        
        // Check if admin exists
        const check = await pool.request().query("SELECT * FROM users WHERE email = 'admin@cartify.com'");
        if(check.recordset.length > 0) {
            console.log("Admin already exists!");
            // Upgrade role if not already admin
            await pool.request().query("UPDATE users SET role = 'admin' WHERE email = 'admin@cartify.com'");
            console.log("Role ensured as admin.");
            process.exit(0);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('admin123', salt);

        await pool.request()
            .input('name', sql.VarChar, 'Super Admin')
            .input('email', sql.VarChar, 'admin@cartify.com')
            .input('password', sql.VarChar, hashedPassword)
            .input('phone', sql.VarChar, '1234567890')
            .query("INSERT INTO users (name, email, password, phone, role) VALUES (@name, @email, @password, @phone, 'admin')");

        console.log("Admin seeded successfully: admin@cartify.com / admin123");
        process.exit(0);
    } catch(e) {
        console.error("Error setting admin: ", e);
        process.exit(1);
    }
}

seedAdmin();
