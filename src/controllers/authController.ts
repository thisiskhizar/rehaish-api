import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";
import { z } from "zod";
import { getPermissions } from "../utils/helpers";

const TokenExchangeSchema = z.object({
  cognitoAccessToken: z.string().min(1, "Access token is required"),
  role: z.enum(["tenant", "manager"]).optional(),
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const exchangeToken = async (
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

    const {
      id: cognitoId,
      email,
      role,
      name,
      phoneNumber,
      emailVerified,
    } = req.user;

    // Check if user exists in our database and create/update as needed
    let userRecord = null;
    let userType = role;

    if (role === "tenant") {
      // Find or create tenant record
      userRecord = await prisma.tenant.upsert({
        where: { id: cognitoId },
        update: {
          email,
          name: name || "Rehaish User",
          phoneNumber: phoneNumber || "",
          updatedAt: new Date(),
        },
        create: {
          id: cognitoId,
          email,
          name: name || "Rehaish User",
          phoneNumber: phoneNumber || "",
        },
      });
    } else if (role === "manager") {
      // Find or create manager record
      userRecord = await prisma.manager.upsert({
        where: { id: cognitoId },
        update: {
          email,
          name: name || "Rehaish User",
          phoneNumber: phoneNumber || "",
          updatedAt: new Date(),
        },
        create: {
          id: cognitoId,
          email,
          name: name || "Rehaish User",
          phoneNumber: phoneNumber || "",
        },
      });
    } else {
      // Default to tenant if role is not specified or is admin
      userType = "tenant";
      userRecord = await prisma.tenant.upsert({
        where: { id: cognitoId },
        update: {
          email,
          name: name || "Rehaish User",
          phoneNumber: phoneNumber || "",
          updatedAt: new Date(),
        },
        create: {
          id: cognitoId,
          email,
          name: name || "Rehaish User",
          phoneNumber: phoneNumber || "",
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Token exchange successful",
      data: {
        user: {
          id: cognitoId,
          email,
          name: userRecord.name,
          phoneNumber: userRecord.phoneNumber,
          role: userType,
          emailVerified,
          createdAt: userRecord.createdAt,
          updatedAt: userRecord.updatedAt,
        },
        session: {
          authenticated: true,
          role: userType,
          permissions: getPermissions(userType),
        },
      },
    });
  } catch (error) {
    console.error("Token exchange error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to exchange token",
      code: "TOKEN_EXCHANGE_FAILED",
    });
  }
};

export const getCurrentUser = async (
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

    const { id: cognitoId, role } = req.user;

    let userRecord = null;
    let additionalData = {};

    if (role === "tenant") {
      userRecord = await prisma.tenant.findUnique({
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
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 5, // Recent applications
          },
          leases: {
            include: {
              property: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 3, // Recent leases
          },
          favoritedProperties: {
            select: {
              id: true,
              title: true,
              slug: true,
              pricePerMonth: true,
              propertyType: true,
              photoUrls: true,
            },
            take: 10, // Recent favorites
          },
        },
      });

      if (userRecord) {
        additionalData = {
          recentApplications: userRecord.applications,
          activeLeases: userRecord.leases.filter(
            (lease) => lease.status === "ACTIVE"
          ),
          recentFavorites: userRecord.favoritedProperties,
          stats: {
            totalApplications: userRecord.applications.length,
            totalLeases: userRecord.leases.length,
            totalFavorites: userRecord.favoritedProperties.length,
          },
        };
      }
    } else if (role === "manager") {
      userRecord = await prisma.manager.findUnique({
        where: { id: cognitoId },
        include: {
          properties: {
            include: {
              applications: {
                where: { status: "PENDING" },
                include: {
                  tenant: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                },
              },
              leases: {
                where: { status: "ACTIVE" },
              },
              _count: {
                select: {
                  applications: true,
                  leases: true,
                  reviews: true,
                },
              },
            },
            orderBy: { postedDate: "desc" },
            take: 5, // Recent properties
          },
        },
      });

      if (userRecord) {
        const totalApplications = userRecord.properties.reduce(
          (sum, prop) => sum + prop._count.applications,
          0
        );
        const totalLeases = userRecord.properties.reduce(
          (sum, prop) => sum + prop._count.leases,
          0
        );
        const pendingApplications = userRecord.properties.reduce(
          (sum, prop) => sum + prop.applications.length,
          0
        );

        additionalData = {
          recentProperties: userRecord.properties,
          stats: {
            totalProperties: userRecord.properties.length,
            totalApplications,
            totalLeases,
            pendingApplications,
          },
        };
      }
    }

    if (!userRecord) {
      res.status(404).json({
        success: false,
        message: "User record not found",
        code: "USER_NOT_FOUND",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "User profile retrieved successfully",
      data: {
        user: {
          id: userRecord.id,
          email: userRecord.email,
          name: userRecord.name,
          phoneNumber: userRecord.phoneNumber,
          role,
          emailVerified: req.user.emailVerified,
          createdAt: userRecord.createdAt,
          updatedAt: userRecord.updatedAt,
        },
        ...additionalData,
        session: {
          authenticated: true,
          role,
          permissions: getPermissions(role),
        },
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve user profile",
      code: "PROFILE_FETCH_FAILED",
    });
  }
};

export const authStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user) {
      res.status(200).json({
        success: true,
        message: "User is authenticated",
        data: {
          authenticated: true,
          user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role,
            emailVerified: req.user.emailVerified,
          },
          session: {
            role: req.user.role,
            permissions: getPermissions(req.user.role),
          },
        },
      });
    } else {
      res.status(200).json({
        success: true,
        message: "User is not authenticated",
        data: {
          authenticated: false,
          user: null,
          session: null,
        },
      });
    }
  } catch (error) {
    console.error("Auth status check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check authentication status",
      code: "AUTH_STATUS_CHECK_FAILED",
    });
  }
};
