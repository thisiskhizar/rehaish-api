import { Router } from "express";
import {
  authenticate,
  authorize,
  requireEmailVerified,
} from "../middleware/auth";
import {
  CreateManagerSchema,
  CreatePropertySchema,
  UpdateManagerSchema,
  UpdatePropertySchema,
  validateRequest,
} from "../utils/validation";
import {
  getManagerAnalytics,
  getManagerProfile,
  registerManager,
  updateManagerProfile,
} from "../controllers/managerController";
import {
  createProperty,
  deleteProperty,
  getManagerProperties,
  getManagerProperty,
  updateProperty,
} from "../controllers/managerPropertyController";
import { z } from "zod";

const router = Router();

const PropertyIdParamsSchema = z.object({
  id: z.string().uuid("Invalid property ID format"),
});

const ManagerPropertyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sort: z
    .enum([
      "title",
      "-title",
      "postedDate",
      "-postedDate",
      "pricePerMonth",
      "-pricePerMonth",
    ])
    .default("-postedDate"),
  city: z.string().optional(),
  propertyType: z.string().optional(),
  status: z.string().optional(),
});

/**
 * @route   POST /managers/register
 * @desc    Register a new manager profile (called after Cognito registration)
 * @access  Private (Manager only, email verification required)
 * @body    CreateManagerInput - { name, phoneNumber }
 */
router.post(
  "/register",
  authenticate,
  authorize("manager"),
  requireEmailVerified,
  validateRequest(CreateManagerSchema),
  registerManager
);

/**
 * @route   GET /managers/me
 * @desc    Get current manager profile with portfolio data
 * @access  Private (Manager only)
 * @returns Complete manager profile with properties, applications, leases, and stats
 */
router.get("/me", authenticate, authorize("manager"), getManagerProfile);

/**
 * @route   PATCH /managers/me
 * @desc    Update current manager profile
 * @access  Private (Manager only)
 * @body    UpdateManagerInput - partial manager data
 */
router.patch(
  "/me",
  authenticate,
  authorize("manager"),
  validateRequest(UpdateManagerSchema),
  updateManagerProfile
);

/**
 * @route   GET /managers/analytics
 * @desc    Get comprehensive analytics and dashboard data for manager's portfolio
 * @access  Private (Manager only)
 * @returns Detailed analytics including revenue, occupancy, performance metrics, and trends
 */
router.get(
  "/analytics",
  authenticate,
  authorize("manager"),
  getManagerAnalytics
);

/**
 * @route   POST /managers/properties
 * @desc    Create a new property listing
 * @access  Private (Manager only)
 * @body    CreatePropertyInput - complete property data including location
 */
router.post(
  "/properties",
  authenticate,
  authorize("manager"),
  validateRequest(CreatePropertySchema),
  createProperty
);

/**
 * @route   GET /managers/properties
 * @desc    Get manager's properties with filtering and pagination
 * @access  Private (Manager only)
 * @query   { page?, limit?, sort?, city?, propertyType?, status? }
 */
router.get(
  "/properties",
  authenticate,
  authorize("manager"),
  validateRequest(ManagerPropertyQuerySchema, "query"),
  getManagerProperties
);

/**
 * @route   GET /managers/properties/:id
 * @desc    Get single property details with applications, leases, and reviews
 * @access  Private (Manager only - must own property)
 * @params  { id: string } - property UUID
 */
router.get(
  "/properties/:id",
  authenticate,
  authorize("manager"),
  validateRequest(PropertyIdParamsSchema, "params"),
  getManagerProperty
);

/**
 * @route   PATCH /managers/properties/:id
 * @desc    Update property listing
 * @access  Private (Manager only - must own property)
 * @params  { id: string } - property UUID
 * @body    UpdatePropertyInput - partial property data
 */
router.patch(
  "/properties/:id",
  authenticate,
  authorize("manager"),
  validateRequest(PropertyIdParamsSchema, "params"),
  validateRequest(UpdatePropertySchema),
  updateProperty
);

/**
 * @route   DELETE /managers/properties/:id
 * @desc    Delete (archive) property listing
 * @access  Private (Manager only - must own property)
 * @params  { id: string } - property UUID
 * @note    Cannot delete properties with active leases
 */
router.delete(
  "/properties/:id",
  authenticate,
  authorize("manager"),
  validateRequest(PropertyIdParamsSchema, "params"),
  deleteProperty
);

export default router;
