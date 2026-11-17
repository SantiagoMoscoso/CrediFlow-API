import { Router } from "express";
import { createLoan, registerPayment } from "../controllers/loanController";
import { getUserLoans } from "../controllers/loanController";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.post("/loans", authenticate, createLoan);
router.post("/loans/:id/payments", authenticate, registerPayment);
router.get("/users/:id/loans", authenticate, getUserLoans);

export default router;