const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
const { log } = require("console");
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: function (req, file, cb) {
    // const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // const fileExtension = path.extname(file.originalname);
    const fileName = file.originalname;
    cb(null, fileName);
  },
});
const upload = multer({ storage });
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
app.use(express.static("public"));

app.post("/upload", upload.single("files"), (req, res) => {
  const uploadedFile = req.file;
  const filePath = uploadedFile.path;

  // Obtener el tamaño del archivo
  const { size } = fs.statSync(filePath);

  // Crear un flujo de lectura para el archivo
  const readStream = fs.createReadStream(filePath);

  let uploadedSize = 0;

  // Manejar el evento 'data' para obtener el progreso de subida

  //const ass = setInterval(()=>{
    readStream.on("data", (chunk) => {
      uploadedSize += chunk.length;
  
      // Calcular el progreso actual en porcentaje
      let progress = Math.floor((uploadedSize / size) * 100);
      console.log(progress)
      console.log(chunk)
      // Emitir el progreso a través de Socket.IO
      io.emit("progressUpdate", progress);
    });

  //},100)
  

  // Manejar el evento 'end' para finalizar la subida
  readStream.on("end", () => {
    // Eliminar el archivo temporal después de la subida

    // Emitir evento de finalización a través de Socket.IO
    io.emit("uploadComplete");
    clearInterval(ass)

    // Enviar respuesta al cliente
    res.status(200).json({ message: "Archivo subido exitosamente" });
  });
});

io.on("connection", (socket) => {
  console.log("Cliente conectado");

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

io.on('getProgress', () => {
  // Aquí puedes obtener el progreso actual de la carga y enviarlo al cliente
  // Por ejemplo, puedes obtener el progreso de una variable global o desde una base de datos
  const progress = 50; 
  socket.emit('progressUpdate', progress);
});

server.listen(3000, () => {
  console.log("Servidor en ejecución en el puerto 3000");
});
