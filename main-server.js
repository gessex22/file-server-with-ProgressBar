const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
require("dotenv").config();

const uploadPath = process.env.PATHUPLOAD || "uploads/";

// Asegurar que la carpeta de subida existe
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadPath,
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

const app = express();
const server = http.createServer(app);

server.keepAliveTimeout = 21474836
server.timeout = 21474832
server.headersTimeout = 21474836
const io = socketIO(server);

app.use(express.static("./public")); // Servir archivos estáticos desde /public

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No se cargó ningún archivo" });
  }

  console.log(`Archivo recibido: ${req.file.originalname}`);

  res.status(200).json({
    message: "Archivo subido exitosamente",
    fileName: req.file.originalname,
  });

  io.emit("uploadComplete", { fileName: req.file.originalname });
});

io.on("connection", (socket) => {
  console.log("Cliente conectado");

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

server.listen(3000, () => {
  console.log("Servidor en ejecución en el puerto 3000");
});

