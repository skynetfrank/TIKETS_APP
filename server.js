import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import userRouter from "./routers/users.js";

dotenv.config();

const app = express();
const isProd = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Seguridad y middleware global
// ---------------------------------------------------------------------------

// Headers de seguridad HTTP (XSS, clickjacking, sniffing, etc.)
app.use(helmet());

// CORS: en producción restringe al dominio del frontend
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true, // ej: CORS_ORIGIN=https://tu-frontend.com
    credentials: true,
  })
);

// Límite de payload para prevenir DoS por cuerpos enormes
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Sanitización contra inyección NoSQL ($gt, $where, etc.)
app.use(mongoSanitize());

// Compresión gzip de respuestas
app.use(compression());

// Logging HTTP (formato corto en dev, combinado en producción)
app.use(morgan(isProd ? "combined" : "dev"));

// Rate limiting global para la API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas peticiones. Intenta de nuevo más tarde." },
});
app.use("/api", apiLimiter);

// Rate limiting estricto para login (anti fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos de inicio de sesión. Intenta en 15 minutos." },
});
app.use("/api/users/login", loginLimiter);

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------
app.use("/api/users", userRouter);

// 404 para rutas de API no encontradas (antes del catch-all del frontend)
app.use("/api", (req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// ---------------------------------------------------------------------------
// Frontend estático
// ---------------------------------------------------------------------------
const __dirname = path.resolve();
const frontendDistPath = path.join(__dirname, "frontend", "dist");

app.use(express.static(frontendDistPath));
app.get(/.*/, (req, res) => res.sendFile(path.join(frontendDistPath, "index.html")));

// ---------------------------------------------------------------------------
// Manejo centralizado de errores
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Normalizar errores conocidos de Mongoose/MongoDB
  if (err.name === "CastError") {
    return res.status(400).json({ message: "ID o formato de dato inválido" });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "campo";
    return res.status(409).json({ message: `El valor de '${field}' ya está registrado` });
  }

  // En producción no exponer detalles internos del error
  const message = isProd && !err.status ? "Error Interno del Servidor" : err.message;
  res.status(err.status || 500).json({ message });
});

// ---------------------------------------------------------------------------
// Arranque y apagado graceful
// ---------------------------------------------------------------------------
const startServer = async () => {
  try {
    if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
      console.error("Error: Faltan variables de entorno críticas (MONGODB_URI, JWT_SECRET).");
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 20, // Pool de conexiones suficiente para la carga esperada
    });
    console.log("CONECTADO A MONGODB");

    const port = process.env.PORT || 5000;
    const server = app.listen(port, () => {
      console.log(`Servidor listo en http://localhost:${port}`);
    });

    // Apagado graceful: cierra conexiones antes de terminar el proceso
    const shutdown = async (signal) => {
      console.log(`\n${signal} recibido. Cerrando servidor...`);
      server.close(async () => {
        await mongoose.disconnect();
        console.log("Conexiones cerradas. Proceso terminado.");
        process.exit(0);
      });
      // Forzar salida si tarda más de 10s
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Error al iniciar el servidor:", error.message);
    process.exit(1);
  }
};

// Captura errores no manejados para evitar estado inconsistente
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

startServer();
