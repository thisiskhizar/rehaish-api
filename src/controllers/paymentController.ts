import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";
import {
  validateRequest,
  CreatePaymentInput,
  UpdatePaymentSchema,
} from "../utils/validation";

export const createPaymentRecord = async (
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
    const paymentData = req.body as CreatePaymentInput;

    // Validate lease exists and manager owns it
    let lease = null;
    let property = null;
    let tenant = null;

    if (paymentData.leaseId) {
      lease = await prisma.lease.findFirst({
        where: {
          id: paymentData.leaseId,
          property: {
            managerId,
          },
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          property: {
            select: {
              id: true,
              title: true,
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

      tenant = lease.tenant;
      property = lease.property;
    } else if (paymentData.propertyId) {
      // Direct property payment (like application fee)
      property = await prisma.property.findFirst({
        where: {
          id: paymentData.propertyId,
          managerId,
        },
      });

      if (!property) {
        res.status(404).json({
          success: false,
          message: "Property not found or access denied",
          code: "PROPERTY_NOT_FOUND",
        });
        return;
      }
    } else {
      res.status(400).json({
        success: false,
        message: "Either leaseId or propertyId is required",
        code: "MISSING_REFERENCE",
      });
      return;
    }

    // For now, we need a tenant ID for all payments
    // In the future, this could be enhanced to handle different scenarios
    if (!tenant && lease) {
      tenant = lease.tenant;
    }

    if (!tenant) {
      res.status(400).json({
        success: false,
        message: "Tenant information is required for payment records",
        code: "TENANT_REQUIRED",
      });
      return;
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        leaseId: paymentData.leaseId,
        propertyId: paymentData.propertyId || property?.id,
        amount: paymentData.amount,
        paymentType: paymentData.paymentType,
        method: paymentData.method,
        status: "PENDING", // Default status
        paymentDate: new Date(paymentData.paymentDate),
        referenceId: paymentData.referenceId,
        note: paymentData.note,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        lease: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
          },
        },
        property: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Payment record created successfully",
      data: {
        payment,
      },
    });
  } catch (error) {
    console.error("Create payment record error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment record",
      code: "PAYMENT_CREATE_FAILED",
    });
  }
};

