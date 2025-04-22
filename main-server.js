const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
require("dotenv").config();

const gameplayPath = process.env.PATHUPLOADone;
const privatePath = process.env.PATHUPLOADtwo;
const edicionPath = process.env.PATHUPLOADthree;

const app = express();
const server = http.createServer(app);

app.use(express.static("./public")); // Servir archivos estáticos desde /public
// Asegurar que la carpeta de subida existe
// if (!fs.existsSync(uploadPath)) {
//   fs.mkdirSync(uploadPath, { recursive: true });
// }

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log(req.query);
    if (req.query.category == "df" || req.query.category == "private") {
      cb(null, privatePath);
    }
    if (req.query.category == "gameplay") {
      cb(null, gameplayPath);
    }
    if (req.query.category == "edicion"){
      cb(null, edicionPath)
    }
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

server.keepAliveTimeout = 21474836;
server.timeout = 21474832;
server.headersTimeout = 21474836;
const io = socketIO(server);

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
