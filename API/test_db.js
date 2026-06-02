const sql = require('msnodesqlv8');

const connectionString = "Data Source=X1\\FLOW;Initial Catalog=CartifyDB;Persist Security Info=False;User ID=sa;Password=03016645866;Pooling=False;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=True;Application Name=SQL Server Management Studio;Command Timeout=0;";

console.log('Testing raw msnodesqlv8 connection...');

sql.query(connectionString, "SELECT 1 as val", (err, rows) => {
    if (err) {
        console.error("RAW ERROR OBJECT:", err);
    } else {
        console.log("SUCCESS! Connected to DB. Rows:", rows);
    }
});
