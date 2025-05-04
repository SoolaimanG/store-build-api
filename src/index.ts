import express from "express";
import cors from "cors";
import compression from "compression";
import bodyParser from "body-parser";
import session from "express-session";
import dotenv from "dotenv";
import router from "./router";
import { connectDB } from "./helper";
import { errorMiddleWare } from "./middle-ware";

dotenv.config();

const storeBuild = express();
const secret = process.env.SESSION_SECRET as string;
const port = process.env.PORT || 8080;

storeBuild.use(cors({ credentials: true }));
storeBuild.use(compression());
storeBuild.use(bodyParser.json());
storeBuild.use(session({ secret, saveUninitialized: true, resave: false }));

storeBuild.use(errorMiddleWare);

// Routing
storeBuild.use("/api/v1", router());

//connectDB()
//  .then(() => {
//    console.log("BD connected");
//  })
//  .catch(() => {
//    console.log("DB failed to connect");
//  });

storeBuild.listen(port, async () => {
  await connectDB();
  console.log(`Starting server on ${process.env.DOMAIN}`);
});

//module.exports = storeBuild;
