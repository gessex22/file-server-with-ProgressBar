const express = require("express");
const os = require("os")
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
const busboy = require("busboy"); // streaming

require("dotenv").config();

const gameplayPath = process.env.PATHUPLOADone;
const privatePath = process.env.PATHUPLOADtwo;
const edicionPath = process.env.PATHUPLOADthree;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Archivos estáticos
app.use(express.static("./public"));

// Conexiones largas
server.keepAliveTimeout = 21474836;
server.timeout = 21474832;
server.headersTimeout = 21474836;


app.get("/server-info", (req, res) => {
  res.json({
    serverName: process.env.SERVER_NAME || "Servidor Local",
    environment: os.platform() || "development",
    port: process.env.PORT || 3000,
    hostname: require('os').hostname(),
    version: process.env.APP_VERSION || "1.0.0"
  });
});

app.post("/upload", (req, res) => {
  const bb = busboy({ headers: req.headers });

  let savePath = null;
  const category = req.query.category;

  if (category === "df" || category === "private") savePath = privatePath;
  if (category === "gameplay") savePath = gameplayPath;
  if (category === "edition" || category === "edicion") savePath = edicionPath;

  if (!savePath) {
    return res.status(400).json({ message: "Categoría inválida" });
  }

  bb.on("file", (fieldname, file, info) => {
    const { filename } = info;
    console.log(`Subiendo archivo: ${filename}`);

    const saveTo = path.join(savePath, filename);
    const writeStream = fs.createWriteStream(saveTo);

    file.pipe(writeStream);

    file.on("end", () => {
      console.log(`Archivo guardado: ${saveTo}`);
      io.emit("uploadComplete", { fileName: filename });
    });

    file.on("error", (err) => {
      console.error("Error en la subida:", err);
    });
  });

  bb.on("finish", () => {
    res.status(200).json({ message: "Archivo subido exitosamente" });
  });

  req.pipe(bb);
});

io.on("connection", (socket) => {
  console.log("Cliente conectado");
  socket.on("disconnect", () => console.log("Cliente desconectado"));
});

server.listen(3000, () => {
  console.log("Servidor en ejecución en el puerto 3000");
});
