// authMiddleware.ts
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { findStore, httpStatusResponse, verifyStore } from "./helper";

const secret = process.env.SESSION_SECRET || "";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  storeId?: string;
  isEmailVerified?: boolean;
}

export const checkIfUserIsAuthenticated = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, secret, async (err, decoded: any) => {
      if (err) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await verifyStore(decoded?.storeId, decoded?.userId);

      // isStoreActive(decoded?.storeId);

      req.userId = decoded.userId;
      req.userEmail = decoded.email;
      req.storeId = decoded.storeId;
      next();
    });
  } else {
    res
      .status(401)
      .json(
        httpStatusResponse(
          4400,
          "Unauthorize Request: Please Login In",
          undefined,
          "unauthorize"
        )
      );
  }
};

export const passUserIfAuthenticated = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, secret, (_, decoded: any) => {
      req.userId = decoded?.userId;
      req.userEmail = decoded?.userEmail;
      req.storeId = decoded?.storeId;
      next();
    });
  }
};

export const errorMiddleWare = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = { ...err };

  error.message = err.message;

  try {
    if (err.name === "CastError") {
      const message = "Resources not found.";
      error = new Error(message);
      error.statusCode = 404;
    }

    if (err.code === 11000) {
      const message = "Duplicate field value entered 11000";
      error = new Error(message);
      error.statusCode = 400;
    }

    if (err.name === "ValidationError") {
      const message = Object.values<any>(err.errors)
        .map((message) => message.message)
        .join(", ");

      error = new Error(message);
      error.statusCode = 400;
    }

    return res
      .status(error.errorCode || 500)
      .json(
        httpStatusResponse(
          error.errorCode || 500,
          error.message || "Something went wrong with our server"
        )
      );
  } catch (error) {
    next(error);
  }
};

export const allowActiveStore = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const store = await findStore(req.storeId, true, { isActive: 1 });

    if (!store.isActive) {
      return res
        .status(403)
        .json(httpStatusResponse(403, "Store is not active."));
    }
  } catch (error) {
    console.log(error);
  }
};
