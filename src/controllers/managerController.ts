import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";
import { CreateManagerInput, UpdateManagerInput } from "../utils/validation";

export const registerManager = async (
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

    if (req.user.role !== "manager") {
      res.status(403).json({
        success: false,
        message: "Access denied. Manager role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId, email } = req.user;
    const { name, phoneNumber } = req.body as CreateManagerInput;

    // Check if manager already exists
    const existingManager = await prisma.manager.findUnique({
      where: { id: cognitoId },
    });

    if (existingManager) {
      res.status(409).json({
        success: false,
        message: "Manager profile already exists",
        code: "MANAGER_EXISTS",
      });
      return;
    }

    // Create new manager profile
    const manager = await prisma.manager.create({
      data: {
        id: cognitoId,
        email,
        name,
        phoneNumber,
      },
    });

    res.status(201).json({
      success: true,
      message: "Manager profile created successfully",
      data: {
        manager: {
          id: manager.id,
          email: manager.email,
          name: manager.name,
          phoneNumber: manager.phoneNumber,
          createdAt: manager.createdAt,
          updatedAt: manager.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Register manager error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register manager profile",
      code: "MANAGER_REGISTRATION_FAILED",
    });
  }
};

export const getManagerProfile = async (
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

    if (req.user.role !== "manager") {
      res.status(403).json({
        success: false,
        message: "Access denied. Manager role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId } = req.user;

    const manager = await prisma.manager.findUnique({
      where: { id: cognitoId },
      include: {
        properties: {
          include: {
            location: {
              select: {
                city: true,
                address: true,
              },
            },
            applications: {
              where: { status: "PENDING" },
              include: {
                tenant: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phoneNumber: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
            },
            leases: {
              where: { status: "ACTIVE" },
              include: {
                tenant: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
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
        },
      },
    });

    if (!manager) {
      res.status(404).json({
        success: false,
        message: "Manager profile not found",
        code: "MANAGER_NOT_FOUND",
      });
      return;
    }

    // Calculate profile completion percentage
    const profileFields = {
      name: !!manager.name,
      email: !!manager.email,
      phoneNumber: !!manager.phoneNumber,
    };

    const completedFields = Object.values(profileFields).filter(Boolean).length;
    const profileCompletion = Math.round(
      (completedFields / Object.keys(profileFields).length) * 100
    );

    // Calculate portfolio statistics
    const totalApplications = manager.properties.reduce(
      (sum, prop) => sum + prop._count.applications,
      0
    );
    const totalLeases = manager.properties.reduce(
      (sum, prop) => sum + prop._count.leases,
      0
    );
    const totalReviews = manager.properties.reduce(
      (sum, prop) => sum + prop._count.reviews,
      0
    );
    const pendingApplications = manager.properties.reduce(
      (sum, prop) => sum + prop.applications.length,
      0
    );
    const activeLeases = manager.properties.reduce(
      (sum, prop) => sum + prop.leases.length,
      0
    );

    // Calculate average rating across all properties
    const ratedProperties = manager.properties.filter(
      (prop) => prop.averageRating
    );
    const averageRating =
      ratedProperties.length > 0
        ? Number(
            (
              ratedProperties.reduce(
                (sum, prop) => sum + (prop.averageRating || 0),
                0
              ) / ratedProperties.length
            ).toFixed(1)
          )
        : 0;

    // Calculate monthly revenue from active leases
    const monthlyRevenue = manager.properties.reduce((sum, prop) => {
      return (
        sum +
        prop.leases.reduce((leaseSum, lease) => leaseSum + lease.rentAmount, 0)
      );
    }, 0);

    const stats = {
      totalProperties: manager.properties.length,
      totalApplications,
      pendingApplications,
      totalLeases,
      activeLeases,
      totalReviews,
      averageRating,
      monthlyRevenue,
      profileCompletion,
    };

    // Group properties by city for overview
    const propertiesByCity = manager.properties.reduce((acc, property) => {
      const city = property.location.city;
      if (!acc[city]) {
        acc[city] = [];
      }
      acc[city].push(property);
      return acc;
    }, {} as { [city: string]: any[] });

    res.status(200).json({
      success: true,
      message: "Manager profile retrieved successfully",
      data: {
        manager: {
          id: manager.id,
          email: manager.email,
          name: manager.name,
          phoneNumber: manager.phoneNumber,
          createdAt: manager.createdAt,
          updatedAt: manager.updatedAt,
        },
        properties: manager.properties,
        stats,
        analytics: {
          propertiesByCity,
          averageRating,
          monthlyRevenue,
        },
        profileCompletion,
      },
    });
  } catch (error) {
    console.error("Get manager profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve manager profile",
      code: "MANAGER_PROFILE_FETCH_FAILED",
    });
  }
};

export const updateManagerProfile = async (
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

    if (req.user.role !== "manager") {
      res.status(403).json({
        success: false,
        message: "Access denied. Manager role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId } = req.user;
    const updateData = req.body as UpdateManagerInput;

    // Update manager profile
    const updatedManager = await prisma.manager.update({
      where: { id: cognitoId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: "Manager profile updated successfully",
      data: {
        manager: {
          id: updatedManager.id,
          email: updatedManager.email,
          name: updatedManager.name,
          phoneNumber: updatedManager.phoneNumber,
          createdAt: updatedManager.createdAt,
          updatedAt: updatedManager.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Update manager profile error:", error);

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
      message: "Failed to update manager profile",
      code: "MANAGER_UPDATE_FAILED",
    });
  }
};

export const getManagerAnalytics = async (
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

    if (req.user.role !== "manager") {
      res.status(403).json({
        success: false,
        message: "Access denied. Manager role required.",
        code: "ACCESS_DENIED",
      });
      return;
    }

    const { id: cognitoId } = req.user;

    // Get manager's properties with detailed analytics
    const properties = await prisma.property.findMany({
      where: { managerId: cognitoId },
      include: {
        location: {
          select: {
            city: true,
            state: true,
          },
        },
        applications: {
          select: {
            status: true,
            createdAt: true,
          },
        },
        leases: {
          select: {
            status: true,
            startDate: true,
            endDate: true,
            rentAmount: true,
          },
        },
        reviews: {
          select: {
            rating: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            applications: true,
            leases: true,
            reviews: true,
          },
        },
      },
    });

    // Calculate time-based analytics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

    const analytics = {
      overview: {
        totalProperties: properties.length,
        totalRevenue: properties.reduce((sum, prop) => {
          return (
            sum +
            prop.leases
              .filter((lease) => lease.status === "ACTIVE")
              .reduce((leaseSum, lease) => leaseSum + lease.rentAmount, 0)
          );
        }, 0),
        averageRating: 0,
        occupancyRate: 0,
      },
      recent: {
        newApplications: 0,
        newLeases: 0,
        newReviews: 0,
      },
      trends: {
        applicationsByMonth: {} as { [key: string]: number },
        leasesByMonth: {} as { [key: string]: number },
        revenueByMonth: {} as { [key: string]: number },
      },
      propertyPerformance: [] as any[],
      locationAnalytics: {} as { [key: string]: any },
    };

    // Calculate recent activity (last 30 days)
    properties.forEach((property) => {
      analytics.recent.newApplications += property.applications.filter(
        (app) => app.createdAt >= thirtyDaysAgo
      ).length;

      analytics.recent.newLeases += property.leases.filter(
        (lease) => lease.startDate >= thirtyDaysAgo
      ).length;

      analytics.recent.newReviews += property.reviews.filter(
        (review) => review.createdAt >= thirtyDaysAgo
      ).length;
    });

    // Calculate average rating
    const allReviews = properties.flatMap((prop) => prop.reviews);
    if (allReviews.length > 0) {
      analytics.overview.averageRating = Number(
        (
          allReviews.reduce((sum, review) => sum + review.rating, 0) /
          allReviews.length
        ).toFixed(1)
      );
    }

    // Calculate occupancy rate
    const totalProperties = properties.length;
    const occupiedProperties = properties.filter((prop) =>
      prop.leases.some((lease) => lease.status === "ACTIVE")
    ).length;
    analytics.overview.occupancyRate =
      totalProperties > 0
        ? Number(((occupiedProperties / totalProperties) * 100).toFixed(1))
        : 0;

    // Generate property performance data
    analytics.propertyPerformance = properties.map((property) => {
      const activeLeases = property.leases.filter(
        (lease) => lease.status === "ACTIVE"
      );
      const avgRating =
        property.reviews.length > 0
          ? property.reviews.reduce((sum, review) => sum + review.rating, 0) /
            property.reviews.length
          : 0;

      return {
        id: property.id,
        title: property.title,
        city: property.location.city,
        monthlyRevenue: activeLeases.reduce(
          (sum, lease) => sum + lease.rentAmount,
          0
        ),
        averageRating: Number(avgRating.toFixed(1)),
        totalApplications: property._count.applications,
        totalLeases: property._count.leases,
        totalReviews: property._count.reviews,
        isOccupied: activeLeases.length > 0,
      };
    });

    // Generate location analytics
    const locationGroups = properties.reduce((acc, property) => {
      const key = `${property.location.city}, ${property.location.state}`;
      if (!acc[key]) {
        acc[key] = {
          properties: [],
          totalRevenue: 0,
          totalApplications: 0,
          averageRating: 0,
        };
      }
      acc[key].properties.push(property);
      return acc;
    }, {} as { [key: string]: any });

    Object.keys(locationGroups).forEach((location) => {
      const group = locationGroups[location];
      const properties = group.properties;

      group.totalRevenue = properties.reduce((sum: number, prop: any) => {
        return (
          sum +
          prop.leases
            .filter((lease: any) => lease.status === "ACTIVE")
            .reduce(
              (leaseSum: number, lease: any) => leaseSum + lease.rentAmount,
              0
            )
        );
      }, 0);

      group.totalApplications = properties.reduce(
        (sum: number, prop: any) => sum + prop._count.applications,
        0
      );

      const allReviews = properties.flatMap((prop: any) => prop.reviews);
      group.averageRating =
        allReviews.length > 0
          ? Number(
              (
                allReviews.reduce(
                  (sum: number, review: any) => sum + review.rating,
                  0
                ) / allReviews.length
              ).toFixed(1)
            )
          : 0;

      group.propertyCount = properties.length;
    });

    analytics.locationAnalytics = locationGroups;

    res.status(200).json({
      success: true,
      message: "Manager analytics retrieved successfully",
      data: {
        analytics,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Get manager analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve manager analytics",
      code: "ANALYTICS_FETCH_FAILED",
    });
  }
};
