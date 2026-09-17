import express from "express";
import asyncHandler from "express-async-handler";
import { body, param, query, validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/user.js";
import { generateToken, isAuth, isAdmin } from "../utils.js";

const userRouter = express.Router();

const SALT_ROUNDS = 12;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Middleware que valida los resultados de express-validator. */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: "Error de validación",
            errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
        });
    }
    next();
};

/** Valida que un parámetro :id sea un ObjectId válido. */
const validateObjectId = [
    param("id").isMongoId().withMessage("ID de usuario inválido"),
    validate,
];

/** Escapa caracteres especiales de regex para búsquedas seguras (anti ReDoS / inyección). */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Proyección base: nunca exponer el hash del password. */
const PUBLIC_FIELDS = "-password";

// ---------------------------------------------------------------------------
// Validadores reutilizables
// ---------------------------------------------------------------------------

const emailValidator = body("email")
    .trim()
    .isEmail()
    .withMessage("Email inválido")
    .normalizeEmail();

const passwordValidator = body("password")
    .isString()
    .isLength({ min: 8 })
    .withMessage("La contraseña debe tener al menos 8 caracteres")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("La contraseña debe contener mayúsculas, minúsculas y números");

const profileValidators = [
    body("userProfile.nombre")
        .trim()
        .notEmpty()
        .withMessage("El nombre es obligatorio")
        .isLength({ max: 50 })
        .escape(),
    body("userProfile.apellido")
        .trim()
        .notEmpty()
        .withMessage("El apellido es obligatorio")
        .isLength({ max: 50 })
        .escape(),
    body("userProfile.cedula")
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 20 })
        .escape(),
    body("userProfile.telefono").optional({ checkFalsy: true }).trim().isLength({ max: 20 }).escape(),
    body("userProfile.direccion").optional({ checkFalsy: true }).trim().isLength({ max: 200 }).escape(),
    body("userProfile.genero")
        .optional({ nullable: true })
        .isIn(["Masculino", "Femenino", "Otro"])
        .withMessage("Género inválido"),
];

// ---------------------------------------------------------------------------
// POST /api/users/login — Autenticación (público)
// ---------------------------------------------------------------------------
userRouter.post(
    "/login",
    [
        body("email").trim().isEmail().withMessage("Email inválido").normalizeEmail(),
        body("password").notEmpty().withMessage("La contraseña es obligatoria"),
        validate,
    ],
    asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        const user = await User.findOne({ email, isActive: true });

        // Mensaje genérico para no revelar si el email existe (anti-enumeración)
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Credenciales inválidas" });
        }

        const { password: _, ...userResponse } = user.toObject();
        res.json({
            ...userResponse,
            token: generateToken(user),
        });
    })
);

// ---------------------------------------------------------------------------
// POST /api/users — Crear usuario (registro público)
// ---------------------------------------------------------------------------
userRouter.post(
    "/",
    [emailValidator, passwordValidator, ...profileValidators],
    asyncHandler(async (req, res) => {
        const { email, password, userProfile, isAdmin = false } = req.body;

        const exists = await User.exists({ email });
        if (exists) {
            return res.status(409).json({ message: "El email ya está registrado" });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const user = await User.create({
            email,
            password: hashedPassword,
            userProfile,
            isAdmin,
        });

        const { password: _, ...userResponse } = user.toObject();
        res.status(201).json(userResponse);
    })
);

// ---------------------------------------------------------------------------
// GET /api/users — Listar usuarios con paginación y búsqueda
// Query params: page, limit, search, isActive, sortBy, order
// ---------------------------------------------------------------------------
userRouter.get(
    "/",
    isAuth,
    isAdmin,
    [
        query("page").optional().isInt({ min: 1 }).toInt(),
        query("limit").optional().isInt({ min: 1, max: MAX_LIMIT }).toInt(),
        query("search").optional().trim().isLength({ max: 100 }).escape(),
        query("isActive").optional().isBoolean().toBoolean(),
        query("sortBy").optional().isIn(["createdAt", "email", "userProfile.nombre", "userProfile.apellido"]),
        query("order").optional().isIn(["asc", "desc"]),
        validate,
    ],
    asyncHandler(async (req, res) => {
        const page = req.query.page || 1;
        const limit = req.query.limit || 10;
        const skip = (page - 1) * limit;
        const sortBy = req.query.sortBy || "createdAt";
        const order = req.query.order === "asc" ? 1 : -1;

        // Filtro base: por defecto solo usuarios activos (borrado lógico)
        const filter = {};
        if (req.query.isActive !== undefined) {
            filter.isActive = req.query.isActive;
        } else {
            filter.isActive = true;
        }

        // Búsqueda por nombre, apellido o cédula
        if (req.query.search) {
            const term = escapeRegex(req.query.search);
            const regex = new RegExp(term, "i"); // case-insensitive
            filter.$or = [
                { "userProfile.nombre": regex },
                { "userProfile.apellido": regex },
                { "userProfile.cedula": regex },
            ];
        }

        // Ejecutar consulta y conteo en paralelo para máxima eficiencia
        const [users, total] = await Promise.all([
            User.find(filter)
                .select(PUBLIC_FIELDS)
                .sort({ [sortBy]: order })
                .skip(skip)
                .limit(limit)
                .lean(), // .lean() devuelve objetos planos: más rápido y menos memoria
            User.countDocuments(filter),
        ]);

        res.json({
            data: users,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1,
            },
        });
    })
);

