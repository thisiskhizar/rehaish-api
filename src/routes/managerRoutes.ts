import { Router } from "express";
import {
  authenticate,
  authorize,
  requireEmailVerified,
} from "../middleware/auth";
import {
  CreateManagerSchema,
  UpdateManagerSchema,
  validateRequest,
} from "../utils/validation";
import {
  getManagerAnalytics,
  getManagerProfile,
  registerManager,
  updateManagerProfile,
} from "../controllers/managerController";

const router = Router();

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

export default router;
