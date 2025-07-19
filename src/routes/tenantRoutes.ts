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
  getTenantFavorites,
  addToFavorites,
  removeFromFavorites,
} from "../controllers/tenantController";
import { z } from "zod";

const PropertyIdParamsSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID format"),
});

const FavoritesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

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

/**
 * @route   GET /tenants/favorites
 * @desc    Get tenant's favorited properties with pagination
 * @access  Private (Tenant only)
 * @query   { page?: number, limit?: number }
 * @returns Paginated list of favorited properties with full details
 */
router.get(
  "/favorites",
  authenticate,
  authorize("tenant"),
  validateRequest(FavoritesQuerySchema, "query"),
  getTenantFavorites
);

/**
 * @route   POST /tenants/favorites/:propertyId
 * @desc    Add property to tenant's favorites
 * @access  Private (Tenant only)
 * @params  { propertyId: string } - UUID of the property to favorite
 */
router.post(
  "/favorites/:propertyId",
  authenticate,
  authorize("tenant"),
  validateRequest(PropertyIdParamsSchema, "params"),
  addToFavorites
);

/**
 * @route   DELETE /tenants/favorites/:propertyId
 * @desc    Remove property from tenant's favorites
 * @access  Private (Tenant only)
 * @params  { propertyId: string } - UUID of the property to unfavorite
 */
router.delete(
  "/favorites/:propertyId",
  authenticate,
  authorize("tenant"),
  validateRequest(PropertyIdParamsSchema, "params"),
  removeFromFavorites
);

export default router;
