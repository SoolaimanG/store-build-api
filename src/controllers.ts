import { Request, Response } from "express";
import {
  _createProduct,
  _editOrder,
  _editProduct,
  _editStore,
  _verifyTransaction,
  addToNewsLetter,
  calculateMetrics,
  calculatePercentageChange,
  calculateProductReviewStats,
  calculateTotalAmount,
  createCharge,
  createOrderQuery,
  findOrder,
  findStore,
  findUser,
  formatAmountToNaira,
  generateToken,
  getOrderStats,
  getSalesData,
  handleIntegrationConnection,
  handleReferralLogic,
  httpStatusResponse,
  maskAccountNumber,
  sendEmail,
  sendQuickEmail,
  StoreBuildAI,
  validateIconExistance,
  validateSignUpInput,
  verifyIntegration,
  verifyStore,
} from "./helper";
import {
  AddressModel,
  CategoryModel,
  Coupon,
  DedicatedAccountModel,
  IntegrationModel,
  OrderModel,
  ProductModel,
  ProductTypesModel,
  RatingModel,
  ReferralModel,
  StoreBankAccountModel,
  StoreModel,
  StoreSttings,
  TransactionModel,
  TutorialModel,
  UserModel,
} from "./models";
import {
  Customer,
  CustomerStats,
  GetCustomersQuery,
  getProductFilters,
  ICheckFor,
  ICoupon,
  ICustomer,
  ICustomerAddress,
  IOrder,
  IOrderProduct,
  IOrderStatus,
  IProduct,
  IRating,
  IStore,
  ITutorial,
  SignUpBody,
  TransactionRequest,
} from "./types";
import { AuthenticatedRequest } from "./middle-ware";
import { addDays, format, isAfter } from "date-fns";
import { PipelineStage } from "mongoose";
import { EmailType, generateEmail } from "./emails";
import { quickEmails, referralPipeLine, themes } from "./constant";
import ExcelJS from "exceljs";
import {
  Account,
  Order,
  PaymentService,
  Product,
  restrictPropertyModification,
  SendBox,
  Store,
} from "./server-utils";

export const joinNewsLetter = async (req: Request, res: Response) => {
  try {
    const { email, joinedFrom } = req.body;

    await addToNewsLetter(email, joinedFrom);

    return res
      .status(200)
      .json(
        httpStatusResponse(200, "Thank you for subcribing to our newsletter!")
      );
  } catch (error) {
    console.log(error);
    const _error = error as Error;
    return res.status(500).json(httpStatusResponse(500, _error.message));
  }
};

export const getProductTypes = async (_: Request, res: Response) => {
  try {
    const productTypes = await ProductTypesModel.find();
    return res
      .status(200)
      .json(httpStatusResponse(200, undefined, productTypes));
  } catch (error) {
    const _error = error as Error;
    return res.status(500).json(httpStatusResponse(500, _error.message));
  }
};

export const signUp = async (req: Request, res: Response) => {
  const store = new Store();

  try {
    const { email, storeName, fullName, referralCode, productType } =
      req.body as SignUpBody;

    await store.startSession();

    // Validate input
    const validationError = validateSignUpInput(req.body);

    // If the validation fails throw an error
    if (validationError) {
      return res.status(400).json(httpStatusResponse(400, validationError));
    }

    const user = await store.createAccount({ email, fullName });

    await store.createStore({ owner: user._id, productType, storeName });

    await handleReferralLogic(referralCode, user._id as string);

    await store.commitSession();

    // Send OTP and generate token concurrently
    const [_, token] = await Promise.all([
      store.sendOTP({ tokenFor: "verify-email", email: user.email }),
      generateToken(user._id as string, user.email, store.store._id),
    ]);

    // Respond to client
    return res
      .status(200)
      .json(
        httpStatusResponse(200, "Account Created Successfully", { user, token })
      );
  } catch (error) {
    await store.cancelSession();
    const _error = error as Error;
    return res.status(500).json(httpStatusResponse(500, _error.message));
  }
};

export const doesEmailOrStoreExist = async (req: Request, res: Response) => {
  try {
    const {
      storeName,
      email,
      checkFor = "email",
    } = req.query as unknown as {
      storeName: string;
      email: string;
      checkFor: ICheckFor;
    };

    if (checkFor === "email") {
      const user = await findUser({ email }, false);
      return res.status(200).json(
        httpStatusResponse(200, "User is found on our database.", {
          isExisting: !!user,
        })
      );
    }

    if (checkFor === "storeName") {
      const store = await findStore({ storeName }, false, { storeName: 1 });
      return res
        .status(200)
        .json(httpStatusResponse(200, undefined, { isExisting: !!store }));
    }

    return res.status(400).json(httpStatusResponse(400));
  } catch (error) {
    const _error = error as Error;
    return res.status(500).json(httpStatusResponse(500, _error.message));
  }
};

export const verifyAccountNumber = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { bankCode, accountNumber } = req.query as undefined as {
      bankCode: string;
      accountNumber: string;
    };

    const provider = new PaymentService(req.storeId);

    const data = await provider.verifyBank(accountNumber, bankCode);

    return res.status(200).json(httpStatusResponse(200, undefined, data));
  } catch (error) {
    const err = error as Error;
    console.log(err);
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const welcomeHome = async (req: Request, res: Response) => {
  return res
    .status(200)
    .json(httpStatusResponse(200, "Welcome to Store Build"));
};

export const verifyToken = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { otp, email } = req.body;
    const { userEmail } = req;

    const account = new Account();

    const message = await account.verifyOTP({
      token: otp,
      email: userEmail ?? email,
    });

    return res
      .status(200)
      .json(httpStatusResponse(200, message, { token: message }));
  } catch (error) {
    const _error = error as Error;
    return res.status(500).json(httpStatusResponse(500, _error.message));
  }
};

export const sendOTP = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenFor, email, storeName } = req.body;

    const account = new Account();

    await account.sendOTP({ email, tokenFor, storeName });

    return res
      .status(200)
      .json(httpStatusResponse(200, "OTP sent to the email provided"));
  } catch (error) {
    const _error = error as Error;
    return res.status(500).json(httpStatusResponse(500, _error.message));
  }
};

export const getUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;

    const user = await UserModel.findById(userId);

    const store = await StoreModel.findOne(
      { owner: user.id },
      {
        storeName: 1,
        productType: 1,
        isActive: 1,
        paymentDetails: 1,
        storeCode: 1,
        balance: 1,
      }
    ).select("+balance");

    return res.status(200).json(
      httpStatusResponse(200, "User retrieved successfully", {
        ...user.toObject(),
        ...{ storeId: store.id, ...store.toObject() },
      })
    );
  } catch (error) {
    const _error = error as Error;
    return res.status(500).json(httpStatusResponse(500, _error.message));
  }
};

