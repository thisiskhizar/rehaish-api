import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";
import { CreatePropertyInput, UpdatePropertyInput } from "../utils/validation";
import { generatePropertySlug } from "../utils/helpers";
import {
  addCoordinatesToProperties,
  addCoordinatesToProperty,
} from "../utils/coordinates";

export const createProperty = async (
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
    const propertyData = req.body as CreatePropertyInput;

    // Generate slug from title
    const baseSlug = generatePropertySlug(propertyData.title);
    let slug = baseSlug;
    let counter = 1;

    // Ensure slug uniqueness
    while (await prisma.property.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create location first using raw SQL due to PostGIS geography type
    await prisma.$executeRaw`
      INSERT INTO "Location" (address, city, state, "postalCode", country, coordinates, "createdAt", "updatedAt")
      VALUES (${propertyData.location.address}, ${
      propertyData.location.city
    }, ${propertyData.location.state}, 
              ${propertyData.location.postalCode}, ${
      propertyData.location.country
    }, 
              ST_GeogFromText(${`POINT(${propertyData.location.coordinates.longitude} ${propertyData.location.coordinates.latitude})`}),
              NOW(), NOW())
    `;

    // Get the created location ID
    const createdLocation = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Location" 
      WHERE address = ${propertyData.location.address} 
      AND city = ${propertyData.location.city}
      ORDER BY "createdAt" DESC 
      LIMIT 1
    `;

    const locationId = createdLocation[0]?.id;

    if (!locationId) {
      throw new Error("Failed to create location");
    }

    // Create property
    const property = await prisma.property.create({
      data: {
        title: propertyData.title,
        slug,
        description: propertyData.description,
        photoUrls: [], // Will be updated when images are uploaded
        pricePerMonth: propertyData.pricePerMonth,
        securityDeposit: propertyData.securityDeposit,
        applicationFee: propertyData.applicationFee,
        propertyType: propertyData.propertyType,
        bedrooms: propertyData.bedrooms,
        bathrooms: propertyData.bathrooms,
        area: propertyData.area,
        isPetsAllowed: propertyData.isPetsAllowed,
        isParkingIncluded: propertyData.isParkingIncluded,
        isFurnished: propertyData.isFurnished,
        highlights: propertyData.highlights,
        amenities: propertyData.amenities,
        locationId: locationId,
        managerId,
      },
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
    });

    const propertyWithCoordinates = await addCoordinatesToProperty(property);

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      data: {
        property: propertyWithCoordinates,
      },
    });
  } catch (error) {
    console.error("Create property error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create property",
      code: "PROPERTY_CREATE_FAILED",
    });
  }
};

export const getManagerProperties = async (
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
      sort = "-postedDate",
      city,
      propertyType,
      status,
    } = req.query as any;

    // Build where conditions
    const whereConditions: any = {
      managerId,
    };

    if (city) {
      whereConditions.location = {
        city: {
          contains: city,
          mode: "insensitive",
        },
      };
    }

    if (propertyType) {
      whereConditions.propertyType = propertyType;
    }

    // Determine sort order
    let orderBy: any = { postedDate: "desc" };
    if (sort) {
      const [field, direction] = sort.startsWith("-")
        ? [sort.substring(1), "desc"]
        : [sort, "asc"];
      orderBy = { [field]: direction };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [properties, totalCount] = await Promise.all([
      prisma.property.findMany({
        where: whereConditions,
        include: {
          location: true,
          applications: {
            where: { status: "PENDING" },
            include: {
              tenant: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            take: 5, // Latest 5 pending applications
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
        orderBy,
        skip,
        take: limit,
      }),
      prisma.property.count({ where: whereConditions }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const propertiesWithCoordinates = await addCoordinatesToProperties(
      properties
    );

    res.status(200).json({
      success: true,
      message: "Properties retrieved successfully",
      data: {
        properties: propertiesWithCoordinates,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage,
          hasPrevPage,
        },
        filters: {
          applied: {
            city,
            propertyType,
            status,
          },
          sort,
        },
      },
    });
  } catch (error) {
    console.error("Get manager properties error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve properties",
      code: "PROPERTIES_FETCH_FAILED",
    });
  }
};

export const getManagerProperty = async (
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
    const { id: propertyId } = req.params;

    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        managerId, // Ensure manager owns this property
      },
      include: {
        location: true,
        applications: {
          include: {
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
          orderBy: { createdAt: "desc" },
        },
        leases: {
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
        reviews: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
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

    if (!property) {
      res.status(404).json({
        success: false,
        message: "Property not found or access denied",
        code: "PROPERTY_NOT_FOUND",
      });
      return;
    }

    // Calculate statistics
    const stats = {
      totalApplications: property._count.applications,
      pendingApplications: property.applications.filter(
        (app) => app.status === "PENDING"
      ).length,
      approvedApplications: property.applications.filter(
        (app) => app.status === "APPROVED"
      ).length,
      activeLeases: property.leases.filter((lease) => lease.status === "ACTIVE")
        .length,
      totalLeases: property._count.leases,
      totalReviews: property._count.reviews,
      averageRating: property.averageRating,
    };

    const propertyWithCoordinates = await addCoordinatesToProperty(property);

    res.status(200).json({
      success: true,
      message: "Property details retrieved successfully",
      data: {
        property: propertyWithCoordinates,
        stats,
      },
    });
  } catch (error) {
    console.error("Get manager property error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve property details",
      code: "PROPERTY_FETCH_FAILED",
    });
  }
};

export const updateProperty = async (
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
    const { id: propertyId } = req.params;
    const updateData = req.body as UpdatePropertyInput;

    // Verify property ownership
    const existingProperty = await prisma.property.findFirst({
      where: {
        id: propertyId,
        managerId,
      },
    });

    if (!existingProperty) {
      res.status(404).json({
        success: false,
        message: "Property not found or access denied",
        code: "PROPERTY_NOT_FOUND",
      });
      return;
    }

    // Update slug if title changed
    let updatePayload = { ...updateData };
    if (updateData.title && updateData.title !== existingProperty.title) {
      const baseSlug = generatePropertySlug(updateData.title);
      let newSlug = baseSlug;
      let counter = 1;

      // Ensure new slug uniqueness (excluding current property)
      while (true) {
        const slugExists = await prisma.property.findUnique({
          where: { slug: newSlug },
        });
        if (!slugExists || slugExists.id === propertyId) {
          break;
        }
        newSlug = `${baseSlug}-${counter}`;
        counter++;
      }
      updatePayload.slug = newSlug;
    }

    // Update property
    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: {
        ...updatePayload,
        updatedAt: new Date(),
      },
      include: {
        location: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const propertyWithCoordinates = await addCoordinatesToProperty(
      updatedProperty
    );

    res.status(200).json({
      success: true,
      message: "Property updated successfully",
      data: {
        property: propertyWithCoordinates,
      },
    });
  } catch (error) {
    console.error("Update property error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update property",
      code: "PROPERTY_UPDATE_FAILED",
    });
  }
};

export const deleteProperty = async (
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
    const { id: propertyId } = req.params;

    // Verify property ownership and check for active leases
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        managerId,
      },
      include: {
        leases: {
          where: { status: "ACTIVE" },
        },
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

    // Check for active leases
    if (property.leases.length > 0) {
      res.status(400).json({
        success: false,
        message: "Cannot delete property with active leases",
        code: "ACTIVE_LEASES_EXIST",
        data: {
          activeLeases: property.leases.length,
        },
      });
      return;
    }

    // Delete property (this will cascade to related records)
    await prisma.property.delete({
      where: { id: propertyId },
    });

    res.status(200).json({
      success: true,
      message: "Property deleted successfully",
      data: {
        propertyId,
        deletedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Delete property error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete property",
      code: "PROPERTY_DELETE_FAILED",
    });
  }
};
