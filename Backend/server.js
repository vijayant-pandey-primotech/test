import express from "express";
import dotenv from "dotenv";
import sequelize from "./config/db.js";
import adminRoutes from "./authRoutes/adminRoutes.js";
import assistanceTopicsRoutes from "./authRoutes/assistanceTopicsRoutes.js";
import platformsRoute from "./authRoutes/platformsRoute.js";
import widgetsRoutes from "./authRoutes/widgetsRoutes.js";
import contextConfigRoutes from "./authRoutes/contextConfigRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import cluster from "cluster";
import os from "os";
import Logger from "./logger/logger.js"; 
import morganMiddleware, { logRequestDetails } from "./logger/morgan.js";


dotenv.config(); 

// Determine the number of CPU cores 
const numCPUs = os.cpus().length; 
 
 
if (cluster.isPrimary) {
  Logger.info(`Master process ${process.pid} is running`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Restart workers if they die
  cluster.on("exit", (worker, code, signal) => {
    Logger.info(`Worker ${worker.process.pid} died, starting a new worker...`);
    cluster.fork();
  });
} else {
  // If it's not the master process, it's a worker process and should run the server
  const app = express();

  const __filname = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filname);

  app.use(cors());
  app.use(express.json());
  app.use(morganMiddleware);
  app.use(logRequestDetails);
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  app.use(express.static(path.join(__dirname, "public")));

  // Database connection
  sequelize
    .authenticate()
    .then(() => {
      Logger.info("Database connected successfully");
    })
    .catch((err) => {
      console.error("Unable to connect to the database:", err);
    });

  app.use("/api/admin", adminRoutes);
  app.use("/api/assistance-topics", assistanceTopicsRoutes);
  app.use("/api/platforms", platformsRoute);
  app.use("/api/admin/", widgetsRoutes);
  app.use("/api/admin", contextConfigRoutes);

  app.get("/data", async (req, res) => {
      res.send("Auth server running on worker " + process.pid);
  });

  //========== Routes ends ===========//
const PORT = process.env.PORT
  // Start server
  app.listen(PORT, () => {
    Logger.info(
      `Worker ${process.pid} started and listening on port ${PORT}`
    );
  });
}  

   