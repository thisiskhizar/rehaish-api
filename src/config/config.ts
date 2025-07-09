import dotenv from "dotenv";

dotenv.config();

// Helper function to validate required environment variables
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

// Helper function to parse boolean environment variables
function parseBool(
  value: string | undefined,
  defaultValue: boolean = false
): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

// Helper function to parse integer environment variables
function parseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

// Helper function to parse array from comma-separated string
function parseArray(
  value: string | undefined,
  defaultValue: string[] = []
): string[] {
  if (!value) return defaultValue;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  server: {
    port: parseInt(process.env.PORT, 5000),
    nodeEnv: process.env.NODE_ENV || "development",
    isDevelopment: process.env.NODE_ENV === "development",
    isProduction: process.env.NODE_ENV === "production",
    isTest: process.env.NODE_ENV === "test",
  },

  database: {
    url: process.env.DATABASE_URL,
    logLevel: process.env.NODE_ENV === "development" ? "info" : "error",
  },

  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",

    // S3 Configuration
    s3: {
      bucketName: process.env.AWS_S3_BUCKET_NAME || "",
      region:
        process.env.AWS_S3_REGION || process.env.AWS_REGION || "us-east-1",
    },

    // Cognito Configuration
    cognito: {
      userPoolId: process.env.AWS_COGNITO_USER_POOL_ID || "",
      clientId: process.env.AWS_COGNITO_CLIENT_ID || "",
      domain: process.env.AWS_COGNITO_DOMAIN || "",
    },

    // SES Configuration (for email notifications)
    ses: {
      region:
        process.env.AWS_SES_REGION || process.env.AWS_REGION || "us-east-1",
      fromEmail: process.env.FROM_EMAIL || "noreply@rehaish.com",
    },
  },

  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  },

  cors: {
    origins: parseArray(process.env.CORS_ORIGINS, [
      "http://localhost:3000",
      "http://localhost:3001",
    ]),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 15) * 60 * 1000, // Convert minutes to milliseconds
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10485760), // 10MB default
    allowedImageTypes: parseArray(process.env.ALLOWED_IMAGE_TYPES, [
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
    maxImages: parseInt(process.env.MAX_IMAGES_PER_PROPERTY, 10),
  },

  payments: {
    jazzCash: {
      merchantId: process.env.JAZZCASH_MERCHANT_ID || "",
      password: process.env.JAZZCASH_PASSWORD || "",
      salt: process.env.JAZZCASH_SALT || "",
    },
    easyPay: {
      storeId: process.env.EASYPAY_STORE_ID || "",
      password: process.env.EASYPAY_PASSWORD || "",
    },
  },

  external: {
    googleMaps: {
      apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    },
  },

  security: {
    sessionSecret: process.env.SESSION_SECRET || "",
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 12),
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    debugMode: parseBool(process.env.DEBUG_MODE, false),
  },

  development: {
    enableSeedData: parseBool(process.env.ENABLE_SEED_DATA, true),
    enableSwagger: parseBool(process.env.ENABLE_SWAGGER, true),
  },
};

/**
 * Validate critical configuration values
 * This ensures the application won't start with missing required config
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // In production, these are required
  if (config.server.isProduction) {
    if (!process.env.DATABASE_URL) {
      errors.push("DATABASE_URL is required in production");
    }

    if (config.jwt.secret === "") {
      errors.push("JWT_SECRET must be set in production");
    }

    if (config.security.sessionSecret === "") {
      errors.push("SESSION_SECRET must be set in production");
    }

    if (!config.aws.cognito.userPoolId) {
      errors.push("AWS_COGNITO_USER_POOL_ID is required in production");
    }

    if (!config.aws.cognito.clientId) {
      errors.push("AWS_COGNITO_CLIENT_ID is required in production");
    }
  }

  if (errors.length > 0) {
    console.error("Configuration validation failed:");
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log("Configuration validation passed");
}

export const port = config.server.port;
export const nodeEnv = config.server.nodeEnv;
