import { Router } from "express";
import {
  createPaymentRecord,
  getManagerPayments,
  updatePaymentStatus,
  getTenantPayments,
  getPaymentById,
} from "../controllers/paymentController";
import {
  validateRequest,
  CreatePaymentSchema,
  UpdatePaymentSchema,
} from "../utils/validation";
import { authenticate, authorize } from "../middleware/auth";
import { z } from "zod";

const router = Router();

const PaymentIdParamsSchema = z.object({
  id: z.string().uuid("Invalid payment ID format"),
});

const PaymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]).optional(),
  paymentType: z
    .enum([
      "RENT",
      "SECURITY_DEPOSIT",
      "APPLICATION_FEE",
      "LATE_FEE",
      "MAINTENANCE_CHARGE",
      "REFUND",
    ])
    .optional(),
  propertyId: z.string().uuid().optional(),
  leaseId: z.string().uuid().optional(),
  sort: z.string().default("-paymentDate"),
});

const TenantPaymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]).optional(),
  paymentType: z
    .enum([
      "RENT",
      "SECURITY_DEPOSIT",
      "APPLICATION_FEE",
      "LATE_FEE",
      "MAINTENANCE_CHARGE",
      "REFUND",
    ])
    .optional(),
  leaseId: z.string().uuid().optional(),
  sort: z.string().default("-paymentDate"),
});

/**
 * @route   POST /managers/payments
 * @desc    Create a payment record (for tracking, not processing)
 * @access  Private (Manager only)
 * @body    CreatePaymentInput - payment details including amount, type, method
 */
router.post(
  "/managers/payments",
  authenticate,
  authorize("manager"),
  validateRequest(CreatePaymentSchema),
  createPaymentRecord
);

/**
 * @route   GET /managers/payments
 * @desc    Get all payment records for manager's properties
 * @access  Private (Manager only)
 * @query   PaymentQuerySchema - pagination, filters, sorting
 */
router.get(
  "/managers/payments",
  authenticate,
  authorize("manager"),
  validateRequest(PaymentQuerySchema, "query"),
  getManagerPayments
);

/**
 * @route   PATCH /managers/payments/:id
 * @desc    Update payment status and details
 * @access  Private (Manager only - must own related property)
 * @params  { id: string } - payment ID
 * @body    UpdatePaymentInput - status, reference ID, receipt URL, notes
 */
router.patch(
  "/managers/payments/:id",
  authenticate,
  authorize("manager"),
  validateRequest(PaymentIdParamsSchema, "params"),
  validateRequest(UpdatePaymentSchema),
  updatePaymentStatus
);

/**
 * @route   GET /tenants/payments
 * @desc    Get tenant's payment history
 * @access  Private (Tenant only)
 * @query   TenantPaymentQuerySchema - pagination, status filter, lease filter, sort
 */
router.get(
  "/tenants/payments",
  authenticate,
  authorize("tenant"),
  validateRequest(TenantPaymentQuerySchema, "query"),
  getTenantPayments
);

/**
 * @route   GET /payments/:id
 * @desc    Get detailed payment information
 * @access  Private (Tenant or Manager - must be associated with payment)
 * @params  { id: string } - payment ID
 * @returns Complete payment details with lease, property, and participant info
 */
router.get(
  "/payments/:id",
  authenticate,
  authorize("tenant", "manager"),
  validateRequest(PaymentIdParamsSchema, "params"),
  getPaymentById
);

export default router;
