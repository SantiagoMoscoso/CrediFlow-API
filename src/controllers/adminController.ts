import { Response } from "express";
import sql from "mssql";
import { getPool } from "../config/db";
import { AuthRequest } from "../middlewares/auth";
import { LOAN_RULES } from "../config/loanRules";

// Evalúa las dos reglas para un préstamo. Se usa al listar y al aprobar
async function evaluateRules(
  pool: sql.ConnectionPool,
  loan: { UserId: number; Amount: number }
) {
  // Activos = aprobados o en mora. Pagados = historial limpio del cliente
  const stats = await pool
    .request()
    .input("userId", sql.Int, loan.UserId)
    .query<{ Active: number; Paid: number }>(`
      SELECT
        SUM(CASE WHEN Status IN ('approved', 'mora') THEN 1 ELSE 0 END) AS Active,
        SUM(CASE WHEN Status = 'paid' THEN 1 ELSE 0 END) AS Paid
      FROM Loans
      WHERE UserId = @userId
    `);

  const { Active, Paid } = stats.recordset[0];

  // Regla 1: cupo según historial
  const maxAmount =
    Paid > 0 ? LOAN_RULES.MAX_AMOUNT_WITH_HISTORY : LOAN_RULES.MAX_AMOUNT_NEW_CLIENT;

  const reasons: string[] = [];
  if (loan.Amount > maxAmount) {
    reasons.push(`El monto supera el cupo del cliente (${maxAmount})`);
  }
  // Regla 2: máximo de préstamos activos
  if (Active >= LOAN_RULES.MAX_ACTIVE_LOANS) {
    reasons.push(`El cliente ya tiene ${Active} préstamos activos`);
  }

  return { maxAmount, activeLoans: Active, ok: reasons.length === 0, reasons };
}

// GET /loans/pending: pendientes con datos del cliente y si cumplen las reglas
export async function getPendingLoans(req: AuthRequest, res: Response) {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT L.Id, L.UserId, L.Amount, L.Installments, L.InstallmentValue,
             L.Status, L.CreatedAt, U.Name, U.LastName, U.Email
      FROM Loans L
      INNER JOIN Users U ON U.Id = L.UserId
      WHERE L.Status = 'pending'
      ORDER BY L.CreatedAt ASC
    `);

    // A cada pendiente le agregamos el resultado de las reglas
    const withRules = await Promise.all(
      result.recordset.map(async (loan) => ({
        ...loan,
        rules: await evaluateRules(pool, loan),
      }))
    );

    res.status(200).json(withRules);
  } catch (error) {
    console.error("Error listando pendientes:", error);
    res.status(500).json({ code: "SERVER_ERROR", message: "Error al obtener los préstamos" });
  }
}

// PATCH /loans/:id/approve: solo si está pendiente Y cumple las reglas
export async function approveLoan(req: AuthRequest, res: Response) {
  const loanId = Number(req.params.id);

  try {
    const pool = await getPool();

    const loanResult = await pool
      .request()
      .input("loanId", sql.Int, loanId)
      .query("SELECT * FROM Loans WHERE Id = @loanId");

    const loan = loanResult.recordset[0];

    if (!loan) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Préstamo no encontrado" });
    }
    if (loan.Status !== "pending") {
      return res.status(409).json({
        code: "CONFLICT",
        message: "Solo se pueden aprobar préstamos pendientes",
      });
    }

    const rules = await evaluateRules(pool, loan);
    if (!rules.ok) {
      return res.status(400).json({
        code: "RULES_NOT_MET",
        message: rules.reasons.join(". "),
      });
    }

    await pool
      .request()
      .input("loanId", sql.Int, loanId)
      .query("UPDATE Loans SET Status = 'approved' WHERE Id = @loanId");

    res.status(200).json({ message: "Préstamo aprobado" });
  } catch (error) {
    console.error("Error aprobando préstamo:", error);
    res.status(500).json({ code: "SERVER_ERROR", message: "Error al aprobar el préstamo" });
  }
}

// Rechazar y marcar mora son casi iguales: cambian el estado SOLO si el
// préstamo está en el estado de origen esperado (por eso el AND Status = @from)
async function changeStatus(
  req: AuthRequest,
  res: Response,
  from: string,
  to: string,
  okMessage: string
) {
  const loanId = Number(req.params.id);

  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input("loanId", sql.Int, loanId)
      .input("from", sql.NVarChar, from)
      .input("to", sql.NVarChar, to)
      .query("UPDATE Loans SET Status = @to WHERE Id = @loanId AND Status = @from");

    // rowsAffected = cuántas filas cambió. Si fue 0, no existe o no estaba en @from
    if (result.rowsAffected[0] === 0) {
      return res.status(409).json({
        code: "CONFLICT",
        message: "El préstamo no existe o no está en el estado esperado",
      });
    }

    res.status(200).json({ message: okMessage });
  } catch (error) {
    console.error("Error cambiando estado:", error);
    res.status(500).json({ code: "SERVER_ERROR", message: "Error al actualizar el préstamo" });
  }
}

export const rejectLoan = (req: AuthRequest, res: Response) =>
  changeStatus(req, res, "pending", "rejected", "Préstamo rechazado");

export const markLoanAsMora = (req: AuthRequest, res: Response) =>
  changeStatus(req, res, "approved", "mora", "Préstamo marcado en mora");