export const getDashboardContent = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId, query } = req;
    const { timeFrame = "all" } = query as unknown as {
      timeFrame: "all" | "30d" | "7d";
    };

    const data = await calculateMetrics(timeFrame, storeId);

    return res.status(200).json(httpStatusResponse(200, undefined, data));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId } = req;
    const {
      q,
      page = "1",
      limit = "10",
      asc,
      filter: _filter = "All",
      startDate,
      endDate,
      sort = "",
    } = req.query as {
      q?: string;
      page?: string;
      limit?: string;
      asc?: string;
      filter?: "All" | "Pending" | "Completed" | "Cancelled" | "Refunded";
      startDate?: string;
      endDate?: string;
      sort?: string;
    };

    // Convert pagination params to numbers
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit))); // Limit maximum items per page
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter: any = { storeId };

    if (_filter && _filter !== "All") {
      filter.orderStatus = _filter;
    }

    if (q) {
      filter.$or = createOrderQuery(q);
    }

    // Handle date filtering
    const parsedStartDate = startDate ? new Date(startDate) : null;
    const parsedEndDate = endDate ? new Date(endDate) : new Date();

    if (parsedStartDate && parsedEndDate && parsedStartDate <= parsedEndDate) {
      filter.createdAt = { $gte: parsedStartDate, $lte: parsedEndDate };
    }

    // Build sort options
    const sortOptions: any = {};
    const sortParams = sort
      .split(",")
      .filter(Boolean)
      .map((s) => s.trim());

    sortParams.forEach((param) => {
      switch (param) {
        case "recent-orders":
          sortOptions.createdAt = -1;
          break;
        case "more-products":
          sortOptions.productCount = -1;
          break;
        case "highest-orders":
          sortOptions.totalAmount = -1;
          break;
        case "lowest-orders":
          sortOptions.totalAmount = 1;
          break;
      }
    });

    // If no sort options are specified, use the default sort
    if (Object.keys(sortOptions).length === 0) {
      sortOptions.createdAt = asc === "true" ? 1 : -1;
    }

    // Execute queries in parallel for better performance
    const [orders, statusCounts, totalCount] = await Promise.all([
      OrderModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(), // Use lean() for better performance when you don't need Mongoose document methods

      // Get counts by status (optimized to only return necessary fields)
      OrderModel.aggregate([
        { $match: { storeId } },
        {
          $group: {
            _id: "$orderStatus",
            count: { $sum: 1 },
          },
        },
      ]),

      // Get total count for pagination
      OrderModel.countDocuments(filter),
    ]);

    // Process status counts
    const orderStatusCount = statusCounts.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {} as Record<string, number>);

    // Calculate total for "All" status
    orderStatusCount["All"] = Object.values(orderStatusCount).reduce(
      (sum: number, count: number) => sum + count,
      0
    );

    // Build pagination metadata
    const totalPages = Math.ceil(totalCount / limitNum);
    const pagination = {
      page: pageNum,
      limit: limitNum,
      totalItems: totalCount,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    };

    return res.status(200).json(
      httpStatusResponse(200, "Orders retrieved successfully", {
        orders,
        orderStatusCount,
        pagination,
      })
    );
  } catch (error) {
    const err = error as Error;
    console.error("Error retrieving orders:", err);
    return res
      .status(500)
      .json(
        httpStatusResponse(
          500,
          err.message || "An error occurred while retrieving orders"
        )
      );
  }
};

