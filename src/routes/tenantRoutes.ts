import { Router } from "express";
import {
  authenticate,
  authorize,
  requireEmailVerified,
} from "../middleware/auth";
import {
  CreateTenantSchema,
  UpdateTenantSchema,
  validateRequest,
} from "../utils/validation";
import {
  getTenantProfile,
  registerTenant,
  updateTenantProfile,
} from "../controllers/tenantController";

const router = Router();

/**
 * @route   POST /tenants/register
 * @desc    Register a new tenant profile (called after Cognito registration)
 * @access  Private (Tenant only, email verification required)
 * @body    CreateTenantInput - { name, phoneNumber }
 */
router.post(
  "/register",
  authenticate,
  authorize("tenant"),
  requireEmailVerified,
  validateRequest(CreateTenantSchema),
  registerTenant
);

/**
 * @route   GET /tenants/me
 * @desc    Get current tenant profile with dashboard data
 * @access  Private (Tenant only)
 * @returns Complete tenant profile with applications, leases, payments, favorites, and stats
 */
router.get("/me", authenticate, authorize("tenant"), getTenantProfile);

/**
 * @route   PATCH /tenants/me
 * @desc    Update current tenant profile
 * @access  Private (Tenant only)
 * @body    UpdateTenantInput - partial tenant data
 */
router.patch(
  "/me",
  authenticate,
  authorize("tenant"),
  validateRequest(UpdateTenantSchema),
  updateTenantProfile
);
