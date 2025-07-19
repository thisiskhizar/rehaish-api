import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";
import { CreateApplicationInput } from "../utils/validation";

export const submitApplication = async (
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

    const { id: tenantId } = req.user;
    const applicationData = req.body as CreateApplicationInput;

    // Check if property exists
    const property = await prisma.property.findUnique({
      where: { id: applicationData.propertyId },
      include: {
        manager: {
          select: {
            id: true,
            name: true,
          },
        },
        location: {
          select: {
            city: true,
            address: true,
          },
        },
      },
    });

    if (!property) {
      res.status(404).json({
        success: false,
        message: "Property not found",
        code: "PROPERTY_NOT_FOUND",
      });
      return;
    }

    // Check if tenant already applied for this property
    const existingApplication = await prisma.application.findFirst({
      where: {
        propertyId: applicationData.propertyId,
        tenantId,
      },
    });

    if (existingApplication) {
      res.status(409).json({
        success: false,
        message: "You have already applied for this property",
        code: "APPLICATION_EXISTS",
        data: {
          existingApplication: {
            id: existingApplication.id,
            status: existingApplication.status,
            createdAt: existingApplication.createdAt,
          },
        },
      });
      return;
    }

    // Create application
    const application = await prisma.application.create({
      data: {
        propertyId: applicationData.propertyId,
        tenantId,
        fullName: applicationData.fullName,
        email: applicationData.email,
        phoneNumber: applicationData.phoneNumber,
        message: applicationData.message,
        status: "PENDING",
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            slug: true,
            pricePerMonth: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: {
        application,
        property: {
          id: property.id,
          title: property.title,
          location: property.location,
          manager: property.manager,
        },
      },
    });
  } catch (error) {
    console.error("Submit application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application",
      code: "APPLICATION_SUBMIT_FAILED",
    });
  }
};

export const getTenantApplications = async (
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

    const { id: tenantId } = req.user;
    const {
      page = 1,
      limit = 10,
      status,
      sort = "-createdAt",
    } = req.query as any;

    // Build where conditions
    const whereConditions: any = {
      tenantId,
    };

    if (status) {
      whereConditions.status = status;
    }

    // Determine sort order
    let orderBy: any = { createdAt: "desc" };
    if (sort) {
      const [field, direction] = sort.startsWith("-")
        ? [sort.substring(1), "desc"]
        : [sort, "asc"];
      orderBy = { [field]: direction };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [applications, totalCount] = await Promise.all([
      prisma.application.findMany({
        where: whereConditions,
        include: {
          property: {
            include: {
              location: {
                select: {
                  city: true,
                  address: true,
                },
              },
              manager: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.application.count({ where: whereConditions }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      message: "Applications retrieved successfully",
      data: {
        applications,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        stats: {
          pending: applications.filter((app) => app.status === "PENDING")
            .length,
          approved: applications.filter((app) => app.status === "APPROVED")
            .length,
          rejected: applications.filter((app) => app.status === "REJECTED")
            .length,
          withdrawn: applications.filter((app) => app.status === "WITHDRAWN")
            .length,
        },
      },
    });
  } catch (error) {
    console.error("Get tenant applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve applications",
      code: "APPLICATIONS_FETCH_FAILED",
    });
  }
};

export const withdrawApplication = async (
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

    const { id: tenantId } = req.user;
    const { id: applicationId } = req.params;

    // Find application and verify ownership
    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        tenantId,
      },
    });

    if (!application) {
      res.status(404).json({
        success: false,
        message: "Application not found or access denied",
        code: "APPLICATION_NOT_FOUND",
      });
      return;
    }

    // Check if application can be withdrawn
    if (application.status !== "PENDING") {
      res.status(400).json({
        success: false,
        message: `Cannot withdraw application with status: ${application.status}`,
        code: "INVALID_STATUS_FOR_WITHDRAWAL",
        data: {
          currentStatus: application.status,
          allowedStatus: "PENDING",
        },
      });
      return;
    }

    // Update application status
    const withdrawnApplication = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: "WITHDRAWN",
        updatedAt: new Date(),
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Application withdrawn successfully",
      data: {
        application: withdrawnApplication,
        withdrawnAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Withdraw application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to withdraw application",
      code: "APPLICATION_WITHDRAW_FAILED",
    });
  }
};

export const getManagerApplications = async (
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

    const { id: managerId } = req.user;
    const {
      page = 1,
      limit = 10,
      status,
      propertyId,
      sort = "-createdAt",
    } = req.query as any;

    // Build where conditions
    const whereConditions: any = {
      property: {
        managerId,
      },
    };

    if (status) {
      whereConditions.status = status;
    }

    if (propertyId) {
      whereConditions.propertyId = propertyId;
    }

    // Determine sort order
    let orderBy: any = { createdAt: "desc" };
    if (sort) {
      const [field, direction] = sort.startsWith("-")
        ? [sort.substring(1), "desc"]
        : [sort, "asc"];
      orderBy = { [field]: direction };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [applications, totalCount] = await Promise.all([
      prisma.application.findMany({
        where: whereConditions,
        include: {
          property: {
            select: {
              id: true,
              title: true,
              slug: true,
              pricePerMonth: true,
              propertyType: true,
              location: {
                select: {
                  city: true,
                  address: true,
                },
              },
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              createdAt: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.application.count({ where: whereConditions }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    // Calculate statistics
    const stats = {
      total: totalCount,
      pending: applications.filter((app) => app.status === "PENDING").length,
      approved: applications.filter((app) => app.status === "APPROVED").length,
      rejected: applications.filter((app) => app.status === "REJECTED").length,
      withdrawn: applications.filter((app) => app.status === "WITHDRAWN")
        .length,
    };

    res.status(200).json({
      success: true,
      message: "Manager applications retrieved successfully",
      data: {
        applications,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        stats,
        filters: {
          applied: {
            status,
            propertyId,
          },
          sort,
        },
      },
    });
  } catch (error) {
    console.error("Get manager applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve applications",
      code: "MANAGER_APPLICATIONS_FETCH_FAILED",
    });
  }
};

export const updateApplicationStatus = async (
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

    const { id: managerId } = req.user;
    const { id: applicationId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!["APPROVED", "REJECTED"].includes(status)) {
      res.status(400).json({
        success: false,
        message: "Invalid status. Must be APPROVED or REJECTED",
        code: "INVALID_STATUS",
        data: {
          allowedStatuses: ["APPROVED", "REJECTED"],
        },
      });
      return;
    }

    // Find application and verify manager owns the property
    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        property: {
          managerId,
        },
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            managerId: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!application) {
      res.status(404).json({
        success: false,
        message: "Application not found or access denied",
        code: "APPLICATION_NOT_FOUND",
      });
      return;
    }

    // Check if application can be updated
    if (application.status !== "PENDING") {
      res.status(400).json({
        success: false,
        message: `Cannot update application with status: ${application.status}`,
        code: "INVALID_STATUS_FOR_UPDATE",
        data: {
          currentStatus: application.status,
          allowedStatus: "PENDING",
        },
      });
      return;
    }

    // Update application status
    const updatedApplication = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status,
        updatedAt: new Date(),
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            pricePerMonth: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: `Application ${status.toLowerCase()} successfully`,
      data: {
        application: updatedApplication,
        updatedAt: new Date().toISOString(),
        previousStatus: application.status,
        newStatus: status,
      },
    });
  } catch (error) {
    console.error("❌ Update application status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update application status",
      code: "APPLICATION_STATUS_UPDATE_FAILED",
    });
  }
};