export const getManagerPayments = async (
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
      paymentType,
      propertyId,
      leaseId,
      sort = "-paymentDate",
    } = req.query as any;

    // Build where conditions
    const whereConditions: any = {
      OR: [
        {
          lease: {
            property: {
              managerId,
            },
          },
        },
        {
          property: {
            managerId,
          },
        },
      ],
    };

    if (status) {
      whereConditions.status = status;
    }

    if (paymentType) {
      whereConditions.paymentType = paymentType;
    }

    if (propertyId) {
      whereConditions.propertyId = propertyId;
    }

    if (leaseId) {
      whereConditions.leaseId = leaseId;
    }

    // Determine sort order
    let orderBy: any = { paymentDate: "desc" };
    if (sort) {
      const [field, direction] = sort.startsWith("-")
        ? [sort.substring(1), "desc"]
        : [sort, "asc"];
      orderBy = { [field]: direction };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [payments, totalCount] = await Promise.all([
      prisma.payment.findMany({
        where: whereConditions,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
          lease: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              status: true,
            },
          },
          property: {
            select: {
              id: true,
              title: true,
              slug: true,
              location: {
                select: {
                  address: true,
                  city: true,
                },
              },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.payment.count({ where: whereConditions }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    // Calculate payment statistics
    const stats = {
      total: totalCount,
      completed: payments.filter((payment) => payment.status === "COMPLETED")
        .length,
      pending: payments.filter((payment) => payment.status === "PENDING")
        .length,
      failed: payments.filter((payment) => payment.status === "FAILED").length,
      totalAmount: payments
        .filter((payment) => payment.status === "COMPLETED")
        .reduce((sum, payment) => sum + payment.amount, 0),
    };

    res.status(200).json({
      success: true,
      message: "Manager payments retrieved successfully",
      data: {
        payments,
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
            paymentType,
            propertyId,
            leaseId,
          },
          sort,
        },
      },
    });
  } catch (error) {
    console.error("Get manager payments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve payments",
      code: "MANAGER_PAYMENTS_FETCH_FAILED",
    });
  }
};

export const updatePaymentStatus = async (
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
    const { id: paymentId } = req.params;
    const updateData = req.body;

    // Find payment and verify access
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        OR: [
          {
            lease: {
              property: {
                managerId,
              },
            },
          },
          {
            property: {
              managerId,
            },
          },
        ],
      },
      include: {
        tenant: {
          select: {
            name: true,
            email: true,
          },
        },
        property: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!payment) {
      res.status(404).json({
        success: false,
        message: "Payment not found or access denied",
        code: "PAYMENT_NOT_FOUND",
      });
      return;
    }

    // Update payment
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        property: {
          select: {
            id: true,
            title: true,
          },
        },
        lease: {
          select: {
            id: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Payment updated successfully",
      data: {
        payment: updatedPayment,
        statusChange: {
          from: payment.status,
          to: updatedPayment.status,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Update payment status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update payment",
      code: "PAYMENT_UPDATE_FAILED",
    });
  }
};

export const getTenantPayments = async (
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
      paymentType,
      leaseId,
      sort = "-paymentDate",
    } = req.query as any;

    // Build where conditions
    const whereConditions: any = {
      tenantId,
    };

    if (status) {
      whereConditions.status = status;
    }

    if (paymentType) {
      whereConditions.paymentType = paymentType;
    }

    if (leaseId) {
      whereConditions.leaseId = leaseId;
    }

    // Determine sort order
    let orderBy: any = { paymentDate: "desc" };
    if (sort) {
      const [field, direction] = sort.startsWith("-")
        ? [sort.substring(1), "desc"]
        : [sort, "asc"];
      orderBy = { [field]: direction };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [payments, totalCount] = await Promise.all([
      prisma.payment.findMany({
        where: whereConditions,
        include: {
          lease: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              status: true,
              rentAmount: true,
            },
          },
          property: {
            include: {
              location: {
                select: {
                  address: true,
                  city: true,
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
      prisma.payment.count({ where: whereConditions }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    // Calculate payment statistics
    const stats = {
      total: totalCount,
      completed: payments.filter((payment) => payment.status === "COMPLETED")
        .length,
      pending: payments.filter((payment) => payment.status === "PENDING")
        .length,
      failed: payments.filter((payment) => payment.status === "FAILED").length,
      totalPaid: payments
        .filter((payment) => payment.status === "COMPLETED")
        .reduce((sum, payment) => sum + payment.amount, 0),
    };

    res.status(200).json({
      success: true,
      message: "Tenant payments retrieved successfully",
      data: {
        payments,
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
            paymentType,
            leaseId,
          },
          sort,
        },
      },
    });
  } catch (error) {
    console.error("Get tenant payments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve payments",
      code: "TENANT_PAYMENTS_FETCH_FAILED",
    });
  }
};

export const getPaymentById = async (
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

    const { id: paymentId } = req.params;
    const { id: userId, role } = req.user;

    // Build access conditions based on role
    const whereConditions: any = { id: paymentId };

    if (role === "tenant") {
      whereConditions.tenantId = userId;
    } else if (role === "manager") {
      whereConditions.OR = [
        {
          lease: {
            property: {
              managerId: userId,
            },
          },
        },
        {
          property: {
            managerId: userId,
          },
        },
      ];
    }

    const payment = await prisma.payment.findFirst({
      where: whereConditions,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        lease: {
          include: {
            property: {
              include: {
                location: {
                  select: {
                    address: true,
                    city: true,
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
        },
        property: {
          include: {
            location: {
              select: {
                address: true,
                city: true,
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
    });

    if (!payment) {
      res.status(404).json({
        success: false,
        message: "Payment not found or access denied",
        code: "PAYMENT_NOT_FOUND",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Payment details retrieved successfully",
      data: {
        payment,
        viewedAt: new Date().toISOString(),
        viewerRole: role,
      },
    });
  } catch (error) {
    console.error("Get payment by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve payment details",
      code: "PAYMENT_FETCH_FAILED",
    });
  }
};
