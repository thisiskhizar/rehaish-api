import { Router } from "express";
import { PropertySearchSchema, validateRequest } from "../utils/validation";
import { optionalAuth } from "../middleware/auth";
import {
  getProperties,
  getPropertyById,
  getPropertySuggestions,
} from "../controllers/propertyController";
import { z } from "zod";

const router = Router();

const PropertyParamsSchema = z.object({
  id: z.string().min(1, "Property ID or slug is required"),
});

const SuggestionsQuerySchema = z.object({
  q: z.string().min(2, "Query must be at least 2 characters"),
});

/**
 * @route   GET /properties
 * @desc    Get all properties with advanced filtering and search
 * @access  Public (optional authentication for favorites)
 * @query   PropertySearchInput - filters, pagination, sorting
 * @example GET /properties?city=Lahore&minRent=20000&maxRent=50000&page=1&limit=10&sort=-postedDate
 */
router.get(
  "/",
  validateRequest(PropertySearchSchema, "query"),
  optionalAuth,
  getProperties
);

/**
 * @route   GET /properties/:id
 * @desc    Get property details by ID or slug
 * @access  Public (optional authentication for favorites status)
 * @params  { id: string } - property ID or slug
 * @example GET /properties/abc123-nice-house-in-lahore
 * @example GET /properties/550e8400-e29b-41d4-a716-446655440000
 */
router.get(
  "/:id",
  validateRequest(PropertyParamsSchema, "params"),
  optionalAuth,
  getPropertyById
);

/**
 * @route   GET /properties/suggestions
 * @desc    Get search suggestions for autocomplete
 * @access  Public
 * @query   { q: string } - search query (minimum 2 characters)
 * @example GET /properties/suggestions?q=lahore
 */
router.get(
  "/suggestions",
  validateRequest(SuggestionsQuerySchema, "query"),
  getPropertySuggestions
);

export default router;
