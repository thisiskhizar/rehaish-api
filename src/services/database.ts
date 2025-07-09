import { PrismaClient } from "@prisma/client";

/**
 * Database Service
 *
 * Manages the Prisma client connection lifecycle with proper error handling,
 * connection pooling, and graceful shutdown capabilities.
 *
 * Features:
 * - Singleton pattern for efficient connection management
 * - Automatic reconnection on connection failures
 * - Graceful shutdown handling
 * - Environment-specific logging
 * - Connection health monitoring
 */
class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000; // 1 second

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of DatabaseService
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize the Prisma client with proper configuration
   */
  public async connect(): Promise<void> {
    try {
      if (this.prisma) {
        console.log("Database already connected");
        return;
      }

      console.log("Initializing database connection...");

      this.prisma = new PrismaClient({
        log: this.getLogLevel(),
        errorFormat: "pretty",
      });

      // Test the connection
      await this.prisma.$connect();
      await this.healthCheck();

      this.isConnected = true;
      this.reconnectAttempts = 0;

      console.log("Database connected successfully");

      // Set up graceful shutdown handlers
      this.setupShutdownHandlers();
    } catch (error) {
      console.error("Failed to connect to database:", error);
      await this.handleConnectionError(error);
    }
  }

  /**
   * Get the Prisma client instance
   */
  public getClient(): PrismaClient {
    if (!this.prisma || !this.isConnected) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.prisma;
  }

  /**
   * Check if database is connected and healthy
   */
  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.prisma) {
        return false;
      }

      // Simple query to test connection
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  }

  /**
   * Gracefully disconnect from the database
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.prisma) {
        console.log("Disconnecting from database...");
        await this.prisma.$disconnect();
        this.prisma = null;
        this.isConnected = false;
        console.log("Database disconnected successfully");
      }
    } catch (error) {
      console.error("Error during database disconnection:", error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  public isHealthy(): boolean {
    return this.isConnected && this.prisma !== null;
  }

  /**
   * Handle connection errors with retry logic
   */
  private async handleConnectionError(error: any): Promise<void> {
    this.isConnected = false;
    this.reconnectAttempts++;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts)
      );

      try {
        await this.connect();
      } catch (retryError) {
        console.error(
          `Reconnection attempt ${this.reconnectAttempts} failed:`,
          retryError
        );
      }
    } else {
      console.error(
        "Max reconnection attempts reached. Database connection failed."
      );
      throw error;
    }
  }

  /**
   * Get appropriate log level based on environment
   */
  private getLogLevel(): ("query" | "info" | "warn" | "error")[] {
    const env = process.env.NODE_ENV || "development";

    switch (env) {
      case "development":
        return ["query", "info", "warn", "error"];
      case "test":
        return ["error"];
      case "production":
        return ["error"];
      default:
        return ["error"];
    }
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}. Shutting down gracefully...`);
      try {
        await this.disconnect();
        process.exit(0);
      } catch (error) {
        console.error("Error during graceful shutdown:", error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGUSR2", () => shutdown("SIGUSR2")); // nodemon restart
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();

// Export types for use in other modules
export type { PrismaClient } from "@prisma/client";
