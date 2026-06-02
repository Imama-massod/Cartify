const sql = require('mssql/msnodesqlv8');

const connStr = "Data Source=X1\\FLOW;Initial Catalog=CartifyDB;Persist Security Info=False;User ID=sa;Password=03016645866;Pooling=False;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=True;Application Name=SQL Server Management Studio;Command Timeout=0;";

const pool = new sql.ConnectionPool({
    connectionString: connStr
});

pool.connect().then(() => {
    console.log("MSSQL WRAPPER WORKED!");
    process.exit(0);
}).catch(err => {
    console.error("MSSQL ERROR: ", err);
    process.exit(1);
})
