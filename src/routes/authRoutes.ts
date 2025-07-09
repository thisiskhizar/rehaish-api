import { Router } from "express";
import { authenticate, optionalAuth } from "../middleware/auth";
import {
  authStatus,
  exchangeToken,
  getCurrentUser,
} from "../controllers/authController";

const router = Router();

/**
 * @route   POST /auth/exchange
 * @desc    Exchange Cognito token for application user session
 * @access  Private (requires valid Cognito token)
 */
router.post("/exchange", authenticate, exchangeToken);

/**
 * @route   GET /auth/me
 * @desc    Get current authenticated user profile with additional data
 * @access  Private (requires authentication)
 * @returns User profile with role-specific data (applications, properties, etc.)
 */
router.get("/me", authenticate, getCurrentUser);

/**
 * @route   GET /auth/status
 * @desc    Check authentication status (optional auth)
 * @access  Public (authentication optional)
 * @returns Authentication status and basic user info if authenticated
 */
router.get("/status", optionalAuth, authStatus);

export default router;
