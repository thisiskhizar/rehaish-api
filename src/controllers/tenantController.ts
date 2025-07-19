import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";
import {
  validateRequest,
  CreateTenantInput,
  UpdateTenantInput,
} from "../utils/validation";

export const registerTenant = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (req.user.role !== "tenant") {
      res.status(403).json({
        success: false,
        message: "Access denied. Tenant role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId, email } = req.user;
    const { name, phoneNumber } = req.body as CreateTenantInput;

    // Check if tenant already exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { id: cognitoId },
    });

    if (existingTenant) {
      res.status(409).json({
        success: false,
        message: "Tenant profile already exists",
        code: "TENANT_EXISTS",
      });
      return;
    }

    // Create new tenant profile
    const tenant = await prisma.tenant.create({
      data: {
        id: cognitoId,
        email,
        name,
        phoneNumber,
      },
    });

    res.status(201).json({
      success: true,
      message: "Tenant profile created successfully",
      data: {
        tenant: {
          id: tenant.id,
          email: tenant.email,
          name: tenant.name,
          phoneNumber: tenant.phoneNumber,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Register tenant error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register tenant profile",
      code: "TENANT_REGISTRATION_FAILED",
    });
  }
};

export const getTenantProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (req.user.role !== "tenant") {
      res.status(403).json({
        success: false,
        message: "Access denied. Tenant role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId } = req.user;

    const tenant = await prisma.tenant.findUnique({
      where: { id: cognitoId },
      include: {
        applications: {
          include: {
            property: {
              select: {
                id: true,
                title: true,
                slug: true,
                pricePerMonth: true,
                propertyType: true,
                photoUrls: true,
                location: {
                  select: {
                    city: true,
                    address: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10, // Latest 10 applications
        },
        leases: {
          include: {
            property: {
              select: {
                id: true,
                title: true,
                slug: true,
                pricePerMonth: true,
                location: {
                  select: {
                    city: true,
                    address: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 5, // Latest 5 leases
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 10, // Latest 10 payments
        },
        favoritedProperties: {
          select: {
            id: true,
            title: true,
            slug: true,
            pricePerMonth: true,
            propertyType: true,
            photoUrls: true,
            averageRating: true,
            location: {
              select: {
                city: true,
                address: true,
              },
            },
          },
          take: 20, // Latest 20 favorites
        },
      },
    });

    if (!tenant) {
      res.status(404).json({
        success: false,
        message: "Tenant profile not found",
        code: "TENANT_NOT_FOUND",
      });
      return;
    }

    // Calculate profile completion percentage
    const profileFields = {
      name: !!tenant.name,
      email: !!tenant.email,
      phoneNumber: !!tenant.phoneNumber,
    };

    const completedFields = Object.values(profileFields).filter(Boolean).length;
    const profileCompletion = Math.round(
      (completedFields / Object.keys(profileFields).length) * 100
    );

    // Calculate statistics
    const stats = {
      totalApplications: tenant.applications.length,
      pendingApplications: tenant.applications.filter(
        (app) => app.status === "PENDING"
      ).length,
      approvedApplications: tenant.applications.filter(
        (app) => app.status === "APPROVED"
      ).length,
      activeLeases: tenant.leases.filter((lease) => lease.status === "ACTIVE")
        .length,
      totalLeases: tenant.leases.length,
      totalFavorites: tenant.favoritedProperties.length,
      totalPayments: tenant.payments.length,
      profileCompletion,
    };

    res.status(200).json({
      success: true,
      message: "Tenant profile retrieved successfully",
      data: {
        tenant: {
          id: tenant.id,
          email: tenant.email,
          name: tenant.name,
          phoneNumber: tenant.phoneNumber,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt,
        },
        applications: tenant.applications,
        leases: tenant.leases,
        payments: tenant.payments,
        favorites: tenant.favoritedProperties,
        stats,
        profileCompletion,
      },
    });
  } catch (error) {
    console.error("Get tenant profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve tenant profile",
      code: "TENANT_PROFILE_FETCH_FAILED",
    });
  }
};

export const updateTenantProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (req.user.role !== "tenant") {
      res.status(403).json({
        success: false,
        message: "Access denied. Tenant role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId } = req.user;
    const updateData = req.body as UpdateTenantInput;

    // Update tenant profile
    const updatedTenant = await prisma.tenant.update({
      where: { id: cognitoId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: "Tenant profile updated successfully",
      data: {
        tenant: {
          id: updatedTenant.id,
          email: updatedTenant.email,
          name: updatedTenant.name,
          phoneNumber: updatedTenant.phoneNumber,
          createdAt: updatedTenant.createdAt,
          updatedAt: updatedTenant.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Update tenant profile error:", error);

    if (error instanceof Error && error.message.includes("Unique constraint")) {
      res.status(409).json({
        success: false,
        message: "Email or phone number already in use",
        code: "DUPLICATE_FIELD",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Failed to update tenant profile",
      code: "TENANT_UPDATE_FAILED",
    });
  }
};

export const getTenantFavorites = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (req.user.role !== "tenant") {
      res.status(403).json({
        success: false,
        message: "Access denied. Tenant role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId } = req.user;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const tenant = await prisma.tenant.findUnique({
      where: { id: cognitoId },
      include: {
        favoritedProperties: {
          include: {
            location: {
              select: {
                address: true,
                city: true,
                state: true,
              },
            },
            manager: {
              select: {
                name: true,
                phoneNumber: true,
              },
            },
            _count: {
              select: {
                reviews: true,
                applications: true,
              },
            },
          },
          orderBy: { postedDate: "desc" },
          skip,
          take: limit,
        },
      },
    });

    if (!tenant) {
      res.status(404).json({
        success: false,
        message: "Tenant not found",
        code: "TENANT_NOT_FOUND",
      });
      return;
    }

    // Get total count for pagination
    const totalFavorites = await prisma.tenant.findUnique({
      where: { id: cognitoId },
      select: {
        _count: {
          select: {
            favoritedProperties: true,
          },
        },
      },
    });

    const totalCount = totalFavorites?._count.favoritedProperties || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      message: "Favorites retrieved successfully",
      data: {
        favorites: tenant.favoritedProperties,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get tenant favorites error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve favorites",
      code: "FAVORITES_FETCH_FAILED",
    });
  }
};

export const addToFavorites = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (req.user.role !== "tenant") {
      res.status(403).json({
        success: false,
        message: "Access denied. Tenant role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId } = req.user;
    const { propertyId } = req.params;

    // Check if property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, title: true },
    });

    if (!property) {
      res.status(404).json({
        success: false,
        message: "Property not found",
        code: "PROPERTY_NOT_FOUND",
      });
      return;
    }

    // Check if already favorited
    const existingFavorite = await prisma.tenant.findUnique({
      where: { id: cognitoId },
      select: {
        favoritedProperties: {
          where: { id: propertyId },
          select: { id: true },
        },
      },
    });

    if (
      existingFavorite?.favoritedProperties &&
      existingFavorite.favoritedProperties.length > 0
    ) {
      res.status(409).json({
        success: false,
        message: "Property already in favorites",
        code: "ALREADY_FAVORITED",
      });
      return;
    }

    // Add to favorites
    await prisma.tenant.update({
      where: { id: cognitoId },
      data: {
        favoritedProperties: {
          connect: { id: propertyId },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Property added to favorites",
      data: {
        propertyId,
        propertyTitle: property.title,
        addedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Add to favorites error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add property to favorites",
      code: "ADD_FAVORITE_FAILED",
    });
  }
};

export const removeFromFavorites = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (req.user.role !== "tenant") {
      res.status(403).json({
        success: false,
        message: "Access denied. Tenant role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId } = req.user;
    const { propertyId } = req.params;

    // Check if property is in favorites
    const favorite = await prisma.tenant.findUnique({
      where: { id: cognitoId },
      select: {
        favoritedProperties: {
          where: { id: propertyId },
          select: { id: true, title: true },
        },
      },
    });

    if (!favorite?.favoritedProperties.length) {
      res.status(404).json({
        success: false,
        message: "Property not found in favorites",
        code: "FAVORITE_NOT_FOUND",
      });
      return;
    }

    // Remove from favorites
    await prisma.tenant.update({
      where: { id: cognitoId },
      data: {
        favoritedProperties: {
          disconnect: { id: propertyId },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Property removed from favorites",
      data: {
        propertyId,
        propertyTitle: favorite.favoritedProperties[0].title,
        removedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Remove from favorites error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove property from favorites",
      code: "REMOVE_FAVORITE_FAILED",
    });
  }
};
