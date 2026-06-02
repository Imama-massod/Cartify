const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const server = process.env.DB_SERVER || 'X1\\FLOW';
const database = process.env.DB_NAME || 'CartifyDB';
const user = process.env.DB_USER || 'sa';
const password = process.env.DB_PASSWORD || '03016645866';

const connectionString = `Driver={ODBC Driver 18 for SQL Server};Server=${server};Database=${database};Uid=${user};Pwd=${password};Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=15;`;

const poolPromise = new sql.ConnectionPool({
    connectionString: connectionString
})
    .connect()
    .then(pool => {
        console.log('✅ Connected to SQL Server!');
        return pool;
    })
    .catch(err => {
        console.error('❌ Database Connection Failed! Full Error:', err.message || err);
        process.exit(1);
    });

module.exports = {
    sql,
    poolPromise
};
