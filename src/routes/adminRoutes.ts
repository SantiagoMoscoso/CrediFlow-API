import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/auth";
import {
  getPendingLoans,
  approveLoan,
  rejectLoan,
  markLoanAsMora,
} from "../controllers/adminController";

const router = Router();

// Dos middlewares en cadena: primero autentica, luego exige rol admin
router.get("/loans/pending", authenticate, requireRole("admin"), getPendingLoans);
router.patch("/loans/:id/approve", authenticate, requireRole("admin"), approveLoan);
router.patch("/loans/:id/reject", authenticate, requireRole("admin"), rejectLoan);
router.patch("/loans/:id/mora", authenticate, requireRole("admin"), markLoanAsMora);

export default router;