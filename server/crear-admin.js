// Uso: node server/crear-admin.js correo@ejemplo.com contraseña "Nombre"
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./db');

async function main() {
  const [,, email, pass, nombre] = process.argv;

  if (!email || !pass) {
    console.log('Uso: node server/crear-admin.js correo@ejemplo.com contraseña "Nombre"');
    process.exit(1);
  }

  const hash = await bcrypt.hash(pass, 10);

  await db.query(
    'INSERT INTO admins (email, password, nombre) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET password = $2, nombre = $3',
    [email.toLowerCase().trim(), hash, nombre || null]
  );

  console.log(`Admin creada: ${email}`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });