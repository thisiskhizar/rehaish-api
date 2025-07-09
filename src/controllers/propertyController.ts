import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";

export const getProperties = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();

    // Extract validated query parameters (validated by middleware)
    const searchParams = req.query as any;
    const {
      city,
      area,
      propertyType,
      minRent,
      maxRent,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minArea,
      maxArea,
      isPetsAllowed,
      isParkingIncluded,
      isFurnished,
      amenities,
      highlights,
      page = 1,
      limit = 10,
      sort = "-postedDate",
    } = searchParams;

    // Build where conditions dynamically
    const whereConditions: any = {};

    // Location-based filters
    if (city || area) {
      whereConditions.location = {};
      if (city) {
        whereConditions.location.city = {
          contains: city,
          mode: "insensitive",
        };
      }
      if (area) {
        whereConditions.location.address = {
          contains: area,
          mode: "insensitive",
        };
      }
    }

    // Property type filter
    if (propertyType) {
      whereConditions.propertyType = propertyType;
    }

    // Price range filters
    if (minRent || maxRent) {
      whereConditions.pricePerMonth = {};
      if (minRent) whereConditions.pricePerMonth.gte = minRent;
      if (maxRent) whereConditions.pricePerMonth.lte = maxRent;
    }

    // Bedroom filters
    if (minBedrooms || maxBedrooms) {
      whereConditions.bedrooms = {};
      if (minBedrooms) whereConditions.bedrooms.gte = minBedrooms;
      if (maxBedrooms) whereConditions.bedrooms.lte = maxBedrooms;
    }

    // Bathroom filters
    if (minBathrooms || maxBathrooms) {
      whereConditions.bathrooms = {};
      if (minBathrooms) whereConditions.bathrooms.gte = minBathrooms;
      if (maxBathrooms) whereConditions.bathrooms.lte = maxBathrooms;
    }

    // Area filters
    if (minArea || maxArea) {
      whereConditions.area = {};
      if (minArea) whereConditions.area.gte = minArea;
      if (maxArea) whereConditions.area.lte = maxArea;
    }

    // Boolean filters
    if (typeof isPetsAllowed === "boolean") {
      whereConditions.isPetsAllowed = isPetsAllowed;
    }
    if (typeof isParkingIncluded === "boolean") {
      whereConditions.isParkingIncluded = isParkingIncluded;
    }
    if (typeof isFurnished === "boolean") {
      whereConditions.isFurnished = isFurnished;
    }

    // Array filters (amenities and highlights)
    if (amenities && amenities.length > 0) {
      whereConditions.amenities = {
        hasEvery: amenities,
      };
    }
    if (highlights && highlights.length > 0) {
      whereConditions.highlights = {
        hasEvery: highlights,
      };
    }

    // Determine sort order
    let orderBy: any = { postedDate: "desc" }; // default
    if (sort) {
      const [field, direction] = sort.startsWith("-")
        ? [sort.substring(1), "desc"]
        : [sort, "asc"];

      orderBy = { [field]: direction };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query with all filters
    const [properties, totalCount] = await Promise.all([
      prisma.property.findMany({
        where: whereConditions,
        include: {
          location: {
            select: {
              id: true,
              address: true,
              city: true,
              state: true,
              postalCode: true,
              country: true,
            },
          },
          manager: {
            select: {
              id: true,
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

    res.status(200).json({
      success: true,
      message: "Properties retrieved successfully",
      data: {
        properties,
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
            area,
            propertyType,
            priceRange:
              minRent || maxRent ? { min: minRent, max: maxRent } : null,
            bedrooms:
              minBedrooms || maxBedrooms
                ? { min: minBedrooms, max: maxBedrooms }
                : null,
            bathrooms:
              minBathrooms || maxBathrooms
                ? { min: minBathrooms, max: maxBathrooms }
                : null,
            areaRange:
              minArea || maxArea ? { min: minArea, max: maxArea } : null,
            amenities,
            highlights,
            isPetsAllowed,
            isParkingIncluded,
            isFurnished,
          },
          sort,
        },
      },
    });
  } catch (error) {
    console.error("Get properties error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve properties",
      code: "PROPERTIES_FETCH_FAILED",
    });
  }
};

export const getPropertyById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();
    const { id } = req.params;

    // Try to find by ID first, then by slug
    const property = await prisma.property.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
      include: {
        location: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            createdAt: true,
          },
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
          orderBy: {
            createdAt: "desc",
          },
          take: 10, // Latest 10 reviews
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
        message: "Property not found",
        code: "PROPERTY_NOT_FOUND",
      });
      return;
    }

    // Check if user has favorited this property (if authenticated)
    let isFavorited = false;
    if (req.user && req.user.role === "tenant") {
      const favoriteCheck = await prisma.tenant.findUnique({
        where: { id: req.user.id },
        select: {
          favoritedProperties: {
            where: { id: property.id },
            select: { id: true },
          },
        },
      });
      isFavorited = (favoriteCheck?.favoritedProperties.length || 0) > 0;
    }

    // Find similar properties (same city, similar price range)
    const similarProperties = await prisma.property.findMany({
      where: {
        AND: [
          { id: { not: property.id } },
          { location: { city: property.location.city } },
          {
            pricePerMonth: {
              gte: property.pricePerMonth * 0.8, // 20% below
              lte: property.pricePerMonth * 1.2, // 20% above
            },
          },
        ],
      },
      include: {
        location: {
          select: {
            address: true,
            city: true,
          },
        },
        _count: {
          select: {
            reviews: true,
          },
        },
      },
      take: 4,
      orderBy: {
        averageRating: "desc",
      },
    });

    res.status(200).json({
      success: true,
      message: "Property details retrieved successfully",
      data: {
        property: {
          ...property,
          isFavorited,
        },
        similarProperties,
        metadata: {
          viewedAt: new Date().toISOString(),
          viewerRole: req.user?.role || "anonymous",
        },
      },
    });
  } catch (error) {
    console.error("Get property by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve property details",
      code: "PROPERTY_FETCH_FAILED",
    });
  }
};

