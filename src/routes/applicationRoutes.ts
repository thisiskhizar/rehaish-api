import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  CreateApplicationSchema,
  ManagerApplicationStatusUpdateSchema,
  validateRequest,
} from "../utils/validation";
import {
  getManagerApplications,
  getTenantApplications,
  submitApplication,
  updateApplicationStatus,
  withdrawApplication,
} from "../controllers/applicationController";
import { z } from "zod";

const ApplicationIdParamsSchema = z.object({
  id: z.string().uuid("Invalid application ID format"),
});

const TenantApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]).optional(),
  sort: z
    .enum(["createdAt", "-createdAt", "updatedAt", "-updatedAt"])
    .default("-createdAt"),
});

const ManagerApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]).optional(),
  propertyId: z.string().uuid().optional(),
  sort: z
    .enum(["createdAt", "-createdAt", "updatedAt", "-updatedAt"])
    .default("-createdAt"),
});

const router = Router();

/**
 * @route   POST /applications
 * @desc    Submit a rental application for a property
 * @access  Private (Tenant only)
 * @body    CreateApplicationInput - { propertyId, fullName, email, phoneNumber, message? }
 */
router.post(
  "/",
  authenticate,
  authorize("tenant"),
  validateRequest(CreateApplicationSchema),
  submitApplication
);

/**
 * @route   GET /applications
 * @desc    Get tenant's applications with filtering and pagination
 * @access  Private (Tenant only)
 * @query   { page?, limit?, status?, sort? }
 */
router.get(
  "/",
  authenticate,
  authorize("tenant"),
  validateRequest(TenantApplicationsQuerySchema, "query"),
  getTenantApplications
);

/**
 * @route   POST /applications/:id/withdraw
 * @desc    Withdraw a pending application
 * @access  Private (Tenant only - must own application)
 * @params  { id: string } - application UUID
 */
router.post(
  "/:id/withdraw",
  authenticate,
  authorize("tenant"),
  validateRequest(ApplicationIdParamsSchema, "params"),
  withdrawApplication
);

/**
 * @route   GET /managers/applications
 * @desc    Get applications for manager's properties with filtering
 * @access  Private (Manager only)
 * @query   { page?, limit?, status?, propertyId?, sort? }
 */
router.get(
  "/managers",
  authenticate,
  authorize("manager"),
  validateRequest(ManagerApplicationsQuerySchema, "query"),
  getManagerApplications
);

/**
 * @route   PATCH /managers/applications/:id/status
 * @desc    Update application status (approve/reject)
 * @access  Private (Manager only - must own property)
 * @params  { id: string } - application UUID
 * @body    { status: 'APPROVED' | 'REJECTED' }
 */
router.patch(
  "/managers/:id/status",
  authenticate,
  authorize("manager"),
  validateRequest(ApplicationIdParamsSchema, "params"),
  validateRequest(ManagerApplicationStatusUpdateSchema),
  updateApplicationStatus
);

export default router;
