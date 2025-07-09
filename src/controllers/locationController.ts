import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { databaseService } from "../services/database";

export const getLocations = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();
    const { q, city, state, limit } = req.query as any;

    // Build where conditions
    const whereConditions: any = {};

    if (q) {
      whereConditions.OR = [
        {
          city: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          address: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          state: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    if (city) {
      whereConditions.city = {
        contains: city,
        mode: "insensitive",
      };
    }

    if (state) {
      whereConditions.state = {
        contains: state,
        mode: "insensitive",
      };
    }

    // Get locations with property counts
    const locations = await prisma.location.findMany({
      where: whereConditions,
      include: {
        properties: {
          select: {
            id: true,
            pricePerMonth: true,
            propertyType: true,
            averageRating: true,
          },
        },
      },
      orderBy: [
        {
          properties: {
            _count: "desc",
          },
        },
        {
          city: "asc",
        },
      ],
      take: limit,
    });

    // Calculate statistics for each location
    const locationsWithStats = locations.map((location) => {
      const properties = location.properties;
      const propertyCount = properties.length;

      let avgPrice = 0;
      let avgRating = 0;
      const propertyTypes: { [key: string]: number } = {};

      if (propertyCount > 0) {
        avgPrice = Math.round(
          properties.reduce((sum, prop) => sum + prop.pricePerMonth, 0) /
            propertyCount
        );

        const ratedProperties = properties.filter((prop) => prop.averageRating);
        if (ratedProperties.length > 0) {
          avgRating = Number(
            (
              ratedProperties.reduce(
                (sum, prop) => sum + (prop.averageRating || 0),
                0
              ) / ratedProperties.length
            ).toFixed(1)
          );
        }

        properties.forEach((prop) => {
          propertyTypes[prop.propertyType] =
            (propertyTypes[prop.propertyType] || 0) + 1;
        });
      }

      return {
        id: location.id,
        address: location.address,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        country: location.country,
        statistics: {
          propertyCount,
          averagePrice: avgPrice,
          averageRating: avgRating,
          propertyTypes,
        },
        createdAt: location.createdAt,
        updatedAt: location.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      message: "Locations retrieved successfully",
      data: {
        locations: locationsWithStats,
        metadata: {
          count: locationsWithStats.length,
          filters: {
            query: q,
            city,
            state,
          },
        },
      },
    });
  } catch (error) {
    console.error("Get locations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve locations",
      code: "LOCATIONS_FETCH_FAILED",
    });
  }
};

export const getNearbyProperties = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();
    const { latitude, longitude, radius, limit } = req.query as any;

    // Use PostGIS to find properties within the specified radius
    // ST_DWithin uses meters, so convert radius from km to meters
    const radiusInMeters = radius * 1000;

    // Raw query using PostGIS for spatial search
    const nearbyProperties = (await prisma.$queryRaw`
      SELECT 
        p.id,
        p.slug,
        p.title,
        p.description,
        p."photoUrls",
        p."pricePerMonth",
        p."securityDeposit",
        p."propertyType",
        p.bedrooms,
        p.bathrooms,
        p.area,
        p."isPetsAllowed",
        p."isParkingIncluded",
        p."isFurnished",
        p.highlights,
        p.amenities,
        p."averageRating",
        p."numberOfReviews",
        p."postedDate",
        l.id as location_id,
        l.address,
        l.city,
        l.state,
        l."postalCode",
        l.country,
        m.id as manager_id,
        m.name as manager_name,
        m."phoneNumber" as manager_phone,
        -- Calculate distance in kilometers
        ST_Distance(
          l.coordinates::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) / 1000 as distance_km
      FROM "Property" p
      JOIN "Location" l ON p."locationId" = l.id
      JOIN "Manager" m ON p."managerId" = m.id
      WHERE ST_DWithin(
        l.coordinates::geography,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radiusInMeters}
      )
      ORDER BY distance_km ASC
      LIMIT ${limit}
    `) as any[];

    // Format the results
    const formattedProperties = nearbyProperties.map((row: any) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      photoUrls: row.photoUrls,
      pricePerMonth: row.pricePerMonth,
      securityDeposit: row.securityDeposit,
      propertyType: row.propertyType,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      area: row.area,
      isPetsAllowed: row.isPetsAllowed,
      isParkingIncluded: row.isParkingIncluded,
      isFurnished: row.isFurnished,
      highlights: row.highlights,
      amenities: row.amenities,
      averageRating: row.averageRating,
      numberOfReviews: row.numberOfReviews,
      postedDate: row.postedDate,
      distance: {
        km: Number(Number(row.distance_km).toFixed(2)),
        meters: Math.round(Number(row.distance_km) * 1000),
      },
      location: {
        id: row.location_id,
        address: row.address,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
        country: row.country,
      },
      manager: {
        id: row.manager_id,
        name: row.manager_name,
        phoneNumber: row.manager_phone,
      },
    }));

    res.status(200).json({
      success: true,
      message: "Nearby properties retrieved successfully",
      data: {
        properties: formattedProperties,
        searchCenter: {
          latitude,
          longitude,
        },
        searchRadius: {
          km: radius,
          meters: radiusInMeters,
        },
        metadata: {
          count: formattedProperties.length,
          maxDistance:
            formattedProperties.length > 0
              ? formattedProperties[formattedProperties.length - 1].distance.km
              : 0,
        },
      },
    });
  } catch (error) {
    console.error("Get nearby properties error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve nearby properties",
      code: "NEARBY_SEARCH_FAILED",
    });
  }
};

