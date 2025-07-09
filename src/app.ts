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

const app = express();

/* MIDDLEWARES */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(logger);

/* API ROUTES */

/* NOT FOUND HANDLER */
app.use(notFoundHandler);

/* ERROR HANDLER */
app.use(errorHandler);

export default app;
