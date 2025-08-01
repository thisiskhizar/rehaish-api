/**
 * Helper function for permissions (duplicated from controller for route usage)
 */
export function getPermissions(role: string): string[] {
  const basePermissions = ["read:profile", "update:profile"];

  switch (role) {
    case "tenant":
      return [
        ...basePermissions,
        "read:properties",
        "create:applications",
        "read:applications",
        "read:leases",
        "create:payments",
        "read:payments",
        "create:reviews",
        "manage:favorites",
      ];

    case "manager":
      return [
        ...basePermissions,
        "create:properties",
        "read:properties",
        "update:properties",
        "delete:properties",
        "read:applications",
        "update:applications",
        "create:leases",
        "read:leases",
        "update:leases",
        "read:payments",
        "update:payments",
        "read:reviews",
      ];

    case "admin":
      return [
        ...basePermissions,
        "read:all",
        "create:all",
        "update:all",
        "delete:all",
        "manage:users",
        "manage:moderation",
      ];

    default:
      return basePermissions;
  }
}

/**
 * Generate property slug from title
 */
export function generatePropertySlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .trim();
}
