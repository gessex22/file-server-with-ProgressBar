const express = require("express");
const multer = require("multer");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Variables para el progreso de la subida
let totalSize = 0; // Tamaño total de todos los archivos
let uploadedSize = 0; // Tamaño total subido hasta el momento

// Configuración de almacenamiento personalizado para multer
const storage = multer.diskStorage({
  destination: process.env.PATHUPLOAD,
  filename: function (req, file, cb) {
    const fileName = file.originalname;
    cb(null, fileName);
  },
});

// Middleware de multer con almacenamiento personalizado
const upload = multer({ storage });

app.use(express.static("./public"));

// Ruta para subir archivos
app.post("/upload", upload.array("files"), (req, res) => {
  const files = req.files; // Lista de archivos cargados

  if (!files || files.length === 0) {
    return res.status(400).json({ message: "No se cargaron archivos" });
  }

  // Calcular el tamaño total de todos los archivos
  totalSize = files.reduce((acc, file) => acc + file.size, 0);
  uploadedSize = 0; // Reiniciar el tamaño subido

  // Enviar respuesta al cliente cuando todos los archivos se hayan cargado
  res.status(200).json({ message: "Archivos subidos exitosamente" });
});

// Middleware personalizado para calcular el progreso de subida
app.use((req, res, next) => {
  if (req.method === "POST" ) {
    let bodyLength = 0;

    // Escuchar el evento 'data' para calcular el progreso
    req.on("data", (chunk) => {
      bodyLength += chunk.length;
  console.log(totalSize)
      // Calcular el progreso total en porcentaje
      const progress = Math.floor((bodyLength / totalSize) * 100);

      // Emitir el progreso a través de Socket.IO
      io.emit("progressUpdate", progress);
    });

    // Escuchar el evento 'end' para finalizar la subida
    req.on("end", () => {
      console.log("Subida completada");
      io.emit("uploadComplete");
    });
  }

  next();
});

// Configuración de Socket.IO
io.on("connection", (socket) => {
  console.log("Cliente conectado");

  // Manejar la solicitud de progreso desde el cliente
  socket.on("getProgress", () => {
    const progress = Math.floor((uploadedSize / totalSize) * 100);
    socket.emit("progressUpdate", progress);
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

server.listen(3000, () => {
  console.log("Servidor en ejecución en el puerto 3000");
});