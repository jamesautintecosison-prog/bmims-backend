import "./utils/serialization.js";
import cors from "cors";
import express from "express";
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

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

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
