const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:              process.env.DB_HOST,
  port:              parseInt(process.env.DB_PORT, 10) || 3306,
  user:              process.env.DB_USER,
  password:          process.env.DB_PASSWORD,
  database:          process.env.DB_NAME,
  charset:           'utf8mb4',
  waitForConnections: true,
  connectionLimit:   10,
  queueLimit:        0,
  timezone:          '+01:00',
});

// Vérification au démarrage
pool.getConnection()
  .then(conn => {
    console.log('[DB] Connexion MySQL établie');
    conn.release();
  })
  .catch(err => {
    console.error('[DB] Échec de connexion :', err.message);
    process.exit(1);
  });

module.exports = pool;