export const getPopularCities = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prisma = databaseService.getClient();
    const limit = Number(req.query.limit) || 20;

    // Get cities with basic grouping first
    const cities = await prisma.location.groupBy({
      by: ["city", "state"],
      _count: true,
      orderBy: {
        _count: {
          city: "desc",
        },
      },
      take: limit,
    });

    // Get property counts for each city separately
    const cityCounts = await Promise.all(
      cities.map(async (cityGroup) => {
        const count = await prisma.property.count({
          where: {
            location: {
              city: cityGroup.city,
              state: cityGroup.state,
            },
          },
        });
        return { ...cityGroup, propertyCount: count };
      })
    );

    // Get additional statistics for each city
    const citiesWithStats = await Promise.all(
      cityCounts.map(async (cityGroup) => {
        const cityProperties = await prisma.property.findMany({
          where: {
            location: {
              city: cityGroup.city,
              state: cityGroup.state,
            },
          },
          select: {
            pricePerMonth: true,
            propertyType: true,
            averageRating: true,
          },
        });

        let avgPrice = 0;
        let avgRating = 0;
        const propertyTypes: { [key: string]: number } = {};

        if (cityProperties.length > 0) {
          avgPrice = Math.round(
            cityProperties.reduce((sum, prop) => sum + prop.pricePerMonth, 0) /
              cityProperties.length
          );

          const ratedProperties = cityProperties.filter(
            (prop) => prop.averageRating
          );
          if (ratedProperties.length > 0) {
            avgRating = Number(
              (
                ratedProperties.reduce(
                  (sum, prop) => sum + (prop.averageRating || 0),
                  0
                ) / ratedProperties.length
              ).toFixed(1)
            );
          }

          cityProperties.forEach((prop) => {
            propertyTypes[prop.propertyType] =
              (propertyTypes[prop.propertyType] || 0) + 1;
          });
        }

        return {
          city: cityGroup.city,
          state: cityGroup.state,
          propertyCount: cityGroup.propertyCount,
          averagePrice: avgPrice,
          averageRating: avgRating,
          propertyTypes,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Popular cities retrieved successfully",
      data: {
        cities: citiesWithStats,
        metadata: {
          count: citiesWithStats.length,
          totalProperties: citiesWithStats.reduce(
            (sum, city) => sum + city.propertyCount,
            0
          ),
        },
      },
    });
  } catch (error) {
    console.error("Get popular cities error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve popular cities",
      code: "CITIES_FETCH_FAILED",
    });
  }
};

export const getLocationSuggestions = async (
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

    // Get location suggestions
    const suggestions = await prisma.location.findMany({
      where: {
        OR: [
          {
            city: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            address: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            state: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        _count: {
          select: {
            properties: true,
          },
        },
      },
      orderBy: {
        properties: {
          _count: "desc",
        },
      },
      take: 10,
    });

    const formattedSuggestions = suggestions.map((location) => ({
      id: location.id,
      display: `${location.address}, ${location.city}`,
      city: location.city,
      state: location.state,
      address: location.address,
      propertyCount: location._count.properties,
      type: "location" as const,
    }));

    res.status(200).json({
      success: true,
      message: "Location suggestions retrieved successfully",
      data: {
        suggestions: formattedSuggestions,
        query: q,
      },
    });
  } catch (error) {
    console.error("Get location suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve location suggestions",
      code: "LOCATION_SUGGESTIONS_FAILED",
    });
  }
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * (Fallback for when PostGIS is not available)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
