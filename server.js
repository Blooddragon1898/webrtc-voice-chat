const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Важно: на Railway используем все интерфейсы
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Настройка Socket.io для Railway
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Статус для healthcheck Railway
app.get("/status", (req, res) => {
  res.json({ 
    status: "online", 
    clients: io.engine.clientsCount,
    serverTime: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

// API для получения информации о сервере
app.get("/api/info", (req, res) => {
  res.json({
    service: "WebRTC Voice Chat",
    version: "1.0.0",
    webrtc: "supported",
    websocket: "active",
    uptime: process.uptime()
  });
});

// Генерация комнаты через API
app.get("/api/room", (req, res) => {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  res.json({ 
    room: roomId,
    url: `https://${req.headers.host}/?room=${roomId}`
  });
});

io.on("connection", (socket) => {
  console.log(" Новое подключение:", socket.id);
  
  // Логируем IP подключившегося
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  console.log(` IP клиента: ${clientIp}`);
  
  socket.on("join", (data) => {
    const { room, name } = data;
    console.log(`${socket.id} (${name}) входит в комнату ${room}`);
    
    socket.join(room);
    socket.room = room;
    socket.name = name;
    socket.ip = clientIp;
    
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
    console.log(`В комнате ${room}: ${clients.length} клиентов`);
    
    // Отправляем список пользователей
    const users = clients.map(id => {
      const s = io.sockets.sockets.get(id);
      return { 
        id: id, 
        name: s?.name || "Гость",
        ip: s?.ip || "unknown"
      };
    });
    
    // Отправляем новому пользователю список
    socket.emit("users", { users });
    
    // Уведомляем других о новом пользователе
    socket.to(room).emit("user-joined", {
      id: socket.id,
      name: name,
      ip: clientIp
    });
    
    // Если в комнате уже есть кто-то, соединяем их
    if (clients.length >= 2) {
      const otherClients = clients.filter(id => id !== socket.id);
      const partnerId = otherClients[0];
      
      console.log(` Соединяем ${socket.id} и ${partnerId}`);
      
      // Отправляем обоим партнеров
      io.to(socket.id).emit("partner", { id: partnerId });
      io.to(partnerId).emit("partner", { id: socket.id });
    }
  });
  
  socket.on("signal", (data) => {
    console.log(`${socket.id} -> ${data.to}: ${data.type}`);
    socket.to(data.to).emit("signal", {
      from: socket.id,
      type: data.type,
      data: data.data
    });
  });
  
  socket.on("audio-level", (data) => {
    socket.to(socket.room).emit("audio-level", {
      from: socket.id,
      level: data.level
    });
  });
  
  socket.on("message", (data) => {
    socket.to(socket.room).emit("message", {
      from: socket.id,
      text: data.text,
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on("ping", (data) => {
    socket.emit("pong", {
      timestamp: data.timestamp,
      serverTime: Date.now()
    });
  });
  
  socket.on("disconnect", (reason) => {
    console.log(" Отключен:", socket.id, "причина:", reason);
    if (socket.room) {
      socket.to(socket.room).emit("user-left", { 
        id: socket.id,
        name: socket.name 
      });
    }
  });
  
  socket.on("error", (error) => {
    console.error("Socket error:", socket.id, error);
  });
});

// Обработка ошибок
server.on("error", (error) => {
  console.error("Server error:", error);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  io.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

server.listen(PORT, HOST, () => {
  console.log(` Сервер запущен: http://${HOST}:${PORT}`);
  console.log(` WebSocket: ws://${HOST}:${PORT}`);
  console.log(` Режим: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Время запуска: ${new Date().toISOString()}`);
});
