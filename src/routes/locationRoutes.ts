import { Router } from "express";
import {
  getLocations,
  getNearbyProperties,
  getPopularCities,
  getLocationSuggestions,
} from "../controllers/locationController";
import { validateRequest } from "../utils/validation";
import { z } from "zod";

const router = Router();

const LocationQuerySchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const NearbySearchSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(0.1).max(50).default(5), // radius in kilometers
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const SuggestionsQuerySchema = z.object({
  q: z.string().min(2, "Query must be at least 2 characters"),
});

const CitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * @route   GET /locations
 * @desc    Get all locations with property statistics
 * @access  Public
 * @query   { q?: string, city?: string, state?: string, limit?: number }
 * @example GET /locations?city=Lahore&limit=20
 * @example GET /locations?q=Model Town&limit=10
 */
router.get("/", validateRequest(LocationQuerySchema, "query"), getLocations);

/**
 * @route   GET /locations/nearby
 * @desc    Find properties near given coordinates using PostGIS
 * @access  Public
 * @query   { latitude: number, longitude: number, radius?: number, limit?: number }
 * @example GET /locations/nearby?latitude=31.5497&longitude=74.3436&radius=5&limit=20
 */
router.get(
  "/nearby",
  validateRequest(NearbySearchSchema, "query"),
  getNearbyProperties
);

/**
 * @route   GET /locations/cities
 * @desc    Get popular cities with property counts and statistics
 * @access  Public
 * @query   { limit?: number }
 * @example GET /locations/cities?limit=10
 */
router.get(
  "/cities",
  validateRequest(CitiesQuerySchema, "query"),
  getPopularCities
);

/**
 * @route   GET /locations/suggestions
 * @desc    Get location suggestions for autocomplete
 * @access  Public
 * @query   { q: string } - search query (minimum 2 characters)
 * @example GET /locations/suggestions?q=lahore
 */
router.get(
  "/suggestions",
  validateRequest(SuggestionsQuerySchema, "query"),
  getLocationSuggestions
);

export default router;
