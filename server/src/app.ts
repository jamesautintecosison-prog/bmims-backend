import "./utils/serialization.js";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { authenticate } from "./middleware/authenticate.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { auditLogsRouter } from "./modules/auditLogs/auditLogs.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { budgetsRouter } from "./modules/budgets/budgets.routes.js";
import { expensesRouter } from "./modules/expenses/expenses.routes.js";
import { incidentsRouter } from "./modules/incidents/incidents.routes.js";
import { residentsRouter } from "./modules/residents/residents.routes.js";
import { serviceRequestsRouter } from "./modules/serviceRequests/serviceRequests.routes.js";
import { createCrudRouter } from "./modules/shared/crud.js";
import { enrollments, staffAssignments } from "./modules/shared/membershipData.js";
import {
  committees,
  documentTypes,
  healthPrograms,
  households,
  staff,
} from "./modules/shared/referenceData.js";

export const app = express();

// Behind a host's reverse proxy, trust its forwarded address (set TRUST_PROXY=1)
app.set("trust proxy", env.trustProxy);

// Standard security headers (also removes the X-Powered-By header)
app.use(helmet());

// Only the configured front-end address(es) may call the API from a browser
app.use(cors({ origin: env.clientOrigins }));
app.use(express.json({ limit: "100kb" }));

// General limit per visitor, and a strict one for failed logins
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // only failed attempts count
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many failed login attempts. Try again in 15 minutes." },
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRouter);

// Everything below requires a valid login token
app.use("/api/residents", authenticate, residentsRouter);
app.use("/api/households", authenticate, createCrudRouter(households));
app.use("/api/staff", authenticate, createCrudRouter(staff));
app.use("/api/committees", authenticate, createCrudRouter(committees));
app.use("/api/document-types", authenticate, createCrudRouter(documentTypes));
app.use("/api/health-programs", authenticate, createCrudRouter(healthPrograms));
app.use("/api/enrollments", authenticate, createCrudRouter(enrollments));
app.use("/api/staff-assignments", authenticate, createCrudRouter(staffAssignments));

app.use("/api/service-requests", authenticate, serviceRequestsRouter);
app.use("/api/incidents", authenticate, incidentsRouter);
app.use("/api/expenses", authenticate, expensesRouter);
app.use("/api/budgets", authenticate, budgetsRouter);
app.use("/api/audit-logs", authenticate, auditLogsRouter);

app.use(errorHandler);
