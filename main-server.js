const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
const { log } = require("console");
const { emit } = require("process");
require("dotenv").config();

const storage = multer.diskStorage({
  destination: process.env.PATHUPLOAD,
  filename: function (req, file, cb) {
    const fileName = file.originalname;
    cb(null, fileName);
  },
});
const upload = multer({ storage });
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

let tamanio = 0
let totalSize = 0
let uploadedSize= 0

app.use(express.static("./public"));

app.post("/upload", upload.array("files"), (req, res) => {
  const files = req.files; // Lista de archivos cargados

  if (!files || files.length === 0) {
    return res.status(400).json({ message: "No se cargaron archivos" });
  }


  totalSize = files.reduce((acc, file) => acc + file.size, 0);
  uploadedSize = 0; // Reiniciar el tamaño subido

  // Iterar sobre los archivos cargados
  files.forEach((file) => {
    const filePath = file.path;
    const size = file.size;

    tamanio+= size
    console.log(tamanio)

    // Crear un flujo de lectura para el archivo
    const readStream = fs.createReadStream(filePath);

    let uploadedSize = 0;

    io.emit("uploadComplete");

    // Manejar el evento 'data' para obtener el progreso de subida
    readStream.on("data", (chunk) => {
      uploadedSize += chunk.length;

      // Calcular el progreso actual en porcentaje
      let progress = Math.floor((uploadedSize / size) * 100);
      // Emitir el progreso a través de Socket.IO
      io.emit("progressUpdate", progress);
    });

    // Manejar el evento 'end' para finalizar la subida
    readStream.on("end", () => {
      // Emitir evento de finalización a través de Socket.IO
      io.emit("uploadComplete", { fileName: file.originalname });

      // Eliminar el archivo temporal si es necesario
      // Puedes manejar la eliminación si quieres

      console.log(`Archivo ${file.originalname} subido con éxito`);
    });
  });



  // Enviar respuesta al cliente cuando todos los archivos se hayan cargado
  res.status(200).json({ message: "Archivos subidos exitosamente" });
  tamanio = 0
});

io.on("connection", (socket) => {
  console.log("Cliente conectado");

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

io.on("getProgress", () => {
  // Aquí puedes obtener el progreso actual de la carga y enviarlo al cliente
  // Por ejemplo, puedes obtener el progreso de una variable global o desde una base de datos
  const progress = 50;
  console.log('solicitud de progreso')
  socket.emit("progressUpdate", progress);
});

server.listen(3000, () => {
  console.log("Servidor en ejecución en el puerto 3000");
});
