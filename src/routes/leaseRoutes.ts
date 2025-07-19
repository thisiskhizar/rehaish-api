import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { CreateLeaseSchema, validateRequest } from "../utils/validation";
import {
  createLease,
  getLeaseById,
  getManagerLeases,
  getTenantLeases,
  updateLeaseStatus,
} from "../controllers/leaseController";
import { z } from "zod";

const router = Router();

const LeaseIdParamsSchema = z.object({
  id: z.string().uuid("Invalid lease ID format"),
});

const LeaseStatusUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "TERMINATED", "COMPLETED"], {
    errorMap: () => ({
      message: "Status must be ACTIVE, TERMINATED, or COMPLETED",
    }),
  }),
});

const LeaseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(["PENDING_SIGNATURE", "ACTIVE", "TERMINATED", "COMPLETED"])
    .optional(),
  propertyId: z.string().uuid().optional(),
  sort: z.string().default("-createdAt"),
});

/**
 * @route   POST /managers/leases
 * @desc    Create a lease from an approved application
 * @access  Private (Manager only)
 * @body    CreateLeaseInput - lease details including dates, amounts, and application ID
 */
router.post(
  "/managers/leases",
  authenticate,
  authorize("manager"),
  validateRequest(CreateLeaseSchema),
  createLease
);

/**
 * @route   GET /managers/leases
 * @desc    Get all leases for manager's properties with filtering
 * @access  Private (Manager only)
 * @query   LeaseQuerySchema - pagination, status filter, property filter, sort
 */
router.get(
  "/managers/leases",
  authenticate,
  authorize("manager"),
  validateRequest(LeaseQuerySchema, "query"),
  getManagerLeases
);

/**
 * @route   PATCH /managers/leases/:id/status
 * @desc    Update lease status (activate, terminate, complete)
 * @access  Private (Manager only - must own property)
 * @params  { id: string } - lease ID
 * @body    { status: 'ACTIVE' | 'TERMINATED' | 'COMPLETED' }
 */
router.patch(
  "/managers/leases/:id/status",
  authenticate,
  authorize("manager"),
  validateRequest(LeaseIdParamsSchema, "params"),
  validateRequest(LeaseStatusUpdateSchema),
  updateLeaseStatus
);

/**
 * @route   GET /tenants/leases
 * @desc    Get tenant's leases with payment history
 * @access  Private (Tenant only)
 * @query   LeaseQuerySchema - pagination, status filter, sort (propertyId ignored for tenants)
 */
router.get(
  "/tenants/leases",
  authenticate,
  authorize("tenant"),
  validateRequest(LeaseQuerySchema, "query"),
  getTenantLeases
);

/**
 * @route   GET /leases/:id
 * @desc    Get detailed lease information with payment history
 * @access  Private (Tenant or Manager - must be associated with lease)
 * @params  { id: string } - lease ID
 * @returns Complete lease details with property, tenant/manager info, and payment history
 */
router.get(
  "/leases/:id",
  authenticate,
  authorize("tenant", "manager"),
  validateRequest(LeaseIdParamsSchema, "params"),
  getLeaseById
);

export default router;