export const getProducts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId: sId, query, userId } = req;
    const { storeId: _sId, ...filters } = query as unknown as getProductFilters;

    const storeId = _sId || sId;

    const products = new Product(storeId, userId);

    const resp = await products.getProducts(
      { ...filters, storeId },
      Boolean(sId)
    );

    const response = httpStatusResponse(200, undefined, resp);

    return res.status(200).json(response);
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const deleteProduct = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { productId } = req.params;

    // Verify that the store and user are valid
    await verifyStore(req.storeId, req.userId);

    // Delete the product by productId
    const deletedProduct = await ProductModel.findOneAndDelete({
      _id: productId,
      storeId: req.storeId, // Ensure the product belongs to the store
    });

    if (!deletedProduct) {
      return res
        .status(404)
        .json(
          httpStatusResponse(
            404,
            "Product not found or does not belong to this store"
          )
        );
    }

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          `Product with the ID of ${productId} has been deleted successfully. Thank you!`
        )
      );
  } catch (error) {
    const err = error as Error;
    console.error(err);
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getProductAnalytics = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;
    const { productId } = req.params;

    // Fetch the product
    const product = await ProductModel.findById(productId);

    if (!product) {
      return res.status(404).json(httpStatusResponse(404, "Product not found"));
    }

    // Fetch orders containing this product
    const orders = await OrderModel.find({
      storeId,
      "products._id": productId,
    });

    // Group data by month
    const monthlyData: {
      [key: string]: { sales: number; revenue: number; returns: number };
    } = {};

    orders.forEach((order) => {
      const orderMonth = format(new Date(order.createdAt), "MMM");

      const productInOrder = order.products.find(
        (p) => p._id.toString() === productId
      );

      if (productInOrder) {
        const sales = productInOrder.stockQuantity;
        const revenue =
          productInOrder.stockQuantity * productInOrder.price.default;
        const returns =
          order.orderStatus === "Cancelled" ? productInOrder.stockQuantity : 0;

        if (!monthlyData[orderMonth]) {
          monthlyData[orderMonth] = { sales: 0, revenue: 0, returns: 0 };
        }

        monthlyData[orderMonth].sales += sales;
        monthlyData[orderMonth].revenue += revenue;
        monthlyData[orderMonth].returns += returns;
      }
    });

    // Format the data for response
    const saleData = Object.keys(monthlyData).map((month) => ({
      month,
      ...monthlyData[month],
    }));

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Monthly product analytics retrieved successfully",
          saleData
        )
      );
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const createOrEditProduct = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { body, storeId, userId } = req;
    let product = body as IProduct;

    // Check for existing product in a single query
    const existingProduct = await ProductModel.findById(product._id);

    const p = new Product(storeId, userId);

    p.setProduct = product;

    await p.canUserAddMoreProducts();

    await p.validateProduct();

    if (existingProduct) {
      await p.editProduct();
    } else {
      await p.addProduct();
    }

    const message = existingProduct
      ? "Product updated successfully"
      : "Product created";

    return res.status(200).json(httpStatusResponse(200, message, product));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const calculateProductPrice = async (req: Request, res: Response) => {
  try {
    const { cartItems, couponCode } = req.body as {
      cartItems: { productId: string; color?: string; size?: string }[];
      couponCode?: string;
    };

    const price = await calculateTotalAmount(cartItems, couponCode);

    return res
      .status(200)
      .json(httpStatusResponse(200, "Products price calculated", price));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const _calculateDeliveryCost = async (req: Request, res: Response) => {
  try {
    const {
      products: orderProducts,
      address,
      email,
      name,
      phoneNumber,
      couponCode,
    } = req.body as {
      products: IOrderProduct[];
      address: ICustomerAddress;
      email: string;
      name: string;
      phoneNumber: string;
      couponCode: string;
    };

    const customerDetails: ICustomer & { shippingDetails: ICustomerAddress } = {
      email,
      name,
      phoneNumber,
      shippingDetails: {
        ...address,
      },
    };

    //Restructing the products for the totalAmount calculations
    const products = orderProducts.map((cart) => ({
      productId: cart._id,
      color: cart.color,
      size: cart.size,
    }));

    const { storeId } = req.params;

    const order = new Order(storeId);

    const { totalAmount } = await order.calculateOrderAmount(
      products,
      couponCode
    );

    const sendBox = new SendBox(storeId);

    const shipmentResponse = await sendBox.calculateShippingCost(
      customerDetails,
      totalAmount,
      orderProducts
    );

    return res
      .status(200)
      .json(httpStatusResponse(200, undefined, shipmentResponse));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const createCategory = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { body, storeId } = req;

    validateIconExistance(body.icon); //This will validate the icon selected by the user.

    const category = await CategoryModel.create({
      ...body,
      storeId,
    });

    return res
      .status(200)
      .json(
        httpStatusResponse(200, "Category created successfully.", category)
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getCategories = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req.params;

    // First get all categories
    const categories = await CategoryModel.find({ storeId });

    // Get product counts for all categories in a single aggregation
    const productCounts = await ProductModel.aggregate([
      {
        $match: {
          storeId,
          isActive: true,
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    // Create a map of category to count for easier lookup
    const categoryCountMap = productCounts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {} as Record<string, number>);

    // Combine categories with their respective counts
    const categoriesWithCount = categories.map((category) => ({
      ...category.toObject(),
      productCount: categoryCountMap[category.slot] || 0,
    }));

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Categories fetched successfully",
          categoriesWithCount
        )
      );
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const editCategory = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { body, params } = req;

    validateIconExistance(body.icon);

    const category = await CategoryModel.findByIdAndUpdate(
      params.id,
      { $set: body },
      { new: true }
    ).lean();

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Your category has been editted successfully.",
          category
        )
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const deleteCategory = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { params, storeId } = req;

    const c = await CategoryModel.findOne({ _id: params.id, storeId });

    await c.deleteOne();
    await ProductModel.deleteMany({ storeId, category: c.name });

    return res
      .status(200)
      .json(
        httpStatusResponse(200, "Your category has been deleted successfully.")
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { order: orderData, couponCode } = req.body as {
      storeId: string;
      order: Partial<IOrder>;
      couponCode?: string;
    };
    const storeId = orderData?.storeId || req.storeId;

    const order = new Order(storeId);

    const newOrder = await order.createOrder({
      ...orderData,
      coupon: couponCode,
    });

    return res.status(200).json(httpStatusResponse(200, undefined, newOrder));
  } catch (error) {
    const err = error as Error;

    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const connectAndDisconnectIntegration = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const { integrationId } = req.body;
  const result = await handleIntegrationConnection(
    req.storeId,
    integrationId,
    true
  );

  return res
    .status(result.statusCode)
    .json(httpStatusResponse(result.statusCode, result.message));
};

export const getIntegrations = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;

    const integrations = await IntegrationModel.find({ storeId });

    return res
      .status(200)
      .json(httpStatusResponse(200, undefined, integrations));
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getIntegration = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId, params } = req;

    const integration = await IntegrationModel.findOne({
      storeId,
      "integration.name": params.integration,
    }).select("+integration.apiKeys");

    const hasApiKeys = Boolean(
      integration?.integration?.apiKeys?.["accessKey"] ||
        integration?.integration?.apiKeys?.["token"]
    );

    const { integration: { apiKeys, ...i } = {} } =
      integration?.toObject() || {};

    const INTEGRATION = {
      integration: { ...i },
      hasApiKeys,
    };

    return res.status(200).json(httpStatusResponse(200, "", INTEGRATION));
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const manageIntegration = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { integrationId, data } = req.body;

    verifyIntegration(integrationId);

    const integration = await IntegrationModel.findOneAndUpdate(
      { storeId: req.storeId, "integration.name": integrationId },
      {
        $set: {
          "integration.settings": data,
        },
      }
    );

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Your changes has been applied successfully.",
          integration
        )
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    const product = new Product();

    await product.getProduct(productId);

    const reviewStats = await calculateProductReviewStats(productId);

    return res.status(200).json(
      httpStatusResponse(200, undefined, {
        ...product.product,
        ...reviewStats,
      })
    );
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getProductWithIds = async (req: Request, res: Response) => {
  try {
    const { ids } = req.query;

    const idArray = Array.isArray(ids) ? ids : [ids];
    const products = await ProductModel.find({ _id: { $in: idArray } });
    return res.status(200).json(httpStatusResponse(200, "", products));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { phoneNumber } = req.query as unknown as { phoneNumber: string };

    if (!phoneNumber) {
      return res
        .status(400)
        .json(
          httpStatusResponse(
            400,
            "Phone Number is required to view order.",
            undefined,
            "numberIsRequired"
          )
        );
    }

    const orderService = new Order();

    const order = await orderService.getOrder(orderId, phoneNumber);

    const store = await orderService.getStore();

    const { phoneNumber: _phoneNumber, email } = await orderService.getUser(
      store.owner
    );

    return res.status(200).json(
      httpStatusResponse(200, "order fetched successfully", {
        order: order.toObject(),
        store: { ...store.toObject(), phoneNumber: _phoneNumber, email },
      })
    );
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getInvoice = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;

    const order = await OrderModel.findById(invoiceId, {
      customerDetails: 1,
      paymentDetails: 1,
      totalAmount: 1,
      products: 1,
      createdAt: 1,
      orderStatus: 1,
      storeId: 1,
      shippingDetails: 1,
    });

    if (!order) {
      return res
        .status(404)
        .json(
          httpStatusResponse(404, "Order not found", undefined, "notFound")
        );
    }

    const store = await findStore(order.storeId, true, {
      storeName: 1,
      _id: 1,
      storeCode: 1,
    });
    const storeOwner = await findUser(store.owner, true, { phoneNumber: 1 });

    const storeSettings = await StoreSttings.findOne(
      { storeId: store._id },
      { storeAddress: 1 }
    );

    const storeBank = await StoreBankAccountModel.findOne(
      { storeId: store._id },
      { bankName: 1, accountName: 1, accountNumber: 1 }
    );

    const _address = storeSettings.storeAddress.find(
      (address) => address.isDefault
    );

    const resp = {
      companyName: store.storeName,
      companyAddress: `${_address.country}, ${_address.state}, ${_address.city}, ${_address.postalCode}, ${_address.addressLine1}`,
      companyPhone: storeOwner.phoneNumber,
      orderNumber: order._id,
      invoiceId: order._id,
      dateIssued: order.createdAt,
      dateDue: addDays(new Date(order.createdAt), 10).toISOString(),
      customerName: order.customerDetails.name,
      customerPhone: order.customerDetails.phoneNumber,
      bankName: storeBank?.bankName.toUpperCase(),
      accountNumber: storeBank?.accountNumber,
      accountName: storeBank?.accountName.toUpperCase(),
      status: order.orderStatus,
      items: order.products,
      shippingDetails: order.shippingDetails,
      storeCode: store.storeCode,
      txRef: order.paymentDetails.tx_ref,
    };

    return res.status(200).json(httpStatusResponse(200, undefined, resp));
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getQuickEmails = async (
  _: AuthenticatedRequest,
  res: Response
) => {
  try {
    return res
      .status(200)
      .json(httpStatusResponse(200, undefined, quickEmails));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const _sendQuickEmail = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { orderId, phoneNumber } = req.body;

    const { emailId } = req.params;

    const orderService = new Order(req.storeId);

    const order = await orderService.getOrder(orderId, phoneNumber);

    if (!order) {
      return res
        .status(404)
        .json(
          httpStatusResponse(
            404,
            "Order with this ID does not exist on our database."
          )
        );
    }

    await sendQuickEmail(order, emailId, order.customerDetails.email);

    return res
      .status(200)
      .json(httpStatusResponse(200, "Email sent successfully"));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const editOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { updates, phoneNumber } = req.body;
    const { orderId } = req.params;

    const orderService = new Order(req.storeId);

    const newOrder = await orderService.editOrder(
      orderId,
      phoneNumber,
      updates,
      Boolean(req.userId && req.storeId)
    );

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "ORDER_EDITTED_SUCCESSFULLY: This order has now been editted",
          newOrder
        )
      );
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getCustomerStats = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const storeId = req.storeId;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );

    const pipeline: PipelineStage[] = [
      { $match: { storeId } },
      {
        $group: {
          _id: null,
          totalCustomers: { $addToSet: "$customerDetails.email" },
          customersThisMonth: {
            $addToSet: {
              $cond: [
                { $gte: ["$createdAt", firstDayOfMonth] },
                "$customerDetails.email",
                null,
              ],
            },
          },
          customersLastMonth: {
            $addToSet: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$createdAt", firstDayOfLastMonth] },
                    { $lt: ["$createdAt", firstDayOfMonth] },
                  ],
                },
                "$customerDetails.email",
                null,
              ],
            },
          },
          totalAmountSpent: { $sum: "$amountPaid" },
          totalOrders: { $sum: 1 },
          totalAmountSpentThisMonth: {
            $sum: {
              $cond: [
                { $gte: ["$createdAt", firstDayOfMonth] },
                "$amountPaid",
                0,
              ],
            },
          },
          totalAmountSpentLastMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$createdAt", firstDayOfLastMonth] },
                    { $lt: ["$createdAt", firstDayOfMonth] },
                  ],
                },
                "$amountPaid",
                0,
              ],
            },
          },
          totalOrdersThisMonth: {
            $sum: { $cond: [{ $gte: ["$createdAt", firstDayOfMonth] }, 1, 0] },
          },
          totalOrdersLastMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$createdAt", firstDayOfLastMonth] },
                    { $lt: ["$createdAt", firstDayOfMonth] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalCustomers: { $size: "$totalCustomers" },
          customersThisMonth: {
            $size: {
              $filter: {
                input: "$customersThisMonth",
                as: "email",
                cond: { $ne: ["$$email", null] },
              },
            },
          },
          customersLastMonth: {
            $size: {
              $filter: {
                input: "$customersLastMonth",
                as: "email",
                cond: { $ne: ["$$email", null] },
              },
            },
          },
          totalAmountSpent: 1,
          totalOrders: 1,
          totalAmountSpentThisMonth: 1,
          totalAmountSpentLastMonth: 1,
          totalOrdersThisMonth: 1,
          totalOrdersLastMonth: 1,
        },
      },
    ];

    const stats = await OrderModel.aggregate(pipeline);

    const statsResult = stats[0] || {
      totalCustomers: 0,
      customersThisMonth: 0,
      customersLastMonth: 0,
      totalAmountSpent: 0,
      totalOrders: 0,
      totalAmountSpentThisMonth: 0,
      totalAmountSpentLastMonth: 0,
      totalOrdersThisMonth: 0,
      totalOrdersLastMonth: 0,
    };

    const averageOrderValue =
      statsResult.totalOrders > 0
        ? statsResult.totalAmountSpent / statsResult.totalOrders
        : 0;

    const averageOrderValueThisMonth =
      statsResult.totalOrdersThisMonth > 0
        ? statsResult.totalAmountSpentThisMonth /
          statsResult.totalOrdersThisMonth
        : 0;

    const averageOrderValueLastMonth =
      statsResult.totalOrdersLastMonth > 0
        ? statsResult.totalAmountSpentLastMonth /
          statsResult.totalOrdersLastMonth
        : 0;

    const customerStats: CustomerStats[] = [
      {
        label: "Total Customers",
        value: statsResult.totalCustomers,
        percentage: calculatePercentageChange(
          statsResult.totalCustomers,
          statsResult.totalCustomers - statsResult.customersThisMonth
        ),
      },
      {
        label: "Customers This Month",
        value: statsResult.customersThisMonth,
        percentage: calculatePercentageChange(
          statsResult.customersThisMonth,
          statsResult.customersLastMonth
        ),
      },
      {
        label: "Average Order Value",
        value: averageOrderValue,
        percentage: calculatePercentageChange(
          averageOrderValueThisMonth,
          averageOrderValueLastMonth
        ),
        formattedValue: formatAmountToNaira(averageOrderValue),
      },
    ];

    const response = { customerStats };

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Customer stats fetched successfully.",
          response
        )
      );
  } catch (error) {
    console.error("Error in getCustomerStats:", error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getCustomers = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const {
      search,
      sortBy = "recent",
      page = 1,
      limit = 10,
      filter,
    } = req.query as GetCustomersQuery;
    const { storeId } = req;

    const skip = (Number(page) - 1) * Number(limit);

    const matchStage: PipelineStage.Match = { $match: { storeId } };
    const searchStage: PipelineStage.Match | null = search
      ? {
          $match: {
            $or: [
              { "customerDetails.name": { $regex: search, $options: "i" } },
              { "customerDetails.email": { $regex: search, $options: "i" } },
            ],
          },
        }
      : null;

    const pipeline: PipelineStage[] = [
      matchStage,
      ...(searchStage ? [searchStage] : []),
      {
        $group: {
          _id: "$customerDetails.email",
          name: { $first: "$customerDetails.name" },
          email: { $first: "$customerDetails.email" },
          amountSpent: { $sum: "$amountPaid" },
          itemsBought: {
            $sum: {
              $cond: [
                { $eq: ["$orderStatus", "Completed"] },
                { $size: "$products" },
                0,
              ],
            },
          },
          lastPurchase: { $max: "$updatedAt" },
          orderCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: 1,
          email: 1,
          amountSpent: 1,
          itemsBought: 1,
          lastPurchase: 1,
          averageOrderValue: { $divide: ["$amountSpent", "$orderCount"] },
        },
      },
    ];

    // Define thirtyDaysAgo here
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Add filter stages based on the 'filter' parameter
    if (filter === "recent") {
      pipeline.push({
        $match: {
          lastPurchase: { $gte: thirtyDaysAgo },
        },
      });
    } else if (filter === "vip") {
      pipeline.push({
        $match: {
          $or: [
            { amountSpent: { $gte: 100000 } }, // Assuming VIP status for spending over 100,000 (adjust as needed)
            { orderCount: { $gte: 5 } }, // Or having made at least 5 orders
          ],
        },
      });
    }

    // Add sorting stage
    let sortStage: PipelineStage.Sort = { $sort: {} };
    switch (sortBy) {
      case "spend":
        sortStage.$sort = { amountSpent: -1 };
        break;
      case "recent":
        sortStage.$sort = { lastPurchase: -1 };
        break;
      case "vip":
        sortStage.$sort = { amountSpent: -1 };
        break;
      default:
        sortStage.$sort = { lastPurchase: -1 };
    }
    pipeline.push(sortStage);

    // Add pagination stages
    pipeline.push({ $skip: skip }, { $limit: Number(limit) });

    const [customers, totalCustomersResult] = await Promise.all([
      OrderModel.aggregate(pipeline),
      OrderModel.aggregate([
        matchStage,
        ...(searchStage ? [searchStage] : []),
        ...(filter === "recent"
          ? [{ $match: { lastPurchase: { $gte: thirtyDaysAgo } } }]
          : []),
        ...(filter === "vip"
          ? [
              {
                $match: {
                  $or: [
                    { amountSpent: { $gte: 100000 } },
                    { orderCount: { $gte: 5 } },
                  ],
                },
              },
            ]
          : []),
        { $group: { _id: "$customerDetails.email" } },
        { $count: "total" },
      ]),
    ]);

    const totalCustomers = totalCustomersResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCustomers / Number(limit));

    const formattedCustomers: Customer[] = customers.map((c) => ({
      ...c,
      amountSpent: formatAmountToNaira(c.amountSpent),
      averageOrderValue: formatAmountToNaira(c.averageOrderValue),
    }));

    const response = {
      customers: formattedCustomers,
      totalCustomers,
      totalPages,
    };

    return res
      .status(200)
      .json(
        httpStatusResponse(200, "Customers fetched successfully.", response)
      );
  } catch (error) {
    console.error("Error in getCustomers:", error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId } = req;
    const { email } = req.params;

    const pipeline: PipelineStage[] = [
      {
        $match: {
          "customerDetails.email": email,
          storeId,
        },
      },
      {
        $group: {
          _id: "$customerDetails.email",
          name: { $first: "$customerDetails.name" },
          email: { $first: "$customerDetails.email" },
          phoneNumber: { $first: "$customerDetails.phoneNumber" },
          amountSpent: { $sum: "$amountPaid" },
          itemsBought: {
            $sum: {
              $cond: {
                if: { $eq: ["$orderStatus", "Completed"] },
                then: { $size: "$products" },
                else: 0,
              },
            },
          },
          lastPurchase: { $max: "$createdAt" },
          orders: { $push: "$$ROOT" },
          createdAt: { $first: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 0,
          name: 1,
          email: 1,
          phoneNumber: 1,
          amountSpent: 1,
          itemsBought: 1,
          lastPurchase: 1,
          createdAt: 1,
          orders: {
            $slice: ["$orders", 20], // Limit to last 5 orders
          },
        },
      },
    ];

    const result = await OrderModel.aggregate(pipeline);

    if (result.length === 0) {
      return res
        .status(404)
        .json(httpStatusResponse(404, "Customer not found"));
    }

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Customer details retrieved successfully",
          result[0]
        )
      );
  } catch (error) {
    const err = error as Error;
    return res
      .status(500)
      .json(
        httpStatusResponse(
          500,
          "An error occurred while retrieving customer details"
        )
      );
  }
};

