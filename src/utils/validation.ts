import { z } from "zod";
import { Request, Response, NextFunction } from "express";

export const PropertyTypeSchema = z.enum([
  "HOUSE",
  "UPPER_PORTION",
  "LOWER_PORTION",
  "APARTMENT",
  "ROOM",
  "STUDIO",
  "PENTHOUSE",
  "FARM_HOUSE",
  "COMMERCIAL_UNIT",
]);

export const PropertyHighlightSchema = z.enum([
  "NEAR_MARKET",
  "NEAR_MOSQUE",
  "NEAR_SCHOOL",
  "NEAR_PARK",
  "CORNER_PLOT",
  "WIDE_ROAD_FRONT",
  "SEPARATE_ENTRANCE",
  "ROOFTOP_ACCESS",
  "RECENTLY_RENOVATED",
  "SOLAR_PANEL_READY",
  "WATER_AVAILABILITY_24_7",
  "NEAR_BUS_STOP",
]);

export const AmenitySchema = z.enum([
  "AC",
  "UPS",
  "GENERATOR",
  "SOLAR_PANEL",
  "WATER_TANK",
  "BOREWELL_WATER",
  "GEYSER",
  "INTERNET_INSTALLED",
  "CCTV_SECURITY",
  "GUARD",
  "GATED_COMMUNITY",
  "GARAGE",
  "BALCONY",
  "SERVANT_QUARTER",
  "LIFT",
  "LAWN_OR_GARDEN",
  "TILED_FLOORING",
  "MARBLE_FLOORING",
]);

export const ApplicationStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);

export const LeaseStatusSchema = z.enum([
  "ACTIVE",
  "TERMINATED",
  "COMPLETED",
  "PENDING_SIGNATURE",
]);

export const PaymentStatusSchema = z.enum([
  "PENDING",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
]);

export const PaymentTypeSchema = z.enum([
  "RENT",
  "SECURITY_DEPOSIT",
  "APPLICATION_FEE",
  "LATE_FEE",
  "MAINTENANCE_CHARGE",
  "REFUND",
]);

export const PaymentMethodSchema = z.enum([
  "BANK_TRANSFER",
  "EASYPAY",
  "JAZZCASH",
  "CARD",
  "WALLET",
  "CASH",
]);

// Pakistani phone number validation
export const PhoneNumberSchema = z
  .string()
  .regex(/^(\+92|0)?[0-9]{10}$/, "Invalid Pakistani phone number format")
  .transform((phone) => {
    // Normalize to international format
    if (phone.startsWith("0")) {
      return "+92" + phone.substring(1);
    }
    if (!phone.startsWith("+92")) {
      return "+92" + phone;
    }
    return phone;
  });

// Email validation with common domains
export const EmailSchema = z
  .string()
  .email("Invalid email format")
  .min(5, "Email must be at least 5 characters")
  .max(100, "Email must not exceed 100 characters")
  .toLowerCase()
  .transform((email) => email.trim());

// Password validation (for potential future use)
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number"
  );

// CNIC validation for Pakistani identity cards
export const CNICSchema = z
  .string()
  .regex(
    /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/,
    "Invalid CNIC format (use: 12345-1234567-1)"
  )
  .transform((cnic) => cnic.replace(/-/g, "")); // Store without dashes

// Currency amount validation (in PKR)
export const CurrencyAmountSchema = z
  .number()
  .int("Amount must be an integer")
  .min(0, "Amount cannot be negative")
  .max(1000000000, "Amount too large"); // 10 million PKR

// Coordinate validation for PostGIS
export const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const CreateTenantSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters")
    .regex(/^[a-zA-Z\s]+$/, "Name must contain only letters and spaces"),
  email: EmailSchema,
  phoneNumber: PhoneNumberSchema,
});

export const UpdateTenantSchema = CreateTenantSchema.partial();

export const CreateManagerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters")
    .regex(/^[a-zA-Z\s]+$/, "Name must contain only letters and spaces"),
  email: EmailSchema,
  phoneNumber: PhoneNumberSchema,
  cnic: CNICSchema.optional(), // For KYC verification
});

export const UpdateManagerSchema = CreateManagerSchema.partial();

