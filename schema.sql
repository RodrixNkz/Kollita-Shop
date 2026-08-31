PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- =====================================================================
-- MÓDULO 1: COMPRAS Y RESTOCK SEMANAL
-- =====================================================================

CREATE TABLE IF NOT EXISTS RestockSemanal (
    id_restock              INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_compra            DATE NOT NULL,
    monto_total_invertido   DECIMAL(10,2) NOT NULL CHECK (monto_total_invertido >= 0),
    origen_fondos           VARCHAR(60) NOT NULL,   -- Ej: Reinversión, Fondo Propio
    observaciones           TEXT
);

CREATE TABLE IF NOT EXISTS DetalleRestock (
    id_detalle_restock       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_restock                INTEGER NOT NULL,
    tipo_adquisicion          VARCHAR(20) NOT NULL
        CHECK (tipo_adquisicion IN ('FARDO_CERRADO','LOTE_SELECCIONADO','ROPA_COLGADA')),
    descripcion_partida       VARCHAR(150) NOT NULL,
    costo_partida              DECIMAL(10,2) NOT NULL CHECK (costo_partida >= 0),
    cantidad_piezas_estimada  INTEGER NOT NULL CHECK (cantidad_piezas_estimada >= 0),

    FOREIGN KEY (id_restock) REFERENCES RestockSemanal (id_restock)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- =====================================================================
-- MÓDULO 2: CATÁLOGO E INVENTARIO (LIVE Y VENTA EN MASA)
-- =====================================================================

CREATE TABLE IF NOT EXISTS Categoria (
    id_categoria      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_categoria  VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS Marca (
    id_marca      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_marca  VARCHAR(50) NOT NULL UNIQUE
);

-- Inventario de prendas unitarias exclusivas (TikTok Live / WhatsApp)
CREATE TABLE IF NOT EXISTS ProductosLive (
    id_producto_live        INTEGER PRIMARY KEY AUTOINCREMENT,
    id_detalle_restock      INTEGER NOT NULL,
    id_categoria             INTEGER NOT NULL,
    id_marca                  INTEGER NOT NULL,
    nombre_descripcion       VARCHAR(150) NOT NULL,
    fecha_adquisicion        DATE NOT NULL,
    talla                     VARCHAR(10),
    estado_prenda             VARCHAR(15) NOT NULL
        CHECK (estado_prenda IN ('EXCELENTE','USADO_A','USADO_B','DETALLE')),
    nivel_rareza              VARCHAR(10) NOT NULL
        CHECK (nivel_rareza IN ('ALTA','MEDIA','REGULAR')),
    precio_costo_estimado    DECIMAL(10,2) NOT NULL CHECK (precio_costo_estimado >= 0),
    umbral_precio_min        DECIMAL(10,2) NOT NULL CHECK (umbral_precio_min >= 0),
    umbral_precio_max        DECIMAL(10,2) NOT NULL CHECK (umbral_precio_max >= umbral_precio_min),
    estado_disponibilidad    VARCHAR(15) NOT NULL DEFAULT 'DISPONIBLE'
        CHECK (estado_disponibilidad IN ('DISPONIBLE','RESERVADO','VENDIDO')),

    FOREIGN KEY (id_detalle_restock) REFERENCES DetalleRestock (id_detalle_restock)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (id_categoria) REFERENCES Categoria (id_categoria)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (id_marca) REFERENCES Marca (id_marca)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Inventario agrupado para ventas en masa en feria presencial
CREATE TABLE IF NOT EXISTS ProductosFeria (
    id_inventario_feria       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_detalle_restock        INTEGER NOT NULL,
    fecha_feria                DATE NOT NULL,
    categoria_agrupada         VARCHAR(50) NOT NULL,
    precio_unificado_remate    DECIMAL(10,2) NOT NULL CHECK (precio_unificado_remate >= 0),
    cantidad_llevada            INTEGER NOT NULL CHECK (cantidad_llevada >= 0),
    cantidad_retornada          INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_retornada >= 0),

    -- Columnas generadas calculadas automáticamente
    cantidad_vendida        INTEGER
        GENERATED ALWAYS AS (cantidad_llevada - cantidad_retornada) STORED,
    ingreso_total_calculado DECIMAL(10,2)
        GENERATED ALWAYS AS ((cantidad_llevada - cantidad_retornada) * precio_unificado_remate) STORED,

    CHECK (cantidad_retornada <= cantidad_llevada),

    FOREIGN KEY (id_detalle_restock) REFERENCES DetalleRestock (id_detalle_restock)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- =====================================================================
-- MÓDULO 3: CLIENTES Y VENTAS DIRECTAS / LIVE
-- =====================================================================

CREATE TABLE IF NOT EXISTS Cliente (
    id_cliente          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo     VARCHAR(120) NOT NULL,
    usuario_tiktok      VARCHAR(50),
    telefono_whatsapp   VARCHAR(20) NOT NULL UNIQUE,
    ciudad_destino      VARCHAR(60)
);

CREATE TABLE IF NOT EXISTS Venta (
    id_venta        INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente       INTEGER NOT NULL,
    fecha_venta      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    canal_venta      VARCHAR(20) NOT NULL
        CHECK (canal_venta IN ('TIKTOK_LIVE','WHATSAPP','PRESENCIAL')),
    estado_venta     VARCHAR(15) NOT NULL DEFAULT 'COMPLETADO'
        CHECK (estado_venta IN ('COMPLETADO','PAGADO','RESERVADO','CANCELADO')),
    monto_total      DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (monto_total >= 0),

    FOREIGN KEY (id_cliente) REFERENCES Cliente (id_cliente)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS DetalleVentaLive (
    id_detalle_venta    INTEGER PRIMARY KEY AUTOINCREMENT,
    id_venta             INTEGER NOT NULL,
    id_producto_live      INTEGER NOT NULL UNIQUE, -- Una prenda única solo se vende 1 vez
    precio_venta_real     DECIMAL(10,2) NOT NULL CHECK (precio_venta_real >= 0),

    FOREIGN KEY (id_venta) REFERENCES Venta (id_venta)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (id_producto_live) REFERENCES ProductosLive (id_producto_live)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- =====================================================================
-- MÓDULO 4: LOGÍSTICA, DESPACHOS Y GASTOS OPERATIVOS EXTRA
-- =====================================================================

CREATE TABLE IF NOT EXISTS DespachoEnvio (
    id_despacho            INTEGER PRIMARY KEY AUTOINCREMENT,
    id_venta                INTEGER NOT NULL UNIQUE,
    tipo_despacho            VARCHAR(20) NOT NULL
        CHECK (tipo_despacho IN ('ENTREGA_LOCAL','PUNTO_ENTREGA','ENVIO_NACIONAL')),
    direccion_o_lugar        TEXT NOT NULL,
    costo_envio               DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (costo_envio >= 0),
    comprobante_respaldo     VARCHAR(200),
    estado_logistico          VARCHAR(15) NOT NULL DEFAULT 'EMPACADO'
        CHECK (estado_logistico IN ('EMPACADO','LISTO_ENTREGA','ENTREGADO','DEVUELTO')),
    fecha_entrega_real        DATETIME,

    FOREIGN KEY (id_venta) REFERENCES Venta (id_venta)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CHECK (
        (tipo_despacho = 'ENVIO_NACIONAL' AND comprobante_respaldo IS NOT NULL)
        OR
        (tipo_despacho IN ('ENTREGA_LOCAL','PUNTO_ENTREGA'))
    )
);

CREATE TABLE IF NOT EXISTS GastoOperativo (
    id_gasto            INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_gasto         DATE NOT NULL,
    categoria_gasto     VARCHAR(30) NOT NULL
        CHECK (categoria_gasto IN ('PASAJES_TRANSPORTE','BOLSA_EMPAQUE','ALIMENTACION','PUESTO_FERIA','COMISION_PAGO','OTRO')),
    descripcion         VARCHAR(150) NOT NULL,
    monto               DECIMAL(10,2) NOT NULL CHECK (monto > 0)
);

-- =====================================================================
-- TRIGGERS DE AUTOMATIZACIÓN DE STOCK
-- =====================================================================

-- 1. Al agregar un producto a la venta, cambia su disponibilidad según el estado de la venta
CREATE TRIGGER IF NOT EXISTS trg_actualizar_stock_al_vender
AFTER INSERT ON DetalleVentaLive
BEGIN
    UPDATE ProductosLive
    SET estado_disponibilidad = CASE 
        WHEN (SELECT estado_venta FROM Venta WHERE id_venta = NEW.id_venta) = 'RESERVADO' THEN 'RESERVADO'
        ELSE 'VENDIDO'
    END
    WHERE id_producto_live = NEW.id_producto_live;
END;

-- 2. Si una reserva previa pasa a COMPLETADO o PAGADO, el producto cambia a VENDIDO
CREATE TRIGGER IF NOT EXISTS trg_confirmar_reserva_a_vendido
AFTER UPDATE ON Venta
WHEN NEW.estado_venta IN ('COMPLETADO', 'PAGADO') AND OLD.estado_venta = 'RESERVADO'
BEGIN
    UPDATE ProductosLive
    SET estado_disponibilidad = 'VENDIDO'
    WHERE id_producto_live IN (
        SELECT id_producto_live FROM DetalleVentaLive WHERE id_venta = NEW.id_venta
    );
END;

-- 3. Si una venta/reserva se CANCELA, el producto vuelve a estar DISPONIBLE
CREATE TRIGGER IF NOT EXISTS trg_cancelar_venta_liberar_stock
AFTER UPDATE ON Venta
WHEN NEW.estado_venta = 'CANCELADO'
BEGIN
    UPDATE ProductosLive
    SET estado_disponibilidad = 'DISPONIBLE'
    WHERE id_producto_live IN (
        SELECT id_producto_live FROM DetalleVentaLive WHERE id_venta = NEW.id_venta
    );
END;

-- =====================================================================
-- ÍNDICES DE RENDIMIENTO
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_detallerestock_restock       ON DetalleRestock (id_restock);
CREATE INDEX IF NOT EXISTS idx_productoslive_detalle         ON ProductosLive (id_detalle_restock);
CREATE INDEX IF NOT EXISTS idx_productoslive_categoria        ON ProductosLive (id_categoria);
CREATE INDEX IF NOT EXISTS idx_productoslive_marca            ON ProductosLive (id_marca);
CREATE INDEX IF NOT EXISTS idx_productoslive_disponibilidad   ON ProductosLive (estado_disponibilidad);
CREATE INDEX IF NOT EXISTS idx_productosferia_detalle         ON ProductosFeria (id_detalle_restock);
CREATE INDEX IF NOT EXISTS idx_productosferia_fecha           ON ProductosFeria (fecha_feria);
CREATE INDEX IF NOT EXISTS idx_venta_cliente                  ON Venta (id_cliente);
CREATE INDEX IF NOT EXISTS idx_venta_fecha                    ON Venta (fecha_venta);
CREATE INDEX IF NOT EXISTS idx_detalleventalive_venta          ON DetalleVentaLive (id_venta);
CREATE INDEX IF NOT EXISTS idx_despachoenvio_venta             ON DespachoEnvio (id_venta);
CREATE INDEX IF NOT EXISTS idx_restocksemanal_fecha            ON RestockSemanal (fecha_compra);
CREATE INDEX IF NOT EXISTS idx_gastooperativo_fecha            ON GastoOperativo (fecha_gasto);

COMMIT;

-- =====================================================================
-- MÓDULO 5: VISTA FINANCIERA UNIFICADA
-- =====================================================================

DROP VIEW IF EXISTS Vista_Balance_Diario;

CREATE VIEW Vista_Balance_Diario AS
    -- Egresos: Inversión en Restock Semanal
    SELECT
        fecha_compra                    AS fecha,
        monto_total_invertido           AS egresos_restock,
        0.0                              AS egresos_operativos,
        0.0                              AS ingresos_live,
        0.0                              AS ingresos_feria
    FROM RestockSemanal

    UNION ALL

    -- Egresos: Gastos Operativos Extra
    SELECT
        fecha_gasto                     AS fecha,
        0.0                              AS egresos_restock,
        monto                            AS egresos_operativos,
        0.0                              AS ingresos_live,
        0.0                              AS ingresos_feria
    FROM GastoOperativo

    UNION ALL

    -- Ingresos: Ventas Directas / Live (Prendas Únicas)
    SELECT
        date(v.fecha_venta)             AS fecha,
        0.0                              AS egresos_restock,
        0.0                              AS egresos_operativos,
        dvl.precio_venta_real           AS ingresos_live,
        0.0                              AS ingresos_feria
    FROM Venta v
    JOIN DetalleVentaLive dvl ON dvl.id_venta = v.id_venta
    WHERE v.estado_venta IN ('COMPLETADO','PAGADO')

    UNION ALL

    -- Ingresos: Ventas en Masa / Puesto de Feria
    SELECT
        fecha_feria                     AS fecha,
        0.0                              AS egresos_restock,
        0.0                              AS egresos_operativos,
        0.0                              AS ingresos_live,
        ingreso_total_calculado         AS ingresos_feria
    FROM ProductosFeria;