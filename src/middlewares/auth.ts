import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Lo que guardamos dentro del token
export type TokenPayload = { id: number; role: "cliente" | "admin" };

// Request normal de Express + el usuario que sale del token
export interface AuthRequest extends Request {
  user?: TokenPayload;
}

// Crea el token firmado. Vence en 1 hora
export function generateToken(id: number, role: "cliente" | "admin"): string {
  return jwt.sign({ id, role }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
}

// Middleware: corre ANTES del controller y decide si deja pasar
export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  // El token viaja en el header: Authorization: Bearer <token>
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ code: "UNAUTHORIZED", message: "Token requerido" });
  }

  const token = header.split(" ")[1];

  try {
    // verify revisa la firma y la fecha de vencimiento; si algo falla, lanza error
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;

    // Dejamos al usuario disponible para el controller como req.user
    req.user = payload;
    next(); // pasa al siguiente paso (el controller)
  } catch {
    return res.status(401).json({ code: "UNAUTHORIZED", message: "Token inválido o vencido" });
  }
}

// Middleware de rol: lo usaremos para los endpoints solo de admin
export function requireRole(role: "cliente" | "admin") {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso" });
    }
    next();
  };
}