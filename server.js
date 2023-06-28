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

let totalSize = 0;
let uploadedSize = 0;
let procesoFiles = 0;

app.use(express.static("public"));

// app.post("/upload", upload.any(), (req, res) => {
//   const uploadedFiles = req.files;
//   const numFiles = uploadedFiles.length;

//   // Calcular el tamaño total de los archivos
//   uploadedFiles.forEach((file) => {
//     totalSize += file.size;
//   });

//   // Iterar sobre los archivos subidos
//   uploadedFiles.forEach((file, index) => {
//     const readStream = fs.createReadStream(file.path);

//     // Rastrear el progreso de subida
//     readStream.on("data", (chunk) => {
//       uploadedSize += chunk.length;

//       // Calcular el progreso actual en porcentaje
//       const progress = Math.floor((uploadedSize / totalSize) * 100);
//       io.emit("progressUpdate", progress);
//       console.log(progress);

//       // Aquí puedes enviar el progreso a través de Socket.IO o cualquier otro método
//     });

//     res.writeHead(100, {
//       "Content-Type": "text/event-stream",
//       "Cache-Control": "no-cache",
//       Connection: "keep-alive",
//       "X-Accel-Buffering": "no",
//     });

//     // Finalizar el proceso de subida cuando se completa la lectura del archivo
//     readStream.on("end", () => {
//       console.log(
//         `File :  ${index++}         Nombre : ${
//           file.originalname
//         }        Status : Completado `
//       );

//       if (procesoFiles == numFiles) {
//         res.end();
//       }
//       // Restablecer el tamaño de subida actual para el próximo archivo
//       uploadedSize = 0;
//       procesoFiles++;
//     });
//   });

//   res.json({ message: "Archivos subidos exitosamente" });
// });

io.on("connection", (socket) => {
  console.log("Cliente conectado");

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });

  socket.on("serverEvent", (data) => {
    console.log("Evento del servidor recibido:", data);
  });
});

app.listen(3000, () => {
  console.log("Servidor en ejecución en el puerto 3000");
});
