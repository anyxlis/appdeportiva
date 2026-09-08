require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Archivos estáticos (la tienda y el admin)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rutas API
app.use('/api/auth',     require('./rutas/auth'));
app.use('/api/catalogo', require('./rutas/catalogo'));
app.use('/api/productos', require('./rutas/productos'));
app.use('/api/ventas',   require('./rutas/ventas'));
app.use('/api/cobros',   require('./rutas/cobros'));
app.use('/api/informes', require('./rutas/informes'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Acero Gym corriendo en http://localhost:${PORT}`));