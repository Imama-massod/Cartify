const { poolPromise } = require('./config/db');

async function fixPassword() {
    const pool = await poolPromise;
    await pool.request().query("UPDATE users SET password = '$2a$10$HDfUeazA43jqzSLmDmw.DeLLuMJp3VjSdJrqOHyJAEs9cjQ5Z8tVu' WHERE email = 'admin@cartify.com'");
    console.log('Password updated successfully');
    process.exit(0);
}

fixPassword().catch(console.error);
