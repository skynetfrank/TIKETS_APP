import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import userRouter from "./routers/users.js";
dotenv.config();

const app = express();
// Habilita CORS para todas las rutas. En producción, puedes configurarlo
// para permitir solo el dominio de tu frontend por mayor seguridad.
// ej: app.use(cors({ origin: 'https://tu-frontend.com' }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



const __dirname = path.resolve();

// Construye la ruta para salir de la carpeta 'backend' y entrar en 'frontend/dist'
const frontendDistPath = path.join(__dirname, "frontend", "dist");

// Rutas de la API
app.use("/api/users", userRouter);

app.use(express.static(frontendDistPath));
app.get(/.*/, (req, res) => res.sendFile(path.join(frontendDistPath, "index.html")));

// Middleware de manejo de errores mejorado
app.use((err, req, res, next) => {
  // Log del error para depuración (en un entorno de producción real, usarías un logger como Winston)
  console.error(err.stack);
  res.status(err.status || 500).send({ message: err.message || "Error Interno del Servidor" });
});

const startServer = async () => {
  try {
    // Validar que las variables de entorno críticas existan
    if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
      console.error("Error: Faltan variables de entorno críticas (MONGODB_URI, JWT_SECRET).");
      process.exit(1); // Detiene la aplicación si no están definidas
    }

    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("CONECTADO A MONGODB");

    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log(`Servidor listo en http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Error al iniciar el servidor:", error.message);
    process.exit(1); // Detiene la aplicación si la conexión a la BD falla
  }
};

startServer();
