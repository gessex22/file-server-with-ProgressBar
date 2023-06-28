const fs = require("fs");
const express = require("express");
const multer = require("multer");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

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

app.use(express.static("public"));

app.post("/upload", upload.any(), (req, res) => {
  let totalSize = 0;
  let uploadedSize = 0;
  let procesoFiles = 1;
  const uploadedFiles = req.files;
  const numFiles = uploadedFiles.length;

  res.writeHead(100, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const updateProgress = (progress) => {
    console.log(`data: ${progress}%\n\n`);
    io.emit("progressUpdate", progress);
  };

  // Calcular el tamaño total de los archivos
  uploadedFiles.forEach((file) => {
    totalSize += file.size;
  });

  // Iterar sobre los archivos subidos
  uploadedFiles.forEach((file, index) => {
    updateProgress(0);
    const readStream = fs.createReadStream(file.path);

    // Rastrear el progreso de subida
    readStream.on("data", (chunk) => {
      uploadedSize += chunk.length;

      // Calcular el progreso actual en porcentaje
      const progress = Math.floor((uploadedSize / totalSize) * 100);
      io.emit("progressUpdate", progress);
      console.log(progress);

      // Aquí puedes enviar el progreso a través de Socket.IO o cualquier otro método
    });

    // Finalizar el proceso de subida cuando se completa la lectura del archivo
    readStream.on("end", () => {
      updateProgress(100);
      console.log(
        `File :  ${index++}         Nombre : ${
          file.originalname
        }        Status : Completado `
      );
        console.log(procesoFiles)
        console.log(numFiles)
      if (procesoFiles == numFiles) {
        res.end();
        uploadedSize = 0;
        console.log("Todo se cargo a las " + new Date());
        io.emit("chat", new Date());
      }
      // Restablecer el tamaño de subida actual para el próximo archivo
     
      procesoFiles++;
    });
  });
});

io.on("connection", (socket) => {
  console.log("Cliente conectado");

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });

  socket.on("serverEvent", (data) => {
    console.log("Evento del servidor recibido:", data);
  });
});

server.listen(3000, () => {
  console.log("Servidor en ejecución en el puerto 3000");
});
