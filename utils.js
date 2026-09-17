import jwt from "jsonwebtoken";

/**
 * Genera un JWT para el usuario autenticado.
 * Solo incluye claims no sensibles y necesarios para autorización.
 */
export const generateToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      nombre: user.userProfile?.nombre, // El modelo anida el nombre en userProfile
      email: user.email,
      isAdmin: user.isAdmin,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d", // Tokens de corta duración
    }
  );
};

/** Extrae el token del header "Authorization: Bearer <token>". */
const extractToken = (req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
};

/** Middleware: verifica que la petición incluya un JWT válido. */
export const isAuth = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res
      .status(401)
      .json({ message: "Acceso denegado. Falta el token de autorización." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "El token ha expirado. Por favor, inicie sesión de nuevo.",
        });
      }
      return res.status(401).json({ message: "Token inválido" });
    }
    req.user = decoded;
    next();
  });
};

/** Middleware: requiere autenticación previa (isAuth) y rol de administrador. */
export const isAdmin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    return next();
  }
  // 403 Forbidden: el usuario está autenticado pero no tiene permisos
  res.status(403).json({ message: "Acceso denegado. Se requieren permisos de administrador." });
};
