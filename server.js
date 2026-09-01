// server.js - Versión completa actualizada
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Servir archivos estáticos de la carpeta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ================== CONEXIÓN A LA BASE DE DATOS ==================
const DB_PATH = path.join(__dirname, 'tienda.db');
const db = new Database(DB_PATH);

// Habilitar foreign keys
db.pragma('foreign_keys = ON');

// ================== CARGA DEL ESQUEMA SQL ==================
try {
  const possibleSchemaNames = ['schema.sql', 'consultas.sql', 'database.sql', 'db.sql'];
  let schemaPath = null;

  for (const name of possibleSchemaNames) {
    const fullPath = path.join(__dirname, name);
    if (fs.existsSync(fullPath)) {
      schemaPath = fullPath;
      console.log(`✅ Usando esquema SQL desde: ${name}`);
      break;
    }
  }

  if (!schemaPath) {
    console.error('❌ No se encontró ningún archivo SQL (buscando schema.sql, consultas.sql, etc.)');
    process.exit(1);
  }

  const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSQL);
  console.log('✅ Esquema SQL cargado correctamente');
} catch (err) {
  console.error('❌ Error al cargar el esquema:', err.message);
  process.exit(1);
}

// Crear tabla VentasFeria si no existe (por si el schema no la incluye)
db.exec(`
  CREATE TABLE IF NOT EXISTS VentasFeria (
    id_venta_feria INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_feria DATE NOT NULL,
    descripcion_producto VARCHAR(150) NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(10,2) NOT NULL CHECK (precio_unitario >= 0),
    total DECIMAL(10,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
  )
`);

// ================== FUNCIONES AUXILIARES ==================
function runQuery(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  } catch (err) {
    throw err;
  }
}

function getQuery(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  } catch (err) {
    throw err;
  }
}

function allQuery(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  } catch (err) {
    throw err;
  }
}

// ================== ENDPOINTS ==================

