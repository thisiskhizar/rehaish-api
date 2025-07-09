import { Router, Response } from "express";
import { authenticate, optionalAuth } from "../middleware/auth";
import {
  authStatus,
  exchangeToken,
  getCurrentUser,
} from "../controllers/authController";

const router = Router();

router.post("/exchange", authenticate, exchangeToken);
router.get("/me", authenticate, getCurrentUser);
router.get("/status", optionalAuth, authStatus);

export default router;
