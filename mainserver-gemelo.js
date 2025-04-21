const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");

require("dotenv").config();

const destination = process.env.PATHUPLOADS || "uploads";
if (!fs.existsSync(destination)) {
  fs.mkdirSync(destination, { recursive: true });
}

// Multer Config (Evita archivos peligrosos)
const storage = multer.diskStorage({
  destination,
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB
  fileFilter: (req, file, cb) => {
    // const allowedTypes = ["video/mp4", "image/png", "image/jpeg"];
    // if (!allowedTypes.includes(file.mimetype)) {
    //   return cb(new Error("Tipo de archivo no permitido"), false);
    // }
    cb(null, true);
  },
});

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

server.timeout = undefined;
server.keepAliveTimeout = 9000000;
server.headersTimeout = 9050000;

// Emitir eventos con Throttle (500ms)
const throttle = (func, limit) => {
  let lastFunc;
  let lastRan;
  return function (...args) {
    const context = this;
    if (!lastRan) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
};

const emitProgress = throttle((progress, fileName) => {
  io.emit("progressUpdate", { progress, fileName });
}, 500);

app.use(express.static("./public"));

app.post("/upload", upload.array("files"), (req, res) => {
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ message: "No se cargaron archivos" });
  }

  files.forEach((file) => {
    const filePath = path.join(destination, file.filename);
    const totalSize = file.size;

    const readStream = fs.createReadStream(filePath);
    let uploadedSize = 0;

    readStream.on("data", (chunk) => {
      uploadedSize += chunk.length;
      let progress = Math.floor((uploadedSize / totalSize) * 100);
      emitProgress(progress, file.filename);
    });

    readStream.on("end", () => {
      io.emit("uploadComplete", { fileName: file.filename });
      console.log(`Archivo ${file.filename} subido con éxito`);
    });

    readStream.on("error", (err) => {
      console.error(`Error al leer el archivo ${file.filename}:`, err);
    });
  });

  res.status(200).json({ message: "Archivos subidos exitosamente" });
});

io.on("connection", (socket) => {
  console.log("Cliente conectado");

  socket.on("getProgress", () => {
    socket.emit("progressUpdate", { progress: 50 });
  });

  const pingInterval = setInterval(() => {
    socket.emit("ping", { time: new Date() });
  }, 5000);

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
    clearInterval(pingInterval);
  });
});

server.listen(3000, () => {
  console.log("✅ Servidor en ejecución en el puerto 3000 (Producción)");
});