export const editStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, body, userId } = req;
    const { updates, partial = true } = body;

    const store = new Store(storeId, userId);

    const edittedStore = await store.editStore(updates, partial);

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Changes has been applied to your store.",
          edittedStore
        )
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, query, userId } = req;
    const { storeCode } = query as unknown as { storeCode: string };

    let storeResp: IStore;

    const store = new Store(storeId, userId);

    if (storeCode) {
      const resp = await store.previewStore(storeCode);

      storeResp = resp.store;

      console.log({ storeResp });

      if (resp.action === "expired") {
        return res
          .status(400)
          .json(
            httpStatusResponse(
              3300,
              "Preview time has been exceeded, if you are the store owner please click the link below."
            )
          );
      }

      if (resp.action === "not-active") {
        return res
          .status(400)
          .json(httpStatusResponse(1100, "Store is not active."));
      }
    }

    //If the store code is not given but the storeId is provided we fetch using the storeId
    if (!storeCode && storeId) {
      //await store.isStoreActive(true);

      storeResp = await StoreModel.findById(storeId).select("+balance");

      if (!storeResp) {
        return res.status(404).json(httpStatusResponse(404, "Store not found"));
      }
    }

    return res.status(200).json(httpStatusResponse(200, undefined, storeResp));
  } catch (error) {
    const err = error as Error;
    console.log(err);
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getThemes = async (_: Request, res: Response) => {
  try {
    return res
      .status(200)
      .json(httpStatusResponse(200, "Themes fetched successfully", themes));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getProductReview = async (req: Request, res: Response) => {
  try {
    const { productId, storeId } = req.params;
    const { size = 10 } = req.query;

    const reviews = await RatingModel.find({ storeId, productId })
      .limit(Number(size))
      .lean();

    return res.status(200).json(httpStatusResponse(200, undefined, reviews));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const writeReviewOnProdcut = async (req: Request, res: Response) => {
  try {
    const review = req.body as IRating;

    const account = new Account(review.storeId);

    const newReview = await account.writeReviewOnProduct(review);

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Your review has been sent, thanks for the feedback",
          newReview
        )
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const createCoupon = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const payload = req.body as ICoupon & { sendEmailToCustomers?: boolean };
    const storeId = req.storeId;
    let newCoupon: any | null = null;

    if (payload._id) {
      newCoupon = await Coupon.findByIdAndUpdate(payload._id, {
        ...payload,
        storeId,
      }).lean();
    } else {
      const c = new Coupon({
        ...payload,
        storeId,
      });

      newCoupon = await c.save();
    }

    if (payload.sendEmailToCustomers) {
      const orders = await OrderModel.aggregate<{ email: string[] }>([
        {
          $match: {
            storeId,
            orderStatus: "Paid",
          },
          $group: {
            email: { $first: "$customerDetails.email" },
          },
          $project: {
            email: 1,
          },
        },
      ]);

      console.log(orders);

      // await sendEmail(orders, "");
    }

    return res
      .status(200)
      .json(httpStatusResponse(200, "Coupon created successfully"));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getCoupons = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, query } = req;

    const { size = 20 } = query;

    const coupons = await Coupon.find({ storeId }).limit(Number(size));

    return res.status(200).json(httpStatusResponse(200, undefined, coupons));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const deleteCoupon = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId, params } = req;
    const { couponId } = params;

    await Coupon.findOneAndDelete({ storeId, _id: couponId });

    return res
      .status(200)
      .json(
        httpStatusResponse(200, `Coupon with Id ${couponId} has been deleted.`)
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getStoreAddresses = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;

    const settings = await StoreSttings.findOne(
      { storeId },
      { storeAddress: 1 }
    );

    return res
      .status(200)
      .json(httpStatusResponse(200, undefined, settings?.storeAddress || []));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const addOrEditStoreAddress = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;
    const { address } = req.body;

    let settings = await StoreSttings.findOne({ storeId });

    if (!settings) {
      settings = await StoreSttings.create({
        storeId,
      });
    }

    const addressIndex = settings.storeAddress.findIndex(
      (a) => a._id.toString() === address._id
    );

    console.log(addressIndex);

    if (addressIndex > -1) {
      settings.storeAddress[addressIndex] = address;
    } else {
      const isDefault = !settings.storeAddress.find((s) => s.isDefault);
      const add = new AddressModel({ ...address, isDefault });
      settings.storeAddress.push((await add.save()).toObject());
    }

    await settings.save();

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Address saved successfully",
          settings.storeAddress
        )
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const deleteStoreAddress = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;
    const { addressId } = req.params;

    const settings = await StoreSttings.findOne({ storeId });

    if (!settings) {
      return res
        .status(404)
        .json(httpStatusResponse(404, "Store settings not found"));
    }

    settings.storeAddress = settings.storeAddress.filter(
      (address) => address._id.toString() !== addressId
    );

    await settings.save();

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Address deleted successfully",
          settings.storeAddress
        )
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId } = req;
    const { couponCode } = req.params;

    const coupon = await Coupon.findOne({ storeId, couponCode });

    return res.status(200).json(httpStatusResponse(200, undefined, coupon));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const completeOrderPayment = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { storeId } = req.body;

    const order = await findOrder(orderId, storeId);

    const paymentLinkIsExpired = isAfter(
      new Date(),
      new Date(order.paymentDetails.paymentDate)
    );

    if (!paymentLinkIsExpired)
      return res
        .status(200)
        .json(httpStatusResponse(200, undefined, order.toObject()));

    const transaction = await TransactionModel.findById(
      order.paymentDetails.tx_ref
    );

    if (!transaction) {
      return res
        .status(404)
        .json(httpStatusResponse(404, "Transaction not found"));
    }

    const tx_ref = order.paymentDetails.tx_ref;

    const payload: TransactionRequest<{ storeId: string; orderId: string }> = {
      amount: order.amountLeftToPay,
      currency: "NGN",
      customer: {
        email: order.customerDetails.email,
        name: order.customerDetails.name,
        phonenumber: order.customerDetails.phoneNumber,
      },
      customizations: {
        logo: "",
        description: "",
        title: order.customerDetails.name + "-" + "order payments",
      },
      meta: {
        storeId,
        orderId: order.id,
      },
      payment_options: [],
      redirect_url: "",
      tx_ref,
    };

    const charge = await createCharge(payload);

    order.paymentDetails.paymentLink = charge.data.link;
    order.paymentDetails.tx_ref = tx_ref;
    order.paymentDetails.transactionId = tx_ref;
    order.paymentDetails.paymentDate = new Date().toISOString();

    const newOrder = await order.save({ validateModifiedOnly: true });

    return res
      .status(200)
      .json(httpStatusResponse(200, undefined, newOrder.toObject()));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const editDeliveryAddress = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { storeId, address } = req.body as {
      storeId?: string;
      address: ICustomerAddress;
    };

    const order = await findOrder(orderId, storeId);

    const allowedOrderStatus: IOrderStatus[] = ["Pending", "Processing"];

    if (!allowedOrderStatus.includes(order.orderStatus))
      return res
        .status(400)
        .json(
          httpStatusResponse(
            400,
            "Your shipping address cannot be changed at the moment as your order is either completed, shipped, cancelled or refunded"
          )
        );

    const newAddress = await AddressModel.findByIdAndUpdate(address._id, {
      $set: address,
    });

    await order.updateOne({
      $set: { "customerDetails.shippingAddress": newAddress },
    });

    return res
      .status(200)
      .json(httpStatusResponse(200, undefined, order.toObject()));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const requestCancelOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const {
      storeId,
      phoneNumber,
      reason = "",
    } = req.query as undefined as {
      storeId?: string;
      phoneNumber?: string;
      reason?: string;
    };

    const orderService = new Order(storeId);

    await orderService.requestCancellation(orderId, phoneNumber, reason);

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Order cancellation request has been sent to store owner, Thank you"
        )
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const requestConfirmationOnOrder = async (
  req: Request,
  res: Response
) => {
  try {
    const { orderId } = req.params;
    const { storeId } = req.query as unknown as { storeId?: string };

    const [order, store] = await Promise.all([
      findOrder(orderId, storeId),
      findStore(storeId),
    ]);

    const user = await findUser(store.owner);
    const email = generateEmail(
      EmailType.ORDER_CONFIRMATION_REQUEST,
      { email: user.email, name: store.storeName },
      {
        primary: store.customizations.theme.primary,
        secondary: store.customizations.theme.secondary,
      },
      order,
      undefined,
      store.storeName
    );

    await sendEmail(user.email, email.body, undefined, email.subject);

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "The store owner has been notify about this order, Thank you for your patience."
        )
      );
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const verifyTransaction = async (req: Request, res: Response) => {
  try {
    const { tx_ref, status } = req.query as unknown as {
      tx_ref: string;
      status: string;
    };

    // Validate query parameters
    if (status !== "success" || !tx_ref) {
      return res
        .status(400)
        .json(httpStatusResponse(400, "Error verifying transaction")); // Provide a valid failure redirect URL
    }

    // Verify the transaction via Paystack API
    const response = await _verifyTransaction(tx_ref);

    const transactionData = response.data.data;

    // Retrieve order and store details in parallel
    const [order, store] = await Promise.all([
      findOrder(
        transactionData.metadata.orderId,
        transactionData.metadata.storeId,
        false
      ),
      findStore(transactionData.metadata.storeId, false),
    ]);

    const clientLink =
      process.env.CLIENT_DOMAIN +
      `/store/${store.storeCode}/track-order/${order._id}`;

    // Validate if order and store exist
    if (!order || !store) {
      res.redirect("/transaction-failed"); // Provide a valid failure redirect URL
      order.paymentDetails.paymentStatus = "pending";
      await order.save({ validateModifiedOnly: true });
      return;
    }

    if (order.paymentDetails.paymentStatus === "paid") {
      //
    }

    // Validate transaction status
    if (transactionData.status !== "success") {
      order.paymentDetails.paymentStatus = "failed";
      await order.save({ validateModifiedOnly: true });
      res.redirect(clientLink); // Provide a valid failure redirect URL
      return;
    }

    // Check if the currency is NGN
    if (transactionData.currency !== "NGN") {
      return res
        .status(400)
        .json(
          httpStatusResponse(400, "Invalid currency. Only NGN is accepted.")
        );
    }

    order.amountPaid += transactionData.amount;
    order.amountLeftToPay = Math.max(
      0,
      order.amountLeftToPay - transactionData.amount
    );

    order.orderStatus = "Completed";

    // Update order details
    order.paymentDetails = {
      ...order.paymentDetails,
      paymentMethod: transactionData.channel as "banktrf",
      paymentStatus: "paid",
      paymentDate: transactionData.paidAt,
    };

    // Update store balance
    store.balance += transactionData.amount;

    // Save updates
    await Promise.all([
      order.save({ validateModifiedOnly: true }),
      store.save({ validateModifiedOnly: true }),
    ]);

    // Redirect to success page or send a success response
    res.redirect(clientLink); // Provide a valid success redirect URL
    return;
  } catch (error) {
    // Handle errors gracefully
    console.error("Transaction verification failed:", error);
    return res
      .status(500)
      .json(
        httpStatusResponse(
          500,
          "An error occurred during transaction verification."
        )
      );
  }
};

export const verifyBillStackPayment = async (req: Request, res: Response) => {
  //  const payment = new PaymentService();
  //
  //  try {
  //    const signature = req.headers["x-wiaxy-signature"] as string;
  //    const payload: any = {};
  //
  //    await payment.startSession();
  //    await payment.verifyBillStackPayment(signature, payload);
  //    await payment.commitSession();
  //
  //    return res
  //      .status(200)
  //      .json(httpStatusResponse(200, "Payment verified successfully"));
  //  } catch (error) {
  //    await payment.cancelSession();
  //  }
};

export const getSalesChartData = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;

    const data = await getSalesData(storeId);

    return res.status(200).json(httpStatusResponse(200, undefined, data));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getOrderMetrics = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;

    const result = await getOrderStats(storeId);

    return res
      .status(200)
      .json(httpStatusResponse(200, "Metrics fetched successfully", result));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const createDeliveryPickupForOrder = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { orderId } = req.params;
    const { storeId } = req;
    const { type, estimatedDeliveryDate } = req.body;

    const sendBox = new SendBox(storeId, true, true);

    await sendBox.createShipment(
      {
        packageType: type,
        pickUpDate: estimatedDeliveryDate,
      },
      orderId,
      true
    );

    return res
      .status(200)
      .json(httpStatusResponse(200, "Order PickUp Created Successfully"));
  } catch (error) {
    // console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, body, storeId } = req;

    const account = new Account(storeId, userId);

    await account.updateUser(body);

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "USER_PROFILE_UPDATED_SUCCESSFULLY: Your data has been updated successfully"
        )
      );
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getReferrals = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req;

    const result = await ReferralModel.aggregate(referralPipeLine(userId));

    // Handle case when no referrals exist
    const response = result[0] || {
      totalReferrals: 0,
      totalEarnings: 0,
      referrals: [],
    };

    return res
      .status(200)
      .json(
        httpStatusResponse(200, "Referrals retrieved successfully", response)
      );
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const markTutorialAsCompleted = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req;

    const body = req.body as ITutorial[];

    const tutorials = body.map((tutorial) => {
      const { _id, ...rest } = tutorial;
      return {
        ...rest,
        user: userId,
        isCompleted: true,
        videoId: _id,
      };
    });

    const newTutorials = await TutorialModel.create(tutorials);

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Tutorials have been marked as completed.",
          newTutorials
        )
      );
  } catch (error) {
    console.error("Error marking tutorials as completed:", error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getTutorial = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req;
    const { videoId } = req.params;

    const tutorial = await TutorialModel.findOne({ user: userId, videoId });

    return res.status(200).json(httpStatusResponse(200, undefined, tutorial));
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const watchTutorial = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req;
    let nextVideo = 0;

    const TUTORIAL_VIDEO_SIZE = 12;

    const _ = await TutorialModel.countDocuments({ user: userId });

    nextVideo = _ + 1;

    if (_ >= TUTORIAL_VIDEO_SIZE) {
      nextVideo = null;
    }

    return res.status(200).json(httpStatusResponse(200, undefined, nextVideo));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const hasFinishedTutorialVideo = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req;
    const TUTORIAL_VIDEO_SIZE = 12;

    const tutorialsWatched = await TutorialModel.countDocuments({
      user: userId,
      isCompleted: true,
    });

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          undefined,
          tutorialsWatched >= TUTORIAL_VIDEO_SIZE
        )
      );
  } catch (error) {
    console.log(error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const exportCustomerData = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { body, storeId } = req;
    const {
      from,
      to,
      type = "excel",
    } = body as {
      from?: string;
      to?: string;
      type?: "excel" | "json";
    };

    if (!storeId) {
      return res
        .status(400)
        .json(httpStatusResponse(400, "Store ID is required."));
    }

    if (!from || !to || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
      return res
        .status(400)
        .json(httpStatusResponse(400, "Invalid date range provided."));
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    const pipeline: PipelineStage[] = [
      {
        $match: {
          storeId,
          createdAt: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $group: {
          _id: "$customerDetails.email",
          name: { $first: "$customerDetails.name" },
          email: { $first: "$customerDetails.email" },
          amountSpent: { $sum: "$amountPaid" },
          itemsBought: {
            $sum: {
              $cond: [
                { $eq: ["$orderStatus", "Completed"] },
                { $size: "$products" },
                0,
              ],
            },
          },
          lastPurchase: { $max: "$updatedAt" },
          orderCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: 1,
          email: 1,
          amountSpent: 1,
          itemsBought: 1,
          lastPurchase: 1,
          averageOrderValue: { $divide: ["$amountSpent", "$orderCount"] },
        },
      },
    ];

    const customers = await OrderModel.aggregate(pipeline);

    if (!customers.length) {
      return res
        .status(204)
        .json(httpStatusResponse(204, "No customers to export."));
    }

    if (type === "excel") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Customers");

      worksheet.columns = [
        { header: "ID", key: "id", width: 20 },
        { header: "Name", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Amount Spent", key: "amountSpent", width: 15 },
        { header: "Items Bought", key: "itemsBought", width: 15 },
        { header: "Average Order Value", key: "averageOrderValue", width: 20 },
        { header: "Last Purchase", key: "lastPurchase", width: 20 },
      ];

      customers.forEach((customer) => worksheet.addRow(customer));

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="customers.xlsx"'
      );

      await workbook.xlsx.write(res);
      return res.end();
    } else if (type === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="customers.json"'
      );

      return res.status(200).send(customers);
    } else {
      return res
        .status(400)
        .json(httpStatusResponse(400, "Invalid export type specified."));
    }
  } catch (error) {
    console.error("Export Customer Data Error:", error);
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getAiConversation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId: sId, userId: uId } = req;
    const {
      storeId: _sId,
      userId: _uId,
      sessionId,
    } = req.query as {
      storeId?: string;
      userId?: string;
      sessionId?: string;
    };

    const ai = new StoreBuildAI(
      _sId || sId,
      _uId || uId,
      _uId || sessionId,
      Boolean(sId)
    );

    const chats = await ai.getChatHistory();

    return res
      .status(200)
      .json(httpStatusResponse(200, "Chats gotten successfully", chats));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const customerAiChat = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;

    const { prompt, sessionId } = req.body as {
      prompt: string;
      sessionId: string;
    };

    const ai = new StoreBuildAI(storeId, sessionId, sessionId);

    await ai.rateLimiter();

    const r = await ai.customerHelper({ question: prompt });

    return res
      .status(200)
      .json(httpStatusResponse(200, "response generated successfully.", r));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const aiStoreAssistant = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId, userId } = req;
    const { query, sessionId } = req.body;

    const user = await findUser(userId);

    const ai = new StoreBuildAI(storeId, userId, sessionId, true);

    const limiter = user.plan.type === "premium" ? 9 : 3;

    await ai.rateLimiter(limiter);

    const r = await ai.storeAssistant(query);

    return res.status(200).json(httpStatusResponse(200, undefined, r));
  } catch (error) {
    const err = error as Error;
    return res.status(500).json(httpStatusResponse(500, err.message));
  }
};

