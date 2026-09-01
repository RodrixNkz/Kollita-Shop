const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./kollita.db');

// Datos para generación aleatoria realista
const categorias = ['Canguro', 'Chamarra', 'Pantalón Jeans', 'Polera', 'Polerón', 'Chaqueta corta'];
const marcas = ['Nike', 'Adidas', 'Tommy Hilfiger', 'Puma', 'North Face', 'Columbia', 'Sin Marca'];
const tallas = ['S', 'M', 'L', 'XL', '30', '32'];
const estados = ['EXCELENTE', 'USADO_A', 'USADO_B', 'DETALLE'];
const rarezas = ['ALTA', 'MEDIA', 'REGULAR'];
const canales = ['TIKTOK_LIVE', 'WHATSAPP', 'PRESENCIAL'];
const ciudades = ['La Paz', 'El Alto', 'Cochabamba', 'Santa Cruz', 'Oruro'];
const gastosCat = ['PASAJES_TRANSPORTE', 'BOLSA_EMPAQUE', 'ALIMENTACION', 'PUESTO_FERIA', 'COMISION_PAGO'];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON;");
    console.log("🚀 Iniciando generación masiva de 250 registros de prueba...");

    db.run("BEGIN TRANSACTION;");

    // 1. Insertar Catálogos Básicos
    const stmtCat = db.prepare("INSERT OR IGNORE INTO Categoria (nombre_categoria) VALUES (?)");
    categorias.forEach(c => stmtCat.run(c));
    stmtCat.finalize();

    const stmtMarca = db.prepare("INSERT OR IGNORE INTO Marca (nombre_marca) VALUES (?)");
    marcas.forEach(m => stmtMarca.run(m));
    stmtMarca.finalize();

    // 2. Insertar Restock y DetalleRestock
    db.run(`INSERT INTO RestockSemanal (fecha_compra, monto_total_invertido, origen_fondos, observaciones) 
            VALUES ('2026-08-01', 3500.00, 'Capital de Reinversión', 'Fardo de ropa mixta de marca')`);

    db.run(`INSERT INTO DetalleRestock (id_restock, tipo_adquisicion, descripcion_partida, costo_partida, cantidad_piezas_estimada) 
            VALUES (1, 'FARDO_CERRADO', 'Lote mixto chamarras y canguros', 3500.00, 250)`);

    // 3. Insertar 250 ProductosLive
    const stmtProd = db.prepare(`
        INSERT INTO ProductosLive (
            id_detalle_restock, id_categoria, id_marca, nombre_descripcion, 
            fecha_adquisicion, talla, estado_prenda, nivel_rareza, 
            precio_costo_estimado, umbral_precio_min, umbral_precio_max, estado_disponibilidad
        ) VALUES (1, ?, ?, ?, '2026-08-01', ?, ?, ?, ?, ?, ?, 'VENDIDO')
    `);

    for (let i = 1; i <= 250; i++) {
        const catId = getRandomNumber(1, categorias.length);
        const marcaId = getRandomNumber(1, marcas.length);
        const desc = `${categorias[catId - 1]} ${marcas[marcaId - 1]} #${i}`;
        const talla = getRandomItem(tallas);
        const estado = getRandomItem(estados);
        const rareza = getRandomItem(rarezas);
        const costo = getRandomNumber(15, 30);
        const pMin = costo + getRandomNumber(15, 25);
        const pMax = pMin + getRandomNumber(20, 50);

        stmtProd.run(catId, marcaId, desc, talla, estado, rareza, costo, pMin, pMax);
    }
    stmtProd.finalize();

    // 4. Insertar Clientes (50 clientes recurrentes)
    const stmtCliente = db.prepare(`
        INSERT OR IGNORE INTO Cliente (nombre_completo, usuario_tiktok, telefono_whatsapp, ciudad_destino) 
        VALUES (?, ?, ?, ?)
    `);
    for (let i = 1; i <= 50; i++) {
        stmtCliente.run(`Cliente ${i}`, `@user_live_${i}`, `700000${i < 10 ? '0' + i : i}`, getRandomItem(ciudades));
    }
    stmtCliente.finalize();

    // 5. Insertar 250 Ventas y sus detalles (Operaciones de Venta)
    const stmtVenta = db.prepare(`
        INSERT INTO Venta (id_cliente, fecha_venta, canal_venta, estado_venta, monto_total) 
        VALUES (?, ?, ?, 'COMPLETADO', ?)
    `);

    const stmtDetalleVenta = db.prepare(`
        INSERT INTO DetalleVentaLive (id_venta, id_producto_live, precio_venta_real) 
        VALUES (?, ?, ?)
    `);

    for (let i = 1; i <= 250; i++) {
        const clienteId = getRandomNumber(1, 50);
        const canal = getRandomItem(canales);
        const precioReal = getRandomNumber(40, 110);
        const dia = getRandomNumber(1, 28);
        const fechaVenta = `2026-08-${dia < 10 ? '0' + dia : dia} 19:30:00`;

        stmtVenta.run(clienteId, fechaVenta, canal, precioReal, function(err) {
            if (!err) {
                // this.lastID obtiene el id_venta recién insertado
                stmtDetalleVenta.run(this.lastID, i, precioReal);
            }
        });
    }

    // 6. Insertar registros de Feria Presencial (Venta en masa)
    const stmtFeria = db.prepare(`
        INSERT INTO ProductosFeria (id_detalle_restock, fecha_feria, categoria_agrupada, precio_unificado_remate, cantidad_llevada, cantidad_retornada)
        VALUES (1, ?, 'Ropa variada de remate', 15.00, ?, ?)
    `);
    stmtFeria.run('2026-08-08', 60, 10);
    stmtFeria.run('2026-08-15', 50, 5);
    stmtFeria.finalize();

    // 7. Insertar Gastos Operativos Extra
    const stmtGasto = db.prepare(`
        INSERT INTO GastoOperativo (fecha_gasto, categoria_gasto, descripcion, monto)
        VALUES (?, ?, ?, ?)
    `);
    for (let i = 1; i <= 10; i++) {
        const dia = getRandomNumber(1, 28);
        const fecha = `2026-08-${dia < 10 ? '0' + dia : dia}`;
        stmtGasto.run(fecha, getRandomItem(gastosCat), `Gasto operativo de rutina #${i}`, getRandomNumber(10, 50));
    }
    stmtGasto.finalize();

    db.run("COMMIT;", (err) => {
        if (err) {
            console.error("❌ Error al insertar datos:", err.message);
        } else {
            console.log("✅ ¡Proceso completado! Se han insertado 250 productos, 250 ventas y todos los registros relacionados.");
        }
        db.close();
    });
});