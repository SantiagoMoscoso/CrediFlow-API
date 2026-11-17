import { Request, Response } from "express";
import { getPool } from "../config/db";
import sql, { pool } from "mssql";
import type { CreateUserRequest, LoginRequest, User } from "../types/user";
import bcrypt from "bcryptjs";
import { generateToken } from "../middlewares/auth";


export async function createUser(req: Request, res: Response) {
  const { name, lastName, email, password } =
    req.body as CreateUserRequest;

  if (!name || !lastName || !email || !password) {
    return res.status(400).json({
      code: "BAD_REQUEST",
      message: "Todos los campos son obligatorios",
    });
  }

  try {
    const pool = await getPool();
    
    const existing = await pool
    .request()
    .input("email", sql.NVarChar, email)
    .query("SELECT Id FROM Users WHERE Email = @email");

    if (existing.recordset.length > 0) {
      return res.status(409).json({
        code: "CONFLICT",
        message: "Ya existe una cuenta con ese correo",
      });
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool
      .request()
      .input("name", sql.NVarChar, name)
      .input("lastName", sql.NVarChar, lastName)
      .input("email", sql.NVarChar, email)
      .input("password", sql.NVarChar, passwordHash)
      .input("role", sql.NVarChar, "cliente")
      .query<User>(`
        INSERT INTO Users (Name, LastName, Email, Password, Role)
        OUTPUT
          INSERTED.Id,
          INSERTED.Name,
          INSERTED.LastName,
          INSERTED.Email,
          INSERTED.Role
        VALUES (
          @name,
          @lastName,
          @email,
          @password,
          @role
        )
      `);

      const newUser = result.recordset[0];
      const token = generateToken(newUser.Id, newUser.Role);
    return res.status(201).json({ user: newUser, token });

  } catch (error) {
    console.error("Error al crear usuario:", error);

    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "Error al registrar el usuario",
    });
  }
}    

  // Misma validación que ya habia en el AuthContext del frontend
export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginRequest;

  if (!email || !password) {
    return res.status(400).json({
      code: "BAD_REQUEST",
      message: "Correo y contraseña son obligatorios",
    });
  }

  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input("email", sql.NVarChar, email)
      .query<User>(`
       SELECT Id, Name, LastName, Email, Password, Role
       FROM Users
       WHERE Email = @email
      `);

      const user = result.recordset[0];

    // Si no hay ninguna fila, las credenciales no coinciden con ningún usuario
    const isValid = user && (await bcrypt.compare(password, user.Password));

    if (!isValid) {
      return res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Correo o contraseña incorrectos",
      });
    }

    // Hay exactamente una fila (el Email es UNIQUE), esa es la cuenta
    const { Password, ...safeUser } = user;
    const token = generateToken(user.Id, user.Role);
    res.status(200).json({ user: safeUser, token });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ code: "SERVER_ERROR", message: "Error al iniciar sesión" });
  }
}