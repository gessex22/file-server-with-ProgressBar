const express = require("express");
const os = require("os");
const fs = require("fs");
const path = require("path");
const cors = require('cors');
const http = require("http");
const socketIO = require("socket.io");
const { Server, EVENTS } = require("@tus/server");
const { FileStore } = require("@tus/file-store");
const mime = require('mime-types');

require("dotenv").config();

// Rutas de destino
const gameplayPath = process.env.PATHUPLOADone || "./uploads/gameplay";
const privatePath  = process.env.PATHUPLOADtwo  || "./uploads/private";
const edicionPath  = process.env.PATHUPLOADthree || "./uploads/edicion";
const tempTusPath  = "./uploads/.tmp_tus";

// Crear carpetas si no existen
[gameplayPath, privatePath, edicionPath, tempTusPath].forEach(p => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const app    = express();
const server = http.createServer(app);
const io     = socketIO(server);

// ── Sanitizar nombre de archivo ──────────────────────────────────────────────
function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_');
}

// ── Decodificar metadata TUS (viene en base64 por protocolo) ─────────────────
// El protocolo TUS envía: "key base64val,key2 base64val2"
// Ejemplo real: "filename dmlkZW8ubXA0,category Z2FtZXBsYXk="
function parseTusMetadata(metadataString) {
    const result = {};
    if (!metadataString) return result;

    metadataString.split(',').forEach(pair => {
        const parts = pair.trim().split(' ');
        const key   = parts[0];
        const value = parts[1] ? Buffer.from(parts[1], 'base64').toString('utf8') : '';
        result[key] = value;
    });

    return result;
}

// ── Lógica de mover y renombrar archivo al completarse ───────────────────────
// Estrategia de dos pasos para no interferir con los chunks de TUS:
//   1. MOVER  → tmp_tus/{id}  a  finalDir/{id}   (nombre TUS intacto)
//   2. RENOMBRAR → finalDir/{id}  a  finalDir/{nombre_real.ext}
async function handleCompletedUpload(upload) {
    // Leer metadata — @tus/server puede entregarla como objeto ya parseado
    // o como string raw del protocolo ("key base64val,key2 base64val2")
    const meta = typeof upload.metadata === 'string'
        ? parseTusMetadata(upload.metadata)
        : upload.metadata || {};

    const filename = meta.filename;
    const filetype = meta.filetype;
    const category = meta.category;

    console.log(`📦 Metadata → filename: "${filename}" | filetype: "${filetype}" | category: "${category}"`);

    // Seleccionar carpeta destino según categoría
    let finalDir = privatePath;
    if      (category === "gameplay") finalDir = gameplayPath;
    else if (category === "edicion")  finalDir = edicionPath;
    else if (category && category !== "private") {
        console.warn(`⚠️  Categoría desconocida: "${category}", usando private`);
    }

    const tusFilePath  = path.join(tempTusPath, upload.id);
    const tusInfoPath  = `${tusFilePath}.info`;
    const movedTmpPath = path.join(finalDir, upload.id); // paso 1: destino con ID de TUS

    try {
        if (!fs.existsSync(tusFilePath)) {
            throw new Error(`Archivo temporal no encontrado: ${tusFilePath}`);
        }

        // ── Paso 1: MOVER con el ID de TUS (sin tocar el nombre todavía) ────
        await fs.promises.rename(tusFilePath, movedTmpPath);
        console.log(`📁 Movido a carpeta destino: ${movedTmpPath}`);

        // Limpiar el .info huérfano que TUS deja en tmp
        if (fs.existsSync(tusInfoPath)) {
            await fs.promises.unlink(tusInfoPath);
            console.log(`🧹 .info eliminado`);
        }

        // ── Paso 2: RENOMBRAR al nombre real dentro de la carpeta destino ───
        let finalPath = movedTmpPath; // fallback si no hay filename

        if (filename) {
            let baseName     = sanitizeFilename(filename);
            const currentExt = path.extname(baseName);

            // Agregar extensión si el archivo no la trae
            if (!currentExt && filetype) {
                const guessedExt = mime.extension(filetype);
                baseName = guessedExt ? `${baseName}.${guessedExt}` : `${baseName}.bin`;
            } else if (!currentExt) {
                baseName = `${baseName}.bin`;
            }

            // Evitar sobreescritura si ya existe un archivo con ese nombre
            finalPath = path.join(finalDir, baseName);
            if (fs.existsSync(finalPath)) {
                const ext  = path.extname(baseName);
                const name = path.basename(baseName, ext);
                finalPath  = path.join(finalDir, `${name}_${Date.now()}${ext}`);
            }

            await fs.promises.rename(movedTmpPath, finalPath);
            console.log(`✅ Renombrado a: ${finalPath}`);
        } else {
            console.warn(`⚠️  Sin filename en metadata, el archivo queda con ID de TUS: ${movedTmpPath}`);
        }

        io.emit("uploadComplete", {
            fileName: path.basename(finalPath),
            category: category || "private",
            path:     finalPath,
            size:     upload.size
        });

    } catch (err) {
        console.error("❌ Error procesando archivo:", err);
        io.emit("uploadError", { fileName: filename || upload.id, error: err.message });
    }
}