export const getPropertySuggestions = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();
    const { q } = req.query;

    if (!q || typeof q !== "string" || q.length < 2) {
      res.status(400).json({
        success: false,
        message: 'Query parameter "q" must be at least 2 characters',
        code: "INVALID_QUERY",
      });
      return;
    }

    // Get city suggestions with property counts
    const citySuggestions = await prisma.location.groupBy({
      by: ["city"],
      where: {
        city: {
          contains: q,
          mode: "insensitive",
        },
      },
      _count: true,
      orderBy: {
        _count: {
          city: "desc",
        },
      },
      take: 5,
    });

    // Get property counts for each city
    const cityPropertyCounts = await Promise.all(
      citySuggestions.map(async (cityGroup) => {
        const count = await prisma.property.count({
          where: {
            location: {
              city: cityGroup.city,
            },
          },
        });
        return {
          name: cityGroup.city,
          propertyCount: count,
          type: "city" as const,
        };
      })
    );

    // Get area suggestions (addresses)
    const areaSuggestions = await prisma.location.findMany({
      where: {
        OR: [
          {
            address: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            city: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        address: true,
        city: true,
        properties: {
          select: {
            id: true,
          },
        },
      },
      take: 10,
    });

    const areaPropertyCounts = areaSuggestions.map((location) => ({
      name: `${location.address}, ${location.city}`,
      propertyCount: location.properties.length,
      type: "area" as const,
    }));

    res.status(200).json({
      success: true,
      message: "Search suggestions retrieved successfully",
      data: {
        cities: cityPropertyCounts,
        areas: areaPropertyCounts.slice(0, 5), // Limit to 5
        query: q,
      },
    });
  } catch (error) {
    console.error("Get property suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve search suggestions",
      code: "SUGGESTIONS_FETCH_FAILED",
    });
  }
};
