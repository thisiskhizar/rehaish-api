import { databaseService } from "../services/database";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export async function getLocationCoordinates(
  locationId: number
): Promise<Coordinates | null> {
  try {
    const prisma = databaseService.getClient();

    const result = await prisma.$queryRaw<
      Array<{ latitude: number; longitude: number }>
    >`
      SELECT 
        ST_Y(ST_Transform(coordinates::geometry, 4326)) as latitude,
        ST_X(ST_Transform(coordinates::geometry, 4326)) as longitude
      FROM "Location" 
      WHERE id = ${locationId}
    `;

    if (result.length === 0) {
      return null;
    }

    return {
      latitude: Number(result[0].latitude),
      longitude: Number(result[0].longitude),
    };
  } catch (error) {
    console.warn(
      `Failed to extract coordinates for location ${locationId}:`,
      error
    );
    return null;
  }
}

export async function getMultipleLocationCoordinates(
  locationIds: number[]
): Promise<Map<number, Coordinates>> {
  try {
    const prisma = databaseService.getClient();
    const coordinatesMap = new Map<number, Coordinates>();

    if (locationIds.length === 0) {
      return coordinatesMap;
    }

    const results = await prisma.$queryRaw<
      Array<{ id: number; latitude: number; longitude: number }>
    >`
      SELECT 
        id,
        ST_Y(ST_Transform(coordinates::geometry, 4326)) as latitude,
        ST_X(ST_Transform(coordinates::geometry, 4326)) as longitude
      FROM "Location" 
      WHERE id = ANY(${locationIds})
    `;

    results.forEach((result) => {
      coordinatesMap.set(result.id, {
        latitude: Number(result.latitude),
        longitude: Number(result.longitude),
      });
    });

    return coordinatesMap;
  } catch (error) {
    console.warn(
      "Failed to extract coordinates for multiple locations:",
      error
    );
    return new Map();
  }
}

export async function addCoordinatesToProperty(property: any): Promise<any> {
  if (!property.location || !property.location.id) {
    return property;
  }

  const coordinates = await getLocationCoordinates(property.location.id);

  return {
    ...property,
    location: {
      ...property.location,
      coordinates: coordinates || null,
    },
  };
}

export async function addCoordinatesToProperties(
  properties: any[]
): Promise<any[]> {
  if (properties.length === 0) {
    return properties;
  }

  // Extract all unique location IDs
  const locationIds = [
    ...new Set(
      properties
        .filter((prop) => prop.location && prop.location.id)
        .map((prop) => prop.location.id)
    ),
  ];

  // Get coordinates for all locations at once
  const coordinatesMap = await getMultipleLocationCoordinates(locationIds);

  // Add coordinates to each property
  return properties.map((property) => {
    if (!property.location || !property.location.id) {
      return property;
    }

    const coordinates = coordinatesMap.get(property.location.id);

    return {
      ...property,
      location: {
        ...property.location,
        coordinates: coordinates || null,
      },
    };
  });
}

export async function addCoordinatesToLocation(location: any): Promise<any> {
  if (!location || !location.id) {
    return location;
  }

  const coordinates = await getLocationCoordinates(location.id);

  return {
    ...location,
    coordinates: coordinates || null,
  };
}

export async function addCoordinatesToLocations(
  locations: any[]
): Promise<any[]> {
  if (locations.length === 0) {
    return locations;
  }

  // Extract all location IDs
  const locationIds = locations
    .filter((loc) => loc && loc.id)
    .map((loc) => loc.id);

  // Get coordinates for all locations at once
  const coordinatesMap = await getMultipleLocationCoordinates(locationIds);

  // Add coordinates to each location
  return locations.map((location) => {
    if (!location || !location.id) {
      return location;
    }

    const coordinates = coordinatesMap.get(location.id);

    return {
      ...location,
      coordinates: coordinates || null,
    };
  });
}
