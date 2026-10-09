const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'acero_gym',
  user:     process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
});

pool.on('error', (err) => console.error('Error en pool PG:', err.message));

module.exports = pool;