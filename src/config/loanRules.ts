export const LOAN_RULES = {
  MAX_AMOUNT_NEW_CLIENT: 1_000_000,   // cupo de un cliente sin préstamos pagados
  MAX_AMOUNT_WITH_HISTORY: 5_000_000, // cupo de un cliente con al menos uno pagado
  MAX_ACTIVE_LOANS: 2,                // aprobados o en mora a la vez
};