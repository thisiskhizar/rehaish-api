import http from "http";
import app from "./app";
import { config, validateConfig } from "./config/config";
import { databaseService } from "./services/database";

async function startServer(): Promise<void> {
  try {
    console.log("Validating configuration...");
    validateConfig();

    console.log("Starting Rehaish Server...");
    await databaseService.connect();

    // Create HTTP server
    const server = http.createServer(app);

    // Start listening
    server.listen(config.server.port, () => {
      console.log(
        `Server running on port ${config.server.port} in ${config.server.nodeEnv} mode`
      );
      console.log(
        `Database: ${
          databaseService.isHealthy() ? "Connected" : "Disconnected"
        }`
      );
    });

    // Handle server errors
    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.syscall !== "listen") {
        throw error;
      }

      const bind =
        typeof config.server.port === "string"
          ? "Pipe " + config.server.port
          : "Port " + config.server.port;

      switch (error.code) {
        case "EACCES":
          console.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case "EADDRINUSE":
          console.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();
