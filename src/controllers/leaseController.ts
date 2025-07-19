import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";
import { CreateLeaseInput } from "../utils/validation";

export const createLease = async (
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
    const leaseData = req.body as CreateLeaseInput;

    // Validate and get the application
    const application = await prisma.application.findFirst({
      where: {
        id: leaseData.applicationId,
        status: "APPROVED",
        property: {
          managerId,
        },
      },
      include: {
        property: {
          include: {
            location: {
              select: {
                address: true,
                city: true,
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
          },
        },
      },
    });

    if (!application) {
      res.status(404).json({
        success: false,
        message: "Approved application not found or access denied",
        code: "APPLICATION_NOT_FOUND",
      });
      return;
    }

    console.log("Creating lease for application:", application);

    // Check if lease already exists for this application
    const existingLease = await prisma.lease.findUnique({
      where: { applicationId: application.id },
    });

    if (existingLease) {
      res.status(409).json({
        success: false,
        message: "Lease already exists for this application",
        code: "LEASE_EXISTS",
        data: {
          existingLease: {
            id: existingLease.id,
            status: existingLease.status,
            createdAt: existingLease.createdAt,
          },
        },
      });
      return;
    }

    // Check for date conflicts with existing active leases for the property
    const conflictingLease = await prisma.lease.findFirst({
      where: {
        propertyId: application.propertyId,
        status: "ACTIVE",
        OR: [
          {
            AND: [
              { startDate: { lte: leaseData.endDate } },
              { endDate: { gte: leaseData.startDate } },
            ],
          },
        ],
      },
    });

    if (conflictingLease) {
      res.status(409).json({
        success: false,
        message: "Property already has an active lease during this period",
        code: "LEASE_CONFLICT",
        data: {
          conflictingLease: {
            id: conflictingLease.id,
            startDate: conflictingLease.startDate,
            endDate: conflictingLease.endDate,
          },
        },
      });
      return;
    }

    // Create the lease
    const lease = await prisma.lease.create({
      data: {
        propertyId: application.propertyId,
        tenantId: application.tenantId,
        applicationId: application.id,
        startDate: leaseData.startDate,
        endDate: leaseData.endDate,
        rentAmount: leaseData.rentAmount,
        securityDeposit: leaseData.securityDeposit,
        paymentDueDate: leaseData.paymentDueDate,
        leaseAgreementUrl: leaseData.leaseAgreementUrl,
        status: "PENDING_SIGNATURE",
      },
      include: {
        property: {
          include: {
            location: {
              select: {
                address: true,
                city: true,
                state: true,
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
          },
        },
        application: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Lease created successfully",
      data: {
        lease,
        property: {
          title: application.property.title,
          location: application.property.location,
        },
        tenant: application.tenant,
      },
    });
  } catch (error) {
    console.error("Create lease error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create lease",
      code: "LEASE_CREATE_FAILED",
    });
  }
};

export const getManagerLeases = async (
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
    const [leases, totalCount] = await Promise.all([
      prisma.lease.findMany({
        where: whereConditions,
        include: {
          property: {
            select: {
              id: true,
              title: true,
              slug: true,
              propertyType: true,
              location: {
                select: {
                  address: true,
                  city: true,
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
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              paymentType: true,
              status: true,
              paymentDate: true,
            },
            orderBy: { paymentDate: "desc" },
            take: 3, // Recent payments
          },
          _count: {
            select: {
              payments: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.lease.count({ where: whereConditions }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    // Calculate statistics
    const stats = {
      total: totalCount,
      active: leases.filter((lease) => lease.status === "ACTIVE").length,
      pendingSignature: leases.filter(
        (lease) => lease.status === "PENDING_SIGNATURE"
      ).length,
      completed: leases.filter((lease) => lease.status === "COMPLETED").length,
      terminated: leases.filter((lease) => lease.status === "TERMINATED")
        .length,
    };

    res.status(200).json({
      success: true,
      message: "Manager leases retrieved successfully",
      data: {
        leases,
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
    console.error("Get manager leases error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve leases",
      code: "MANAGER_LEASES_FETCH_FAILED",
    });
  }
};

export const updateLeaseStatus = async (
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
    const { id: leaseId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["ACTIVE", "TERMINATED", "COMPLETED"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        message: "Invalid status",
        code: "INVALID_STATUS",
        data: {
          allowedStatuses: validStatuses,
        },
      });
      return;
    }

    // Find lease and verify ownership
    const lease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        property: {
          managerId,
        },
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
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

    if (!lease) {
      res.status(404).json({
        success: false,
        message: "Lease not found or access denied",
        code: "LEASE_NOT_FOUND",
      });
      return;
    }

    // Validate status transition
    const currentStatus = lease.status;
    const validTransitions: { [key: string]: string[] } = {
      PENDING_SIGNATURE: ["ACTIVE", "TERMINATED"],
      ACTIVE: ["TERMINATED", "COMPLETED"],
      TERMINATED: [], // Terminal state
      COMPLETED: [], // Terminal state
    };

    if (!validTransitions[currentStatus].includes(status)) {
      res.status(400).json({
        success: false,
        message: `Cannot transition from ${currentStatus} to ${status}`,
        code: "INVALID_STATUS_TRANSITION",
        data: {
          currentStatus,
          requestedStatus: status,
          allowedTransitions: validTransitions[currentStatus],
        },
      });
      return;
    }

    // Update lease status
    const updatedLease = await prisma.lease.update({
      where: { id: leaseId },
      data: {
        status,
        updatedAt: new Date(),
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
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
      message: `Lease status updated to ${status}`,
      data: {
        lease: updatedLease,
        statusChange: {
          from: currentStatus,
          to: status,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Update lease status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update lease status",
      code: "LEASE_STATUS_UPDATE_FAILED",
    });
  }
};

export const getTenantLeases = async (
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
    const [leases, totalCount] = await Promise.all([
      prisma.lease.findMany({
        where: whereConditions,
        include: {
          property: {
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
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              paymentType: true,
              status: true,
              paymentDate: true,
            },
            orderBy: { paymentDate: "desc" },
            take: 5, // Recent payments
          },
          _count: {
            select: {
              payments: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.lease.count({ where: whereConditions }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    // Calculate lease statistics
    const stats = {
      total: totalCount,
      active: leases.filter((lease) => lease.status === "ACTIVE").length,
      pendingSignature: leases.filter(
        (lease) => lease.status === "PENDING_SIGNATURE"
      ).length,
      completed: leases.filter((lease) => lease.status === "COMPLETED").length,
      terminated: leases.filter((lease) => lease.status === "TERMINATED")
        .length,
    };

    res.status(200).json({
      success: true,
      message: "Tenant leases retrieved successfully",
      data: {
        leases,
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
          },
          sort,
        },
      },
    });
  } catch (error) {
    console.error("Get tenant leases error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve leases",
      code: "TENANT_LEASES_FETCH_FAILED",
    });
  }
};

export const getLeaseById = async (
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

    const { id: leaseId } = req.params;
    const { id: userId, role } = req.user;

    // Build access conditions based on role
    const whereConditions: any = { id: leaseId };

    if (role === "tenant") {
      whereConditions.tenantId = userId;
    } else if (role === "manager") {
      whereConditions.property = { managerId: userId };
    }

    const lease = await prisma.lease.findFirst({
      where: whereConditions,
      include: {
        property: {
          include: {
            location: true,
            manager: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
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
          },
        },
        application: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            message: true,
            createdAt: true,
          },
        },
        payments: {
          include: {
            tenant: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { paymentDate: "desc" },
        },
        _count: {
          select: {
            payments: true,
          },
        },
      },
    });

    if (!lease) {
      res.status(404).json({
        success: false,
        message: "Lease not found or access denied",
        code: "LEASE_NOT_FOUND",
      });
      return;
    }

    // Calculate lease metrics
    const totalPaid = lease.payments
      .filter((payment) => payment.status === "COMPLETED")
      .reduce((sum, payment) => sum + payment.amount, 0);

    const nextPaymentDue = new Date();
    nextPaymentDue.setDate(lease.paymentDueDate);
    if (nextPaymentDue < new Date()) {
      nextPaymentDue.setMonth(nextPaymentDue.getMonth() + 1);
    }

    const daysUntilExpiry = Math.ceil(
      (lease.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    res.status(200).json({
      success: true,
      message: "Lease details retrieved successfully",
      data: {
        lease,
        metrics: {
          totalPaid,
          totalPayments: lease._count.payments,
          nextPaymentDue: lease.status === "ACTIVE" ? nextPaymentDue : null,
          daysUntilExpiry: lease.status === "ACTIVE" ? daysUntilExpiry : null,
        },
        viewedAt: new Date().toISOString(),
        viewerRole: role,
      },
    });
  } catch (error) {
    console.error("Get lease by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve lease details",
      code: "LEASE_FETCH_FAILED",
    });
  }
};