// ---------- RESTOCK SEMANAL ----------
app.get('/api/restocks', (req, res) => {
  try {
    const restocks = allQuery('SELECT * FROM RestockSemanal ORDER BY fecha_compra DESC');
    res.json(restocks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/restocks', (req, res) => {
  const { fecha_compra, monto_total_invertido, origen_fondos, observaciones } = req.body;
  if (!fecha_compra || !monto_total_invertido || !origen_fondos) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: fecha_compra, monto_total_invertido, origen_fondos' });
  }
  try {
    const result = runQuery(
      'INSERT INTO RestockSemanal (fecha_compra, monto_total_invertido, origen_fondos, observaciones) VALUES (?, ?, ?, ?)',
      [fecha_compra, monto_total_invertido, origen_fondos, observaciones || null]
    );
    res.status(201).json({ id_restock: result.lastInsertRowid, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Actualizar restock
app.put('/api/restocks/:id', (req, res) => {
  const { id } = req.params;
  const { fecha_compra, monto_total_invertido, origen_fondos, observaciones } = req.body;
  if (!fecha_compra || !monto_total_invertido || !origen_fondos) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const result = runQuery(
      'UPDATE RestockSemanal SET fecha_compra = ?, monto_total_invertido = ?, origen_fondos = ?, observaciones = ? WHERE id_restock = ?',
      [fecha_compra, monto_total_invertido, origen_fondos, observaciones || null, id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Restock no encontrado' });
    res.json({ message: 'Restock actualizado correctamente' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- DETALLE DE RESTOCK ----------
app.get('/api/detalles-restock', (req, res) => {
  try {
    const detalles = allQuery('SELECT * FROM DetalleRestock');
    res.json(detalles);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/detalles-restock', (req, res) => {
  const { id_restock, tipo_adquisicion, descripcion_partida, costo_partida, cantidad_piezas_estimada } = req.body;
  if (!id_restock || !tipo_adquisicion || !descripcion_partida || !costo_partida || !cantidad_piezas_estimada) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const result = runQuery(
      'INSERT INTO DetalleRestock (id_restock, tipo_adquisicion, descripcion_partida, costo_partida, cantidad_piezas_estimada) VALUES (?, ?, ?, ?, ?)',
      [id_restock, tipo_adquisicion, descripcion_partida, costo_partida, cantidad_piezas_estimada]
    );
    res.status(201).json({ id_detalle_restock: result.lastInsertRowid, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- CATEGORÍAS ----------
app.get('/api/categorias', (req, res) => {
  try {
    const categorias = allQuery('SELECT * FROM Categoria');
    res.json(categorias);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/categorias', (req, res) => {
  const { nombre_categoria } = req.body;
  if (!nombre_categoria) return res.status(400).json({ error: 'nombre_categoria es requerido' });
  try {
    const result = runQuery('INSERT INTO Categoria (nombre_categoria) VALUES (?)', [nombre_categoria]);
    res.status(201).json({ id_categoria: result.lastInsertRowid, nombre_categoria });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ---------- MARCAS ----------
app.get('/api/marcas', (req, res) => {
  try {
    const marcas = allQuery('SELECT * FROM Marca');
    res.json(marcas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/marcas', (req, res) => {
  const { nombre_marca } = req.body;
  if (!nombre_marca) return res.status(400).json({ error: 'nombre_marca es requerido' });
  try {
    const result = runQuery('INSERT INTO Marca (nombre_marca) VALUES (?)', [nombre_marca]);
    res.status(201).json({ id_marca: result.lastInsertRowid, nombre_marca });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe una marca con ese nombre' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ---------- PRODUCTOS LIVE ----------
app.get('/api/productos-live', (req, res) => {
  try {
    const productos = allQuery(`
      SELECT pl.*, c.nombre_categoria, m.nombre_marca
      FROM ProductosLive pl
      JOIN Categoria c ON pl.id_categoria = c.id_categoria
      JOIN Marca m ON pl.id_marca = m.id_marca
      ORDER BY pl.id_producto_live DESC
    `);
    res.json(productos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/productos-live', (req, res) => {
  const {
    id_detalle_restock, id_categoria, id_marca, nombre_descripcion,
    talla, estado_prenda, nivel_rareza, precio_costo_estimado,
    umbral_precio_min, umbral_precio_max
  } = req.body;
  if (!id_detalle_restock || !id_categoria || !id_marca || !nombre_descripcion || !precio_costo_estimado || !umbral_precio_min || !umbral_precio_max) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const fecha_adquisicion = req.body.fecha_adquisicion || new Date().toISOString().split('T')[0];
  try {
    const result = runQuery(
      `INSERT INTO ProductosLive (
        id_detalle_restock, id_categoria, id_marca, nombre_descripcion, fecha_adquisicion,
        talla, estado_prenda, nivel_rareza, precio_costo_estimado, umbral_precio_min, umbral_precio_max
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id_detalle_restock, id_categoria, id_marca, nombre_descripcion, fecha_adquisicion,
       talla || null, estado_prenda || 'EXCELENTE', nivel_rareza || 'REGULAR',
       precio_costo_estimado, umbral_precio_min, umbral_precio_max]
    );
    res.status(201).json({ id_producto_live: result.lastInsertRowid, ...req.body, fecha_adquisicion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- PRODUCTOS FERIA ----------
app.get('/api/productos-feria', (req, res) => {
  try {
    const productos = allQuery('SELECT * FROM ProductosFeria ORDER BY fecha_feria DESC');
    res.json(productos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/productos-feria', (req, res) => {
  const { id_detalle_restock, fecha_feria, categoria_agrupada, precio_unificado_remate, cantidad_llevada, cantidad_retornada } = req.body;
  if (!id_detalle_restock || !fecha_feria || !categoria_agrupada || !precio_unificado_remate || !cantidad_llevada || !cantidad_retornada) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const result = runQuery(
      'INSERT INTO ProductosFeria (id_detalle_restock, fecha_feria, categoria_agrupada, precio_unificado_remate, cantidad_llevada, cantidad_retornada) VALUES (?, ?, ?, ?, ?, ?)',
      [id_detalle_restock, fecha_feria, categoria_agrupada, precio_unificado_remate, cantidad_llevada, cantidad_retornada]
    );
    res.status(201).json({ id_inventario_feria: result.lastInsertRowid, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- VENTAS FERIA ----------
app.get('/api/ventas-feria', (req, res) => {
  try {
    const ventas = allQuery('SELECT * FROM VentasFeria ORDER BY fecha_feria DESC');
    res.json(ventas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ventas-feria', (req, res) => {
  const { fecha_feria, descripcion_producto, cantidad, precio_unitario } = req.body;
  if (!fecha_feria || !descripcion_producto || !cantidad || !precio_unitario) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const result = runQuery(
      'INSERT INTO VentasFeria (fecha_feria, descripcion_producto, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
      [fecha_feria, descripcion_producto, cantidad, precio_unitario]
    );
    res.status(201).json({ id_venta_feria: result.lastInsertRowid, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- CLIENTES ----------
app.get('/api/clientes', (req, res) => {
  try {
    const clientes = allQuery('SELECT * FROM Cliente');
    res.json(clientes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clientes', (req, res) => {
  const { nombre_completo, usuario_tiktok, telefono_whatsapp, ciudad_destino } = req.body;
  if (!nombre_completo || !telefono_whatsapp) {
    return res.status(400).json({ error: 'nombre_completo y telefono_whatsapp son obligatorios' });
  }
  try {
    const result = runQuery(
      'INSERT INTO Cliente (nombre_completo, usuario_tiktok, telefono_whatsapp, ciudad_destino) VALUES (?, ?, ?, ?)',
      [nombre_completo, usuario_tiktok || null, telefono_whatsapp, ciudad_destino || null]
    );
    res.status(201).json({ id_cliente: result.lastInsertRowid, ...req.body });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El teléfono de WhatsApp ya está registrado' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ---------- VENTAS ----------
app.get('/api/ventas', (req, res) => {
  try {
    const ventas = allQuery(`
      SELECT v.*, c.nombre_completo AS cliente_nombre,
             d.id_detalle_venta, d.id_producto_live, d.precio_venta_real,
             p.nombre_descripcion AS producto_descripcion
      FROM Venta v
      JOIN Cliente c ON v.id_cliente = c.id_cliente
      LEFT JOIN DetalleVentaLive d ON v.id_venta = d.id_venta
      LEFT JOIN ProductosLive p ON d.id_producto_live = p.id_producto_live
      ORDER BY v.fecha_venta DESC
    `);
    res.json(ventas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ventas', (req, res) => {
  const { id_cliente, canal_venta, estado_venta, id_producto_live, precio_venta_real } = req.body;
  if (!id_cliente || !canal_venta || !estado_venta || !id_producto_live || !precio_venta_real) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const producto = getQuery('SELECT estado_disponibilidad FROM ProductosLive WHERE id_producto_live = ?', [id_producto_live]);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (producto.estado_disponibilidad !== 'DISPONIBLE') {
      return res.status(409).json({ error: `El producto no está disponible (estado: ${producto.estado_disponibilidad})` });
    }

    const transaction = db.transaction(() => {
      const resultVenta = runQuery(
        'INSERT INTO Venta (id_cliente, canal_venta, estado_venta, monto_total) VALUES (?, ?, ?, ?)',
        [id_cliente, canal_venta, estado_venta, precio_venta_real]
      );
      const id_venta = resultVenta.lastInsertRowid;

      runQuery(
        'INSERT INTO DetalleVentaLive (id_venta, id_producto_live, precio_venta_real) VALUES (?, ?, ?)',
        [id_venta, id_producto_live, precio_venta_real]
      );
      return id_venta;
    });

    const id_venta = transaction();
    res.status(201).json({ id_venta, message: 'Venta registrada correctamente' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El producto ya está en otra venta' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ---------- DESPACHOS ----------
app.get('/api/despachos', (req, res) => {
  try {
    const despachos = allQuery('SELECT * FROM DespachoEnvio');
    res.json(despachos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/despachos', upload.single('comprobante'), (req, res) => {
  const { id_venta, tipo_despacho, direccion_o_lugar, costo_envio, estado_logistico, comprobante_url } = req.body;
  
  if (!id_venta || !tipo_despacho || !direccion_o_lugar || !costo_envio) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  
  let comprobante = null;
  if (req.file) {
    comprobante = `/uploads/${req.file.filename}`;
  } else if (comprobante_url && comprobante_url.trim() !== '') {
    comprobante = comprobante_url.trim();
  }

  if (tipo_despacho === 'ENVIO_NACIONAL' || tipo_despacho === 'PUNTO_ENTREGA') {
    if (!comprobante) {
      return res.status(400).json({ error: `El comprobante es obligatorio para ${tipo_despacho === 'ENVIO_NACIONAL' ? 'envío nacional' : 'punto de entrega'}` });
    }
  }

  try {
    const result = runQuery(
      'INSERT INTO DespachoEnvio (id_venta, tipo_despacho, direccion_o_lugar, costo_envio, comprobante_respaldo, estado_logistico) VALUES (?, ?, ?, ?, ?, ?)',
      [id_venta, tipo_despacho, direccion_o_lugar, costo_envio, comprobante, estado_logistico || 'EMPACADO']
    );
    res.status(201).json({ id_despacho: result.lastInsertRowid, ...req.body, comprobante_respaldo: comprobante });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe un despacho para esta venta' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Actualizar estado logístico
app.put('/api/despachos/:id', (req, res) => {
  const { id } = req.params;
  const { estado_logistico } = req.body;
  if (!estado_logistico) {
    return res.status(400).json({ error: 'estado_logistico es requerido' });
  }
  try {
    const result = runQuery(
      'UPDATE DespachoEnvio SET estado_logistico = ? WHERE id_despacho = ?',
      [estado_logistico, id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Despacho no encontrado' });
    }
    res.json({ message: 'Estado actualizado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- GASTOS OPERATIVOS ----------
app.get('/api/gastos', (req, res) => {
  try {
    const gastos = allQuery('SELECT * FROM GastoOperativo ORDER BY fecha_gasto DESC');
    res.json(gastos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/gastos', (req, res) => {
  const { fecha_gasto, categoria_gasto, descripcion, monto } = req.body;
  if (!fecha_gasto || !categoria_gasto || !descripcion || !monto) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const result = runQuery(
      'INSERT INTO GastoOperativo (fecha_gasto, categoria_gasto, descripcion, monto) VALUES (?, ?, ?, ?)',
      [fecha_gasto, categoria_gasto, descripcion, monto]
    );
    res.status(201).json({ id_gasto: result.lastInsertRowid, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- ELIMINACIÓN GENÉRICA (con manejo de FK y cascada para restocks) ----------
app.delete('/api/:tabla/:id', (req, res) => {
  const { tabla, id } = req.params;
  
  const tablasPermitidas = {
    'restocks': 'RestockSemanal',
    'detalles-restock': 'DetalleRestock',
    'categorias': 'Categoria',
    'marcas': 'Marca',
    'productos-live': 'ProductosLive',
    'productos-feria': 'ProductosFeria',
    'clientes': 'Cliente',
    'ventas': 'Venta',
    'detalles-venta': 'DetalleVentaLive',
    'despachos': 'DespachoEnvio',
    'gastos': 'GastoOperativo',
    'ventas-feria': 'VentasFeria'
  };
  
  if (!tablasPermitidas[tabla]) {
    return res.status(400).json({ error: 'Tabla no válida' });
  }
  
  const nombreTabla = tablasPermitidas[tabla];
  const columnasId = {
    'RestockSemanal': 'id_restock',
    'DetalleRestock': 'id_detalle_restock',
    'Categoria': 'id_categoria',
    'Marca': 'id_marca',
    'ProductosLive': 'id_producto_live',
    'ProductosFeria': 'id_inventario_feria',
    'Cliente': 'id_cliente',
    'Venta': 'id_venta',
    'DetalleVentaLive': 'id_detalle_venta',
    'DespachoEnvio': 'id_despacho',
    'GastoOperativo': 'id_gasto',
    'VentasFeria': 'id_venta_feria'
  };
  
  const columnaId = columnasId[nombreTabla];
  
  try {
    // Si es un restock, eliminar primero sus detalles y productos asociados
    if (nombreTabla === 'RestockSemanal') {
      const transaction = db.transaction(() => {
        // Eliminar productos live que dependen de los detalles
        runQuery(`DELETE FROM ProductosLive WHERE id_detalle_restock IN (SELECT id_detalle_restock FROM DetalleRestock WHERE id_restock = ?)`, [id]);
        // Eliminar productos feria que dependen de los detalles
        runQuery(`DELETE FROM ProductosFeria WHERE id_detalle_restock IN (SELECT id_detalle_restock FROM DetalleRestock WHERE id_restock = ?)`, [id]);
        // Eliminar detalles de restock
        runQuery(`DELETE FROM DetalleRestock WHERE id_restock = ?`, [id]);
        // Finalmente eliminar el restock
        const result = runQuery(`DELETE FROM RestockSemanal WHERE id_restock = ?`, [id]);
        return result;
      });
      const result = transaction();
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Restock no encontrado' });
      }
      return res.json({ message: 'Restock y sus dependencias eliminados correctamente' });
    }
    
    // Para las demás tablas, eliminación directa
    const result = runQuery(`DELETE FROM ${nombreTabla} WHERE ${columnaId} = ?`, [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json({ message: 'Registro eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar:', err);
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(409).json({ 
        error: 'No se puede eliminar porque tiene registros relacionados. Elimine primero los registros dependientes.' 
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// ================== SERVIR FRONTEND ==================
app.use(express.static(path.join(__dirname, 'public')));

// ================== INICIO DEL SERVIDOR ==================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📊 Base de datos: ${DB_PATH}`);
});