// ── Configuración del servidor TUS ───────────────────────────────────────────
// IMPORTANTE: NO usar onUploadFinish para mover archivos.
// Ese hook se dispara ANTES de que TUS envíe la respuesta al cliente —
// el archivo sigue abierto/bloqueado en ese momento. Moverlo ahí causa
// el error 500 en el PATCH final del cliente.
// EVENTS.POST_FINISH se dispara DESPUÉS de que TUS respondió 204 y cerró
// el archivo, por eso es el lugar correcto para moverlo.
const tusServer = new Server({
    path: "/upload",
    datastore: new FileStore({ directory: tempTusPath }),
    maxSize: 40 * 1024 * 1024 * 1024 // 40 GB
});

tusServer.on(EVENTS.POST_FINISH, async (req, res, upload) => {
    await handleCompletedUpload(upload);
});

// ── Timeouts del servidor HTTP ────────────────────────────────────────────────
// Sin esto, si la red se corta entre chunks Node queda esperando para siempre
// sin disparar ningún error — el cliente ve la barra congelada sin explicación.
server.timeout         = 0;       // sin límite global (archivos de 40GB tardan mucho)
server.keepAliveTimeout = 65000;  // mantiene TCP vivo entre chunks (> 60s de proxies)
server.headersTimeout   = 70000;  // debe ser siempre > keepAliveTimeout

// Timeout por request: si un PATCH tarda más de 2 min sin actividad → cierra
// Esto fuerza al cliente tus-js-client a detectar el corte y reintentar
server.timeout        = 0;       // sin timeout global (archivos grandes)
server.keepAliveTimeout = 65000; // 65 s (mayor que proxies/load balancers)
server.headersTimeout   = 70000; // debe ser > keepAliveTimeout

// ── CORS + Private Network Access ────────────────────────────────────────────
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
        'Origin', 'X-Requested-With', 'Content-Type', 'Accept',
        'Authorization', 'Tus-Resumable', 'Upload-Length',
        'Upload-Metadata', 'Upload-Offset', 'Content-Length',
        'Access-Control-Request-Private-Network'
    ],
    exposedHeaders: [
        'Location', 'Upload-Offset', 'Upload-Length',
        'Tus-Version', 'Tus-Resumable', 'Tus-Max-Size',
        'Tus-Extension', 'Upload-Metadata'
    ]
}));

// Cabecera requerida por Chrome para redes privadas
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});

// ── Rutas TUS ────────────────────────────────────────────────────────────────
app.all('/upload',    (req, res) => tusServer.handle(req, res));
app.all('/upload/*',  (req, res) => tusServer.handle(req, res));

// ── Archivos estáticos ───────────────────────────────────────────────────────
app.use(express.static("./public"));

// ── Endpoint de información ──────────────────────────────────────────────────
app.get("/server-info", (req, res) => {
    res.json({
        serverName:  process.env.SERVER_NAME || "Servidor Local",
        environment: process.env.NODE_ENV    || "development",
        port:        3000,
        hostname:    os.hostname(),
    });
});

// ── Socket.io ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log("🔌 Cliente conectado mediante Socket.io");

    socket.on("disconnect", () => {
        console.log("🔌 Cliente desconectado");
    });
});

// ── Iniciar servidor ─────────────────────────────────────────────────────────
server.listen(3000, () => {
    console.log("🚀 Servidor con TUS y Socket.io corriendo en puerto 3000");
});