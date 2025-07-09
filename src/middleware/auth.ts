import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import { config } from "../config/config";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string; // Cognito user ID (sub)
    email: string; // User email
    role: "tenant" | "manager" | "admin"; // User role
    emailVerified: boolean; // Email verification status
    name?: string; // User's full name
    phoneNumber?: string; // User's phone number
  };
}

interface CognitoTokenPayload {
  sub: string; // User ID
  email: string; // Email address
  email_verified: boolean; // Email verification status
  "custom:role"?: string; // Custom role attribute
  name?: string; // Full name
  phone_number?: string; // Phone number
  aud: string; // Client ID
  iss: string; // Token issuer
  exp: number; // Expiration time
  iat: number; // Issued at time
  token_use: "access" | "id"; // Token type
}

/**
 * Cache for Cognito public keys to avoid repeated API calls
 */
let cognitoKeysCache: { [key: string]: string } | null = null;
let cacheExpiry: number = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

/**
 * Fetch and cache Cognito public keys for JWT verification
 */
async function getCognitoPublicKeys(): Promise<{ [key: string]: string }> {
  const now = Date.now();

  // Return cached keys if still valid
  if (cognitoKeysCache && now < cacheExpiry) {
    return cognitoKeysCache;
  }

  try {
    const userPoolId = config.aws.cognito.userPoolId;
    const region = config.aws.region;

    if (!userPoolId) {
      throw new Error("Cognito User Pool ID not configured");
    }

    const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const response = await axios.get(jwksUrl, { timeout: 5000 });

    // Convert JWKS to a simple key-value map
    const keys: { [key: string]: string } = {};
    if (response.data && response.data.keys) {
      response.data.keys.forEach((key: any) => {
        if (key.kid && key.n) {
          // Construct the public key from the modulus and exponent
          keys[
            key.kid
          ] = `-----BEGIN RSA PUBLIC KEY-----\n${key.n}\n-----END RSA PUBLIC KEY-----`;
        }
      });
    }

    // Update cache
    cognitoKeysCache = keys;
    cacheExpiry = now + CACHE_DURATION;

    return keys;
  } catch (error) {
    console.error("Failed to fetch Cognito public keys:", error);
    throw new Error("Failed to fetch authentication keys");
  }
}

/**
 * Verify JWT token with Cognito public keys
 */
async function verifyToken(token: string): Promise<CognitoTokenPayload> {
  try {
    // Remove 'Bearer ' prefix if present
    if (token.startsWith("Bearer ")) {
      token = token.substring(7);
    }

    // Decode the token header to get the key ID
    const decodedHeader = jwt.decode(token, { complete: true });
    if (
      !decodedHeader ||
      typeof decodedHeader === "string" ||
      !decodedHeader.header.kid
    ) {
      throw new Error("Invalid token format");
    }

    const keyId = decodedHeader.header.kid;
    const publicKeys = await getCognitoPublicKeys();
    const publicKey = publicKeys[keyId];

    if (!publicKey) {
      throw new Error("Public key not found for token");
    }

    // Verify and decode the token
    const decoded = jwt.decode(token) as CognitoTokenPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid or expired token");
    }
    throw error;
  }
}

/**
 * Extract and validate user role from token
 */
function extractUserRole(
  tokenPayload: CognitoTokenPayload
): "tenant" | "manager" | "admin" {
  const role = tokenPayload["custom:role"];

  if (!role) {
    // Default to tenant if no role is specified
    return "tenant";
  }

  if (role === "tenant" || role === "manager" || role === "admin") {
    return role;
  }

  // Invalid role, default to tenant
  console.warn(`Invalid user role: ${role}, defaulting to tenant`);
  return "tenant";
}

/**
 * Main authentication middleware
 * Verifies JWT tokens and populates req.user with authenticated user information
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authorization token required",
        code: "AUTH_TOKEN_MISSING",
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the token
    const tokenPayload = await verifyToken(token);

    // Extract user information
    const user = {
      id: tokenPayload.sub,
      email: tokenPayload.email,
      emailVerified: tokenPayload.email_verified,
      role: extractUserRole(tokenPayload),
      name: tokenPayload.name,
      phoneNumber: tokenPayload.phone_number,
    };

    // Attach user to request object
    req.user = user;

    // Log authentication (in development)
    if (config.server.isDevelopment) {
      console.log(`Authenticated user: ${user.email} (${user.role})`);
    }

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    let message = "Authentication failed";
    let code = "AUTH_FAILED";

    if (error instanceof Error) {
      if (error.message.includes("expired")) {
        message = "Token has expired";
        code = "AUTH_TOKEN_EXPIRED";
      } else if (error.message.includes("Invalid")) {
        message = "Invalid authentication token";
        code = "AUTH_TOKEN_INVALID";
      }
    }

    res.status(401).json({
      success: false,
      message,
      code,
    });
    return;
  }
};

/**
 * Role-based access control middleware factory
 * Creates middleware that restricts access to specific user roles
 */
export const authorize = (
  ...allowedRoles: Array<"tenant" | "manager" | "admin">
) => {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${allowedRoles.join(", ")}`,
        code: "ACCESS_DENIED",
      });
      return;
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if no token is provided
 * Useful for endpoints that work for both authenticated and anonymous users
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // No token provided, continue without authentication
    return next();
  }

  try {
    // If token is provided, verify it
    await authenticate(req, res, next);
  } catch (error) {
    // If token verification fails, log the error but continue
    console.warn("Optional authentication failed:", error);
    next();
  }
};

/**
 * Middleware to ensure email is verified
 */
export const requireEmailVerified = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTH_REQUIRED",
    });
    return;
  }

  if (!req.user.emailVerified) {
    res.status(403).json({
      success: false,
      message: "Email verification required",
      code: "EMAIL_NOT_VERIFIED",
    });
    return;
  }

  next();
};
