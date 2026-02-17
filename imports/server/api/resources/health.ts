import { MongoInternals } from "meteor/mongo";
import express from "express";
import Logger from "../../../Logger";
import expressAsyncWrapper from "../../expressAsyncWrapper";

const health = express.Router();

health.get(
  "/",
  expressAsyncWrapper(async (_req, res) => {
    try {
      await MongoInternals.defaultRemoteCollectionDriver().mongo.db.command({
        ping: 1,
      });
      res.status(200).json({ status: "success" });
    } catch (error) {
      Logger.error("Health check failed", { error });
      res.status(500).json({ status: "error" });
    }
  }),
);

export default health;
