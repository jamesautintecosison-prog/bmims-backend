import cors from "cors";
import express from "express";
import { devContext } from "./middleware/devContext.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { residentsRouter } from "./modules/residents/residents.routes.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/residents", devContext, residentsRouter);

app.use(errorHandler);