export const getOnBoardingFlows = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const TUTORIAL_VIDEO_SIZE = 12;

    const [
      { isEmailVerified, phoneNumber },
      addPaymentMethod,
      hasProduct,
      tutorialsWatched,
    ] = await Promise.all([
      findUser(req.userId, true, { isEmailVerified: 1, phoneNumber: 1 }),
      StoreBankAccountModel.exists({
        storeId: req.storeId,
        userId: req.userId,
      }),
      ProductModel.exists({ storeId: req.storeId }),
      TutorialModel.countDocuments({
        user: req.userId,
        isCompleted: true,
      }),
    ]);

    return res.status(200).json(
      httpStatusResponse(200, undefined, {
        isEmailVerified,
        phoneNumber,
        hasProduct: !!hasProduct,
        addPaymentMethod,
        tutorialVideoWatch: tutorialsWatched >= TUTORIAL_VIDEO_SIZE,
      })
    );
  } catch (error) {
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const addBankAccount = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { accountNumber, nin, bankCode, bankName } = req.body;

    const account = new Account(req.storeId, req.userId);

    await account.connectBank(accountNumber, bankCode, nin, bankName);

    return res
      .status(200)
      .json(httpStatusResponse(200, "Account Added Successfully."));
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const getBanks = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId } = req;
    const provider = new PaymentService(storeId);
    const banks = await provider.getBankList();

    return res
      .status(200)
      .json(httpStatusResponse(200, "Banks fetched successfully", banks));
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const getStoreBank = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const {
      storeCode,
      size = 5,
      getDefault = false,
    } = req.query as unknown as {
      storeCode: string;
      size: number;
      getDefault: boolean;
    };

    const account = new Account(req.storeId, req.userId);

    const banks = (
      await account.getStoreAccounts(size, storeCode, getDefault)
    )?.map((bank) => {
      return {
        ...bank,
        accountNumber: maskAccountNumber(bank.accountNumber),
      };
    });

    return res
      .status(200)
      .json(
        httpStatusResponse(200, "Bank accounts fetched successfully", banks)
      );
  } catch (error) {
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const updateStoreBank = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const bankDetails = req.body;

    const { storeId, userId } = req;

    const bank = await StoreBankAccountModel.findOneAndUpdate({
      storeId,
      userId,
    });

    if (bank) {
      bank.accountNumber = bankDetails.accountNumber;
      bank.nin = bankDetails.nin;
      bank.bankName = bankDetails.bankName;
      bank.bankCode = bankDetails.bankCode;

      await bank.save();
    } else {
      const newBank = new StoreBankAccountModel({
        ...bankDetails,
        storeId,
        userId,
      });

      await newBank.save();
    }

    return res
      .status(200)
      .json(httpStatusResponse(200, "BankAccount updated successfully"));
  } catch (error) {
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const addSendBoxApiKey = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId, body } = req;
    const { accessKey } = body;

    const sendBox = new SendBox(storeId, true);

    await sendBox.saveSendBoxAccessKey(accessKey);

    return res
      .status(200)
      .json(httpStatusResponse(200, "SendBox API Key added successfully"));
  } catch (error) {
    console.log(error);
    return res.status(500).json(httpStatusResponse(500, error.message));
  }
};