export const CreateLocationSchema = z.object({
  address: z
    .string()
    .min(10, "Address must be at least 10 characters")
    .max(200, "Address must not exceed 200 characters"),
  city: z
    .string()
    .min(2, "City must be at least 2 characters")
    .max(50, "City must not exceed 50 characters"),
  state: z
    .string()
    .min(2, "State must be at least 2 characters")
    .max(50, "State must not exceed 50 characters"),
  postalCode: z.string().regex(/^[0-9]{5}$/, "Postal code must be 5 digits"),
  country: z
    .string()
    .min(2, "Country must be at least 2 characters")
    .max(50, "Country must not exceed 50 characters")
    .default("Pakistan"),
  coordinates: CoordinatesSchema,
});

export const CreatePropertySchema = z.object({
  title: z
    .string()
    .min(10, "Title must be at least 10 characters")
    .max(200, "Title must not exceed 200 characters"),
  description: z
    .string()
    .min(50, "Description must be at least 50 characters")
    .max(2000, "Description must not exceed 2000 characters"),
  pricePerMonth: CurrencyAmountSchema,
  securityDeposit: CurrencyAmountSchema,
  applicationFee: CurrencyAmountSchema.optional(),
  propertyType: PropertyTypeSchema,
  bedrooms: z
    .number()
    .int("Bedrooms must be a whole number")
    .min(0, "Bedrooms cannot be negative")
    .max(20, "Bedrooms cannot exceed 20"),
  bathrooms: z
    .number()
    .int("Bathrooms must be a whole number")
    .min(0, "Bathrooms cannot be negative")
    .max(20, "Bathrooms cannot exceed 20"),
  area: z
    .number()
    .int("Area must be a whole number")
    .min(1, "Area must be at least 1 square feet")
    .max(100000, "Area cannot exceed 100,000 square feet"),
  isPetsAllowed: z.boolean(),
  isParkingIncluded: z.boolean(),
  isFurnished: z.boolean(),
  highlights: z
    .array(PropertyHighlightSchema)
    .max(6, "Cannot have more than 6 highlights"),
  amenities: z
    .array(AmenitySchema)
    .max(10, "Cannot have more than 10 amenities"),
  location: CreateLocationSchema,
});

export const UpdatePropertySchema = CreatePropertySchema.partial()
  .omit({ location: true })
  .extend({
    slug: z
      .string()
      .min(5, "Slug must be at least 5 characters")
      .max(100, "Slug must not exceed 100 characters")
      .regex(
        /^[a-z0-9-]+$/,
        "Slug must contain only lowercase letters, numbers, and hyphens"
      )
      .optional(),
  });

export const PropertySearchSchema = z.object({
  city: z.string().optional(),
  area: z.string().optional(),
  propertyType: PropertyTypeSchema.optional(),
  minRent: z.coerce.number().int().min(0).optional(),
  maxRent: z.coerce.number().int().min(0).optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
  maxBedrooms: z.coerce.number().int().max(20).optional(),
  minBathrooms: z.coerce.number().int().min(0).optional(),
  maxBathrooms: z.coerce.number().int().max(20).optional(),
  minArea: z.coerce.number().int().min(1).optional(),
  maxArea: z.coerce.number().int().max(100000).optional(),
  isPetsAllowed: z.coerce.boolean().optional(),
  isParkingIncluded: z.coerce.boolean().optional(),
  isFurnished: z.coerce.boolean().optional(),
  amenities: z.array(AmenitySchema).optional(),
  highlights: z.array(PropertyHighlightSchema).optional(),
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  // Sorting
  sort: z
    .enum(["price", "-price", "area", "-area", "postedDate", "-postedDate"])
    .default("-postedDate"),
});

export const CreateApplicationSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must not exceed 100 characters"),
  email: EmailSchema,
  phoneNumber: PhoneNumberSchema,
  message: z
    .string()
    .max(1000, "Message must not exceed 1000 characters")
    .optional(),
});

export const UpdateApplicationStatusSchema = z.object({
  status: ApplicationStatusSchema,
});

// Application status update schema for manager operations
export const ManagerApplicationStatusUpdateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], {
    required_error: "Status is required",
    invalid_type_error: "Status must be APPROVED or REJECTED",
  }),
});

