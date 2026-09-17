import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    userProfile: {
      nombre: { type: String, required: true },
      apellido: { type: String, required: true },
      cedula: { type: String, required: false, unique: true, sparse: true },
      telefono: { type: String },
      direccion: { type: String },
      genero: { type: String, enum: ["Masculino", "Femenino", "Otro"] },
    },
    isAdmin: { type: Boolean, default: false, required: true },
    isActive: { type: Boolean, default: true, index: true }, // Campo para borrado lógico
    isProtected: { type: Boolean, default: false }, // Campo para proteger al usuarios administradores
  },
  {
    timestamps: true,
  },
);

// Índices para búsquedas rápidas por nombre, apellido y cédula
userSchema.index({ "userProfile.nombre": 1 });
userSchema.index({ "userProfile.apellido": 1 });
// Índice compuesto para el filtro más común: usuarios activos ordenados por fecha
userSchema.index({ isActive: 1, createdAt: -1 });

const User = mongoose.model("User", userSchema);
export default User;