// ---------------------------------------------------------------------------
// GET /api/users/:id — Obtener un usuario
// ---------------------------------------------------------------------------
userRouter.get(
    "/:id",
    isAuth,
    validateObjectId,
    asyncHandler(async (req, res) => {
        // Un usuario solo puede ver su propio perfil, salvo que sea admin
        if (req.user._id !== req.params.id && !req.user.isAdmin) {
            return res.status(403).json({ message: "No tienes permiso para ver este perfil" });
        }

        const user = await User.findOne({ _id: req.params.id, isActive: true })
            .select(PUBLIC_FIELDS)
            .lean();

        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }
        res.json(user);
    })
);

// ---------------------------------------------------------------------------
// PUT /api/users/:id — Actualizar usuario
// ---------------------------------------------------------------------------
userRouter.put(
    "/:id",
    isAuth,
    [
        ...validateObjectId,
        body("email").optional().trim().isEmail().withMessage("Email inválido").normalizeEmail(),
        body("password")
            .optional()
            .isLength({ min: 8 })
            .withMessage("La contraseña debe tener al menos 8 caracteres")
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .withMessage("La contraseña debe contener mayúsculas, minúsculas y números"),
        body("userProfile.nombre").optional().trim().notEmpty().isLength({ max: 50 }).escape(),
        body("userProfile.apellido").optional().trim().notEmpty().isLength({ max: 50 }).escape(),
        body("userProfile.cedula").optional({ checkFalsy: true }).trim().isLength({ max: 20 }).escape(),
        body("userProfile.telefono").optional({ checkFalsy: true }).trim().isLength({ max: 20 }).escape(),
        body("userProfile.direccion").optional({ checkFalsy: true }).trim().isLength({ max: 200 }).escape(),
        body("userProfile.genero").optional({ nullable: true }).isIn(["Masculino", "Femenino", "Otro"]),
        validate,
    ],
    asyncHandler(async (req, res) => {
        const isSelf = req.user._id === req.params.id;

        // Solo el propio usuario o un admin pueden actualizar
        if (!isSelf && !req.user.isAdmin) {
            return res.status(403).json({ message: "No tienes permiso para modificar este usuario" });
        }

        const user = await User.findOne({ _id: req.params.id, isActive: true });
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const { email, password, userProfile, isAdmin: isAdminBody } = req.body;

        // Verificar unicidad del email si se está cambiando
        if (email && email !== user.email) {
            const emailTaken = await User.exists({ email, _id: { $ne: user._id } });
            if (emailTaken) {
                return res.status(409).json({ message: "El email ya está en uso" });
            }
            user.email = email;
        }

        if (password) {
            user.password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        // Merge del perfil: solo campos enviados
        if (userProfile) {
            for (const key of ["nombre", "apellido", "cedula", "telefono", "direccion", "genero"]) {
                if (userProfile[key] !== undefined) {
                    user.userProfile[key] = userProfile[key];
                }
            }
        }

        // Solo un admin puede cambiar isAdmin, y solo si el usuario no está protegido
        if (isAdminBody !== undefined && req.user.isAdmin && !user.isProtected) {
            user.isAdmin = Boolean(isAdminBody);
        }

        await user.save();

        const { password: _, ...userResponse } = user.toObject();
        res.json(userResponse);
    })
);

// ---------------------------------------------------------------------------
// DELETE /api/users/:id — Borrado lógico (soft delete)
// ---------------------------------------------------------------------------
userRouter.delete(
    "/:id",
    isAuth,
    isAdmin,
    validateObjectId,
    asyncHandler(async (req, res) => {
        const user = await User.findOne({ _id: req.params.id, isActive: true });
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        if (user.isProtected) {
            return res.status(403).json({ message: "Este usuario está protegido y no puede eliminarse" });
        }

        user.isActive = false;
        await user.save();

        res.json({ message: "Usuario desactivado correctamente", id: user._id });
    })
);

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/restore — Restaurar usuario eliminado
// ---------------------------------------------------------------------------
userRouter.patch(
    "/:id/restore",
    isAuth,
    isAdmin,
    validateObjectId,
    asyncHandler(async (req, res) => {
        const user = await User.findOneAndUpdate(
            { _id: req.params.id, isActive: false },
            { isActive: true },
            { new: true }
        ).select(PUBLIC_FIELDS);

        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado o ya está activo" });
        }
        res.json({ message: "Usuario restaurado correctamente", user });
    })
);

export default userRouter;