export const CreateLeaseSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  tenantId: z.string().uuid("Invalid tenant ID"),
  applicationId: z.string().uuid("Invalid application ID").optional(),
  startDate: z.string().datetime("Invalid start date"),
  endDate: z.string().datetime("Invalid end date"),
  rentAmount: CurrencyAmountSchema,
  securityDeposit: CurrencyAmountSchema,
  paymentDueDate: z
    .number()
    .int("Payment due date must be a whole number")
    .min(1, "Payment due date must be between 1-31")
    .max(31, "Payment due date must be between 1-31"),
  leaseAgreementUrl: z.string().url("Invalid lease agreement URL").optional(),
});

export const UpdateLeaseSchema = CreateLeaseSchema.partial();

export const CreatePaymentSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID").optional(),
  propertyId: z.string().uuid("Invalid property ID").optional(),
  amount: CurrencyAmountSchema,
  paymentType: PaymentTypeSchema,
  method: PaymentMethodSchema,
  paymentDate: z.string().datetime("Invalid payment date"),
  referenceId: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

export const UpdatePaymentSchema = z.object({
  status: PaymentStatusSchema,
  referenceId: z.string().max(100).optional(),
  receiptUrl: z.string().url().optional(),
  note: z.string().max(500).optional(),
});

export const CreateReviewSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  rating: z
    .number()
    .int("Rating must be a whole number")
    .min(1, "Rating must be between 1-5")
    .max(5, "Rating must be between 1-5"),
  comment: z
    .string()
    .max(1000, "Comment must not exceed 1000 characters")
    .optional(),
});

/**
 * Generic validation middleware factory
 * Creates middleware that validates request body, query, or params using Zod schemas
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  source: "body" | "query" | "params" = "body"
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const validatedData = schema.parse(data);

      // Replace the original data with validated/transformed data
      // Use Object.defineProperty to handle read-only properties in Express 5.x
      Object.defineProperty(req, source, {
        value: validatedData,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
          code: "VALIDATION_ERROR",
        });
        return;
      }

      // Unexpected error
      console.error("Validation middleware error:", error);
      res.status(500).json({
        success: false,
        message: "Internal validation error",
        code: "INTERNAL_ERROR",
      });
    }
  };
}

/**
 * Validate multiple sources (body, query, params) at once
 */
export function validateMultiple(schemas: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const errors: any[] = [];

      // Validate each source
      if (schemas.body) {
        try {
          const validatedBody = schemas.body.parse(req.body);
          Object.defineProperty(req, "body", {
            value: validatedBody,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push(
              ...error.errors.map((err) => ({
                source: "body",
                field: err.path.join("."),
                message: err.message,
                code: err.code,
              }))
            );
          }
        }
      }

      if (schemas.query) {
        try {
          const validatedQuery = schemas.query.parse(req.query);
          Object.defineProperty(req, "query", {
            value: validatedQuery,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push(
              ...error.errors.map((err) => ({
                source: "query",
                field: err.path.join("."),
                message: err.message,
                code: err.code,
              }))
            );
          }
        }
      }

      if (schemas.params) {
        try {
          const validatedParams = schemas.params.parse(req.params);
          Object.defineProperty(req, "params", {
            value: validatedParams,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push(
              ...error.errors.map((err) => ({
                source: "params",
                field: err.path.join("."),
                message: err.message,
                code: err.code,
              }))
            );
          }
        }
      }

      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
          code: "VALIDATION_ERROR",
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Multi-validation middleware error:", error);
      res.status(500).json({
        success: false,
        message: "Internal validation error",
        code: "INTERNAL_ERROR",
      });
    }
  };
}

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
export type CreateManagerInput = z.infer<typeof CreateManagerSchema>;
export type UpdateManagerInput = z.infer<typeof UpdateManagerSchema>;
export type CreatePropertyInput = z.infer<typeof CreatePropertySchema>;
export type UpdatePropertyInput = z.infer<typeof UpdatePropertySchema>;
export type PropertySearchInput = z.infer<typeof PropertySearchSchema>;
export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;
export type CreateLeaseInput = z.infer<typeof CreateLeaseSchema>;
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