export const deleteSendBoxApiKey = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;

    const sendBox = new SendBox(storeId, true);

    await sendBox.deleteApiKeys();

    return res
      .status(200)
      .json(httpStatusResponse(200, "KEY_DELETED_SUCCESSFULLY"));
  } catch (error) {
    return res.status(500).json(httpStatusResponse(500, error.message));
  }
};

export const getProductDraft = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const _p = new Product(req.storeId, req.userId);

    const products = await _p.getProductsDraft();

    return res
      .status(200)
      .json(httpStatusResponse(200, "Drafts fetch successfully", products));
  } catch (error) {
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const getDedicatedAcocunt = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;

    const account = await DedicatedAccountModel.findOne({ storeId });

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Account fetched successfully",
          account?.toObject()
        )
      );
  } catch (error) {
    console.log(error);
    return res.status(500).json(httpStatusResponse(500, error.message));
  }
};

export const createDedicatedAccount = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { storeId } = req;

    const account = new Account(storeId, req.userId);

    await account.generateAccountForStore();

    return res
      .status(200)
      .json(httpStatusResponse(200, "Account created successfully"));
  } catch (error) {
    console.log(error);
    return res.status(500).json(httpStatusResponse(500, error.message));
  }
};

export const makePayment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      id,
      paymentFor = "order",
      paymentOption = "card",
      storeCode = "",
      meta = { months: 1 },
    } = req.body;

    let storeIdentifier = storeCode;
    let identifier = id;

    console.log({ storeIdentifier });

    //if the user is authenticated and the payment is not for an order, we use the storeId
    if (req.userId && paymentFor !== "order") {
      storeIdentifier = req.storeId;
      identifier = req.userId;
    }

    const payment = new PaymentService(storeIdentifier);

    const data = await payment.makePayment(
      identifier,
      paymentFor,
      paymentOption,
      meta
    );

    return res
      .status(200)
      .json(httpStatusResponse(200, "Charge Initiated Successfully", data));
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const validateFlutterwavePayment = async (
  req: Request,
  res: Response
) => {
  try {
    const { tx_ref, status, storeId } = req.query as unknown as {
      tx_ref: string;
      status: "session_expired" | "successful";
      storeId?: string;
    };

    const allowStatus = new Set(["completed", "successfull"]);

    if (status === "session_expired") {
      return res
        .status(409)
        .json(
          httpStatusResponse(
            409,
            "PAYMENT_VALIDATION_FAILED: our payment provider notify us that this transaction session has expired, Please restart the session"
          )
        );
    }

    if (!allowStatus.has(status)) {
      return res
        .status(429)
        .json(
          httpStatusResponse(
            429,
            `PAYMENT_VALIDATION_FAILED: our payment provider notify us that this transaction session has expired, Please restart the session, STATUS:${status}`
          )
        );
    }

    console.log({ storeId, tx_ref });
    const payment = new PaymentService(storeId);

    await payment.validateFlutterwavePayment(tx_ref);

    return res
      .status(200)
      .json(httpStatusResponse(200, "PAYMENT_VALIDATED_SUCCESSFULLY"));
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const subscribeForStoreBuildAI = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const payment = new PaymentService(req.storeId);

    await payment.subscribeForAI();

    return res
      .status(200)
      .json(httpStatusResponse(200, "SUBSCRIBED_SUCCESSFULLY"));
  } catch (error) {
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const withdraw = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, accountId, otp } = req.body;

    const payment = new PaymentService(req.storeId);

    await payment.requestWithdraw(amount, accountId, otp);

    return res
      .status(200)
      .json(httpStatusResponse(200, "WITHDRAW_REQUESTED_SUCCESSFULLY"));
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const getInternalTransaction = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { size = 5, skip = 0 } = req.query as unknown as {
      size?: number;
      skip?: number;
    };

    const payment = new PaymentService(req.storeId);

    const transactions = await payment.getInternalTransactions({ size, skip });

    return res
      .status(200)
      .json(
        httpStatusResponse(
          200,
          "Transactions fetched successfully",
          transactions
        )
      );
  } catch (error) {
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};

export const getAiSuggestions = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const ai = new StoreBuildAI(req.storeId, req.userId, "", true);

    const suggestions = await ai.aiSuggestions();

    return res
      .status(200)
      .json(
        httpStatusResponse(200, "Suggestions fetched successfully", suggestions)
      );
  } catch (error) {
    return res
      .status(500)
      .json(httpStatusResponse(500, (error as Error).message));
  }
};
