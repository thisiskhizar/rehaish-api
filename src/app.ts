import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

/* MIDDLEWARE IMPORT */
import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";

/* SERVICE IMPORTS */
import { databaseService } from "./services/database";

/* ROUTE IMPORTS */
import authRoutes from "./routes/authRoutes";
import propertyRoutes from "./routes/propertyRoutes";
import locationRoutes from "./routes/locationRoutes";
import tenantRoutes from "./routes/tenantRoutes";
import managerRoutes from "./routes/managerRoutes";
import applicationRoutes from "./routes/applicationRoutes";
import leaseRoutes from "./routes/leaseRoutes";
import paymentRoutes from "./routes/paymentRoutes";

const app = express();

/* MIDDLEWARES */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(logger);

/* HEALTH CHECK ROUTE */
app.get("/health", async (req, res) => {
  try {
    const dbHealthy = await databaseService.healthCheck();

    const healthStatus = {
      status: dbHealthy ? "success" : "degraded",
      message: dbHealthy
        ? "API is running normally"
        : "API is running but database is unhealthy",
      version: "1.0.0",
      environment: process.env.NODE_ENV || "unknown",
      uptime: process.uptime(), // seconds since server started
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbHealthy ? "healthy" : "unhealthy",
          connected: databaseService.isHealthy(),
        },
        api: {
          status: "healthy",
        },
      },
    };

    // Return 503 if any critical service is down
    const statusCode = dbHealthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      status: "error",
      message: "Health check failed",
      timestamp: new Date().toISOString(),
      error: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
});

/* API ROUTES */
app.use("/auth", authRoutes);
app.use("/properties", propertyRoutes);
app.use("/locations", locationRoutes);
app.use("/tenants", tenantRoutes);
app.use("/managers", managerRoutes);
app.use("/applications", applicationRoutes);
app.use("/", leaseRoutes);
app.use("/", paymentRoutes);

/* NOT FOUND HANDLER */
app.use(notFoundHandler);

/* ERROR HANDLER */
app.use(errorHandler);

export default app;
