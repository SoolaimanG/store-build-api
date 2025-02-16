import mongoose, { PipelineStage } from "mongoose";
import {
  chargePayload,
  chargeResponse,
  ICoupon,
  ICustomer,
  ICustomerAddress,
  IDiscoveredUsBy,
  IJoinNewsLetterFrom,
  IOrder,
  IOrderPaymentDetails,
  IOrderProduct,
  IOrderStatus,
  IOTPFor,
  IPaymentDetails,
  IPlan,
  IProduct,
  IProductDimensions,
  IReferral,
  IShippingDetails,
  IStore,
  IStoreTheme,
  IUser,
  IUserActions,
  OrderQuery,
  PickUpCreationResponse,
  ShipmentResponse,
  ShippingData,
  SignUpBody,
  VerifyChargeResponse,
} from "./types";
import {
  CategoryModel,
  Coupon,
  IntegrationModel,
  NewsLetterModel,
  OrderModel,
  OTPModel,
  ProductModel,
  RatingModel,
  ReferralModel,
  StoreModel,
  StoreSttings,
  UserModel,
} from "./models";
import { Request, Response, NextFunction } from "express";
// import { validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { createTransport } from "nodemailer";
import {
  generateOrderEmail,
  getOrderStatusChangedEmailTemplate,
  getQuickEmailsTemplate,
  otpEmailTemplate,
} from "./emails";
import axios from "axios";
import {
  config,
  DEFAULT_STORE_CONFIG,
  iconList,
  integrationIds,
  quickEmails,
} from "./constant";
import { validationResult } from "express-validator";

const MONGO_URI = config.MONGO_URI || "";

export async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {});
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Could not connect to MongoDB:", error);
  }
}

export const sendBoxApi = axios.create({
  baseURL: config.SEND_BOX_URL,
});

export const httpStatusResponse = (
  code: number,
  message?: string,
  data?: any
) => {
  const status: Record<number, any> = {
    200: {
      status: "success",
      message: message || "Request successful",
      data,
    },
    400: {
      status: "bad request",
      message: message || "An error has occurred on the client side.",
      data,
    },
    401: {
      status: "unauthorized access",
      message:
        message ||
        "You are not authorized to make this request or access this endpoint",
      data,
    },
    404: {
      status: "not found",
      message:
        message ||
        "The resources you are looking for cannot be found or does not exist",
      data,
    },
    409: {
      status: "conflict",
      message:
        message ||
        "The resources you are requesting for is having a conflict with something, please message us if this issue persist",
      data,
    },
    429: {
      status: "too-many-request",
      message:
        message || "Please wait again later, you are sending too many request.",
      data,
    },
    500: {
      status: "server",
      message:
        message ||
        "Sorry, The problem is from our end please try again later or message us if this issue persist, sorry for the inconvenience",
      data,
    },
  };

  return status[code];
};

export const isEmailAlreadyInNewsLetter = async (email: string) => {
  return Boolean(await NewsLetterModel.exists({ email }));
};

export const addToNewsLetter = async (
  email: string,
  joinFrom: IJoinNewsLetterFrom
) => {
  const exist = await isEmailAlreadyInNewsLetter(email);

  if (exist)
    throw new Error(
      "Thank you for showing interest, but your email already exists in our records."
    );

  const newsLetter = new NewsLetterModel({ email, joinFrom });

  await newsLetter.save();
};

export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(httpStatusResponse(400, errors.array()[0].msg));
  }
  next();
};

export function generateRandomString(length = 7): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export const calculateDeliveryCost = async (
  customerDetails: ICustomer & { shippingDetails: ICustomerAddress },
  productValue: number,
  storeId: string,
  products: IOrderProduct[]
) => {
  if (!customerDetails)
    throw new Error("Customer address is required to calculate cost");

  if (
    !(
      customerDetails.email &&
      customerDetails.shippingDetails.state &&
      customerDetails.phoneNumber
    )
  )
    throw new Error("Missing required parameter: Phone Number, Email or State");

  if (customerDetails.shippingDetails.country.toLowerCase() !== "nigeria")
    throw new Error("Only Nigeria is accepted as delivery country.");

  const [storeSettings, store] = await Promise.allSettled([
    StoreSttings.findOne({ storeId }),
    findStore(storeId),
  ]);

  if (storeSettings.status !== "fulfilled" || store.status !== "fulfilled")
    throw new Error("Something went wrong: Store Settings or Store");

  const { value: settings } = storeSettings;
  const { value: _store } = store;

  const { email, phoneNumber = "+2347068214943" } = await findUser(
    _store.owner,
    true,
    {
      email: 1,
      phoneNumber: 1,
    }
  );

  if (!settings)
    throw new Error(
      "Store address is not available yet! Please contact store to provide branch address."
    );

  const weight = products.reduce((acc, curr) => curr.weight + acc, 0) || 2;

  const items = products.map((p) => ({
    name: p.productName,
    description: p.description,
    quantity: p.quantity,
    value: p.discount || p.price.default,
  }));

  const height =
    products.reduce((acc, curr) => curr.dimensions.height + acc, 0) || 1;
  const width =
    products.reduce((acc, curr) => curr.dimensions.width + acc, 0) || 1;
  const length =
    products.reduce((acc, curr) => curr.dimensions.length + acc, 0) || 1;

  const defaultStoreAddress = settings.storeAddress.find((a) => a.isDefault);

  const payload = {
    origin: {
      first_name: _store.storeName,
      last_name: _store.storeName,
      state: defaultStoreAddress.state,
      email,
      city: defaultStoreAddress.state,
      country: "NG",
      phone: phoneNumber,
      name: "",
    },
    destination: {
      first_name: customerDetails.name,
      last_name: customerDetails.name,
      phone: customerDetails.phoneNumber,
      name: "",
      state: customerDetails.shippingDetails.state,
      email: customerDetails.email,
      city: customerDetails.shippingDetails.state,
      country: "NG",
    },
    weight,
    dimension: {
      length,
      width,
      height,
    },
    incoming_option: "dropoff",
    region: "NG",
    service_type: "international",
    package_type: "general",
    total_value: productValue,
    currency: "NGN",
    channel_code: "api",
    items,
    service_code: "standard",
    customs_option: "recipient",
  };

  const res: { data: ShipmentResponse } = await axios.post(
    `${config.SEND_BOX_URL}/shipping/shipment_delivery_quote`,
    payload,
    {
      headers: {
        Authorization: config.SEND_BOX_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );

  return res?.data;
};

export const generateReferralCode = async () => {
  let referralCode = generateRandomString();
  do {
    referralCode = generateRandomString();
  } while (Boolean(await UserModel.exists({ referralCode })));

  return referralCode;
};

export const createUser = async (
  email: string,
  discoveredUsBy: IDiscoveredUsBy,
  fullName?: string,
  session?: any
) => {
  const referralCode = await generateReferralCode();

  const plan: IPlan = {
    amountPaid: 0,
    autoRenew: false,
    expiredAt: null,
    subscribedAt: null,
    type: "free",
  };

  const user = await UserModel.create(
    [
      {
        plan,
        email,
        fullName,
        referralCode,
        discoveredUsBy,
        firstTimeUser: true,
        isEmailVerified: false,
      },
    ],
    { session }
  );

  return user[0];
};

export const cloneStore = async (templateId: string) => {
  const _store = await StoreModel.findOne({ templateId });

  if (!_store) return null;

  return _store.customizations;
};

export const createStore = async (
  store: Partial<IStore>,
  templateId?: string,
  session?: any
) => {
  let storeCode = generateRandomString(6);

  while (await StoreModel.exists({ storeCode })) {
    storeCode = generateRandomString(6);
  }

  // Merge the provided `store` data with the default values
  const storeData: IStore = { ...DEFAULT_STORE_CONFIG, ...store, storeCode };

  if (templateId) {
    // Clone the store design
    const store2Clone = await cloneStore(templateId);

    if (!store2Clone) return;

    storeData.customizations = {
      ...store2Clone,
      logoUrl: "",
    };
  }

  // Create and save the new store document in MongoDB
  const _store = await StoreModel.create([storeData], { session });

  return _store[0];
};

export const generateToken = (
  userId: string,
  email: string,
  storeId: string
) => {
  const token = jwt.sign({ userId, email, storeId }, config.SESSION_SECRET, {
    expiresIn: "30d",
  });

  return token;
};

export const generateOTP = (length = 6): string => {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
};

export const sendEmail = async (
  recipients: string[] | string,
  emailTemplate: string,
  replyTo?: string,
  subject?: string
) => {
  let configOptions: SMTPTransport | SMTPTransport.Options | string = {
    host: "smtp-relay.brevo.com",
    port: 587,
    ignoreTLS: true,
    auth: {
      user: config.HOST_EMAIL,
      pass: config.HOST_EMAIL_PASSWORD,
    },
  };

  const transporter = createTransport(configOptions);
  await transporter.sendMail({
    from: "store@build.com",
    to: recipients,
    html: emailTemplate,
    replyTo,
    subject: subject,
  });
};

// Separate function to fetch integrations
export const fetchIntegrations = async (storeId: string) => {
  enum Integration {
    FLUTTERWAVE = "flutterwave",
    KWIK = "kwik",
  }

  // Fetch both integrations in parallel
  const [kwikIntegration, flutterwaveIntegration] = await Promise.all([
    IntegrationModel.findOne({
      storeId,
      "integration.name": Integration.KWIK,
    }).lean(),
    IntegrationModel.findOne({
      storeId,
      "integration.name": Integration.FLUTTERWAVE,
    }).lean(),
  ]);

  return { kwikIntegration, flutterwaveIntegration };
};

// Handle notifications separately
export const handleOrderNotifications = async (
  order: IOrder,
  storeOwnerEmail: string,
  storeCode: string,
  theme: IStoreTheme
) => {
  try {
    const { customerEmail, adminEmail } = generateOrderEmail(
      order,
      config.CLIENT_DOMAIN + `/${storeCode}` + "/order/" + order._id,
      {
        background: "#252525",
        text: "#fffff",
        secondary: theme.secondary,
        primary: theme.primary,
      }
    );

    await Promise.all([
      sendEmail(order.customerDetails.email, customerEmail),
      sendEmail(storeOwnerEmail, adminEmail),
    ]);
  } catch (error) {
    console.error("Failed to send order notification:", error);
  }
};

export const validateOrderCreation = async (
  storeId: string,
  order: Partial<IOrder>
) => {
  const store = await findStore(storeId);

  if (!store) {
    const error = new Error("Store with this id is not in our database.");
    throw error;
  }

  if (!order.products.length)
    throw new Error("Cannot create an order with zero products");

  const shippingAddressAvailable = Boolean(
    order.customerDetails.shippingAddress.addressLine1 &&
      order.customerDetails.shippingAddress.country &&
      order.customerDetails.shippingAddress.state
  );

  for (const product of order.products) {
    if (!product.isDigital && !shippingAddressAvailable)
      throw new Error(
        "Please provide an shippingDetails for shipping your products."
      );
  }

  const user = await findUser(store.owner, true, {
    email: 1,
    phoneNumber: 1,
  });

  return {
    ...store,
    email: user.email,
    phoneNumber: user.phoneNumber,
  };
};

export const verifyOtp = async (token: string, userEmail: string) => {
  const email = { $regex: userEmail, $options: "i" };

  const user = await UserModel.findOne({ email });

  // Find and delete OTP in one query
  const otp = await OTPModel.findOne({ token, user: user.id });

  if (!otp) {
    throw new Error("Invalid OTP or OTP has already been used.");
  }

  // Check if OTP is expired
  if (Date.now() > otp.expiredAt) {
    throw new Error("OTP has expired.");
  }

  if (otp.tokenFor === "verify-email" && user.isEmailVerified)
    throw new Error("Your email has already been verified, Thank you");

  // Handle different OTP actions based on `tokenFor`
  if (otp.tokenFor === "login") {
    const store = await StoreModel.findOne({ owner: user.id });
    await otp.deleteOne();
    if (!store) {
      throw new Error("Store not found.");
    }

    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
    }
    // Generate and return token for login
    return generateToken(user.id, user.email, store.id);
  }

  if (otp.tokenFor === "verify-email") {
    await otp.deleteOne();
    user.isEmailVerified = true;
  }

  await user.save();

  return "OTP verified successfully.";
};

export const sendOTP = async (
  tokenFor: IOTPFor,
  _email: string,
  storeName: string
) => {
  let token = generateOTP();

  // Ensure unique OTP
  while (await OTPModel.exists({ token })) {
    token = generateOTP();
  }

  const email = { $regex: _email, $options: "i" };

  // Retrieve user and their email
  const user = await UserModel.findOne({ email });

  if (!user) throw new Error("User not found.");

  if (tokenFor == "verify-email" && user.isEmailVerified)
    throw new Error("Your email has already been verified, Thank you");

  // Retrieve or create OTP entry for the user
  let otp = await OTPModel.findOne({ user: user.id });
  if (!otp) {
    otp = new OTPModel({ user: user.id });
  }

  // Update OTP data
  otp.token = token;
  otp.tokenFor = tokenFor;
  otp.expiredAt = Date.now() + 10 * 60 * 1000;

  // Send the OTP email
  await sendEmail(
    user.email,
    otpEmailTemplate(token, storeName || "Store"),
    undefined,
    "Verify OTP"
  );

  // Save OTP to the database
  await otp.save();
};

export async function getSalesData(storeId: string) {
  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear, 0, 1); // January 1st
  const endDate = new Date(currentYear, 11, 31, 23, 59, 59); // December 31st, 23:59:59

  const aggregationPipeline: PipelineStage[] = [
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        orderStatus: "Completed",
        storeId,
      },
    },
    {
      $group: {
        _id: { $month: "$createdAt" },
        totalSales: { $sum: "$totalAmount" },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ];

  const salesData = await OrderModel.aggregate(aggregationPipeline);

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const formattedData = monthNames.map((month, index) => {
    const monthData = salesData.find((item) => item._id === index + 1);
    return {
      month,
      sale: monthData ? Math.round(monthData.totalSales) : 0,
    };
  });

  return formattedData;
}

export const queryRegex = (name: string) => {
  return new RegExp(`^${name}$`, "i");
};

export const verifyBank = async (
  account_number: string,
  account_bank: string
) => {
  const res: { data: { data: any } } = await axios.post(
    `https://api.flutterwave.com/v3/accounts/resolve`,
    {
      account_bank,
      account_number,
    },
    {
      headers: {
        Authorization: process.env.FLW_SECRET,
      },
    }
  );

  return res.data.data;
};

export const calculateMetrics = async (
  timeFrame: "all" | "7d" | "30d",
  storeId: string
) => {
  const now = new Date();
  let startDate: Date | null = null;
  let prevStartDate: Date | null = null;
  let prevEndDate: Date | null = null;

  if (timeFrame === "7d") {
    startDate = new Date(now.getTime());
    startDate.setDate(now.getDate() - 7);

    prevEndDate = new Date(startDate.getTime());
    prevStartDate = new Date(prevEndDate.getTime());
    prevStartDate.setDate(prevEndDate.getDate() - 7);
  } else if (timeFrame === "30d") {
    startDate = new Date(now.getTime());
    startDate.setDate(now.getDate() - 30);

    prevEndDate = new Date(startDate.getTime());
    prevStartDate = new Date(prevEndDate.getTime());
    prevStartDate.setDate(prevEndDate.getDate() - 30);
  }

  const filter: any = startDate
    ? { createdAt: { $gte: startDate }, storeId }
    : {};
  const prevFilter: any =
    prevStartDate && prevEndDate
      ? { createdAt: { $gte: prevStartDate, $lt: prevEndDate }, storeId }
      : {};

  const currentOrders = await OrderModel.find({
    ...filter,
    orderStatus: "Paid",
  });
  const prevOrders = await OrderModel.find({
    ...prevFilter,
    orderStatus: "Paid",
  });

  const totalSales = currentOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );
  const prevTotalSales = prevOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0
  );

  const calculateChange = (
    current: number,
    previous: number
  ): { value: string; isPositive: boolean } => {
    if (previous === 0) {
      return { value: "N/A", isPositive: current > 0 };
    }
    const changePercent = ((current - previous) / previous) * 100;
    return {
      value: `${changePercent.toFixed(2)}%`,
      isPositive: changePercent >= 0,
    };
  };

  const today = new Date();
  const todaySales = currentOrders
    .filter((order) => {
      const orderDate = new Date(order.createdAt);
      return orderDate.toDateString() === today.toDateString();
    })
    .reduce((sum, order) => sum + order.totalAmount, 0);

  const lastWeekSales = currentOrders
    .filter((order) => {
      const orderDate = new Date(order.createdAt);
      return orderDate > new Date(now.setDate(now.getDate() - 7));
    })
    .reduce((sum, order) => sum + order.totalAmount, 0);

  const lastMonthSales = currentOrders
    .filter((order) => {
      const orderDate = new Date(order.createdAt);
      return orderDate > new Date(now.setDate(now.getDate() - 30));
    })
    .reduce((sum, order) => sum + order.totalAmount, 0);

  const totalChange = calculateChange(totalSales, prevTotalSales);

  return [
    {
      label: "Total Orders",
      value: formatAmountToNaira(totalSales),
      change: totalChange.value,
      isPositive: totalChange.isPositive,
    },
    {
      label: "Today's Sale",
      value: formatAmountToNaira(todaySales),
      change: calculateChange(todaySales, 0).value, // Assume no "previous today's sales" comparison
      isPositive: todaySales > 0,
    },
    {
      label: "Last Week Sale",
      value: formatAmountToNaira(lastWeekSales),
      change: calculateChange(lastWeekSales, prevTotalSales).value,
      isPositive: lastWeekSales > prevTotalSales,
    },
    {
      label: "Last Month Sale",
      value: formatAmountToNaira(lastMonthSales),
      change: calculateChange(lastMonthSales, prevTotalSales).value,
      isPositive: lastMonthSales > prevTotalSales,
    },
  ];
};

export const createOrderQuery = (
  q: string | number,
  additionalQuery = {}
): OrderQuery["$or"] => {
  if (typeof q === "number") {
    return [{ "paymentDetails.amount": q }];
  }

  return [
    { id: q },
    { "paymentDetails.paymentStatus": new RegExp(q, "i") },
    { "customerDetails.email": new RegExp(q, "i") },
    { "customerDetails.phoneNumber": new RegExp(q, "i") },
    { "customerDetails.name": new RegExp(q, "i") },
    { "shippingDetails.shippingMethod": new RegExp(q, "i") },
    { "shippingDetails.trackingNumber": new RegExp(q, "i") },
    additionalQuery,
  ];
};

export function calculatePercentageChange(
  currentValue: number,
  previousValue: number
): number {
  if (previousValue === 0) return currentValue > 0 ? 100 : 0;
  return ((currentValue - previousValue) / previousValue) * 100;
}

export const validateProduct = async (product: IProduct) => {
  if (!product.productName) throw new Error("ProductName is required");

  if (!product.price.default) throw new Error("Price for product is required");

  if (!product.media.length)
    throw new Error(
      "Product required atleast one media for product visibility"
    );

  if (!product.stockQuantity)
    throw new Error("Cannot create product with zero stock");

  if (!product.isDigital) {
    // Check for colors
    if (!!product.availableColors.length) {
      product.availableColors.map((color) => {
        if (!color.colorCode || !color.name)
          throw new Error("Missing color code or color name");
      });
    }

    if (product.shippingDetails.isFreeShipping) {
      product.shippingDetails = {
        ...product.shippingDetails,
        shippingCost: 0,
      };
    }

    if (!product.gender.length) {
      product.gender = ["U"];
    }

    if (!!product.price.sizes.length) {
      product.price.sizes.map((size) => {
        if (!Object.keys(size)[0]) {
          throw new Error(
            `Amount is required for size ${Object.keys(size)[0]}`
          );
        }
      });
    }
  }

  if (product.isDigital) {
    // Upload digital files here!
  }

  if (product.stockQuantity >= product.maxStock)
    throw new Error(
      "stock Quantity cannot be greater than or equal to the max Stock, please make changes."
    );

  const categories = (
    await CategoryModel.find({ storeId: product.storeId }, { slot: 1 })
  ).map((_) => _.slot);

  const doesNotExist = categories.includes(product.category);

  if (!doesNotExist)
    throw new Error("This category does not exist on your categories");
};

export const _createProduct = async (product: IProduct) => {
  const newProduct = await ProductModel.create(product);

  return newProduct;
};

export const _editProduct = async (product: Partial<IProduct>) => {
  const updatedProduct = await ProductModel.findByIdAndUpdate(
    product._id,
    product,
    { new: true }
  );

  return updatedProduct;
};

export const checkMembershipAccess = async (
  userId: string,
  userAction: IUserActions,
  storeId?: string
): Promise<void> => {
  try {
    // Fetch user data
    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error(
        "User not found. Please verify your credentials and try again."
      );
    }

    switch (userAction) {
      case "ADD_PRODUCT": {
        if (!storeId) {
          throw new Error("Store ID is required to add a product.");
        }

        // Check the number of products in the user's store
        const userTotalProducts = await ProductModel.countDocuments({
          storeId,
        });
        const maxFreeProducts = Number(process.env.FREE_USER_PRODUCTS || 20);

        if (isNaN(maxFreeProducts)) {
          throw new Error(
            "System configuration error: FREE_USER_PRODUCTS is not set correctly."
          );
        }

        if (userTotalProducts >= maxFreeProducts) {
          throw new Error(
            "You have reached the maximum number of products allowed for free accounts. Please upgrade to premium for unlimited product uploads."
          );
        }

        break;
      }

      case "UPLOAD_VIDEO": {
        if (user.plan.type === "free") {
          throw new Error(
            "Video upload is a premium feature. Please upgrade your plan to access this feature."
          );
        }

        break;
      }

      default: {
        throw new Error(
          "Invalid user action. Please try again with a valid action."
        );
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      // Rethrow Error for proper handling at a higher level
      throw error;
    }

    // Log unexpected errors and rethrow a generic error message
    console.error("Unexpected error in checkUserMembership:", error);
    throw new Error("An unexpected error occurred. Please try again later.");
  }
};

export const validateIconExistance = (icon: string) => {
  if (!iconList.includes(icon))
    throw new Error("Please use icon that are listed.");
};

export const verifyStore = async (storeId: string, userId?: string) => {
  const store = await findStore(storeId);

  if (!store) throw new Error("Store with this Id does not exist!");

  if (userId && store.owner !== userId)
    throw new Error("You are not allow to make this request.");
};

export const verifyIntegration = (integration: string) => {
  if (!integrationIds.includes(integration))
    throw new Error(
      "This integration is not available, please select another integration"
    );
};

export async function createCharge(
  paymentData: chargePayload
): Promise<chargeResponse> {
  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      paymentData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.PAYSTACK_SECRET}`,
        },
      }
    );

    return response.data;

    // const data: FlutterwaveResponse = await response.json();
    // return data;
  } catch (error) {
    console.error("Error creating charge:", error);
    throw error;
  }
}

export const allowOrderStatus = (
  orderStatus: IOrderStatus,
  _allowOrderStatus: IOrderStatus[] = ["Pending", "Processing"]
) => {
  if (!_allowOrderStatus.includes(orderStatus))
    throw new Error(`Cannot send a request with this order`);
};

export const calculateTotalAmount = async (
  cartItems: { productId: string; color?: string; size?: string }[],
  couponCode?: string
): Promise<{
  totalAmount: number;
  discountedAmount: number;
  discountPercentage: number;
}> => {
  // Fetch individual products based on cart items
  const productPromises = cartItems.map((item) =>
    ProductModel.findById(item.productId)
  );
  const products = await Promise.all(productPromises);

  // Validate if all products exist
  const productMap: Record<string, IProduct> = {};
  products.forEach((product, index) => {
    if (!product) {
      throw new Error(
        `Product with ID ${cartItems[index].productId} not found.`
      );
    }
    productMap[cartItems[index].productId] = product;
  });

  // Fetch the coupon if provided
  let coupon: ICoupon | null = null;
  if (couponCode) {
    coupon = await Coupon.findOne({ couponCode });
    if (!coupon) {
      throw new Error("Invalid coupon code.");
    }

    // Verify coupon expiration
    if (new Date() > new Date(coupon.expirationDate)) {
      throw new Error("Coupon code has expired.");
    }
  }

  let cartTotalPrice = 0;
  let totalDiscount = 0;

  for (const cartItem of cartItems) {
    const { productId, size } = cartItem;
    const product = productMap[productId];

    // Determine base price based on product size pricing strategy
    let basePrice = 0;
    if (product.price.useDefaultPricingForDifferentSizes) {
      basePrice = product.price.default;
    } else {
      const sizePrice = product.price.sizes.find(
        (sizePrice) => sizePrice[size || ""] !== undefined
      );
      basePrice = sizePrice ? sizePrice[size || ""] : product.price.default;
    }

    // Apply product-specific discount
    const discountedPrice =
      product.discount > 0
        ? basePrice - (basePrice * product.discount) / 100
        : basePrice;

    let finalPrice = discountedPrice;
    let productDiscount = (basePrice * product.discount) / 100;

    // Apply coupon discount if applicable
    if (coupon) {
      if (
        coupon.appliedTo === "products" &&
        coupon.selectedProducts.includes(productId)
      ) {
        if (coupon.type === "percentageCoupon") {
          productDiscount = (finalPrice * coupon.discountValue) / 100;
        } else if (coupon.type === "nairaCoupon") {
          productDiscount = coupon.discountValue;
        }
      }

      // Adjust final price for coupon discount
      finalPrice = Math.max(0, finalPrice - productDiscount);
    }

    // Add this item's final price to the cart's total price
    cartTotalPrice += finalPrice;
    totalDiscount += productDiscount;
  }

  // Apply shopping cart-wide coupon if applicable
  if (coupon && coupon.appliedTo === "shoppingCart") {
    let cartDiscount = 0;
    if (coupon.type === "percentageCoupon") {
      cartDiscount = (cartTotalPrice * coupon.discountValue) / 100;
    } else if (coupon.type === "nairaCoupon") {
      cartDiscount = coupon.discountValue;
    }

    cartTotalPrice = Math.max(0, cartTotalPrice - cartDiscount);
    totalDiscount += cartDiscount;
  }

  const originalTotal = cartTotalPrice + totalDiscount;
  const discountPercentage = originalTotal
    ? (totalDiscount / originalTotal) * 100
    : 0;

  return {
    totalAmount: cartTotalPrice,
    discountedAmount: totalDiscount,
    discountPercentage: parseFloat(discountPercentage.toFixed(2)), // Limit to 2 decimal places
  };
};

export function formatAmountToNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    style: "currency",
    minimumFractionDigits: 2,
  }).format(amount);
}

export const isStoreActive = async (storeId: string) => {
  const store = await StoreModel.findById(storeId).lean();

  if (!store.isActive)
    throw new Error(
      "Cannot proceed because your store is not active, please contact support"
    );
};

export const areAllProductDigital = (products: IProduct[]) => {
  return products.every((product) => product.isDigital);
};

export const processOrder = async (
  storeId: string,
  order: Partial<IOrder>,
  tx_ref: string,
  couponCode?: string
) => {
  // Create a new ObjectId properly
  const _id = new mongoose.Types.ObjectId();

  isStoreActive(storeId);

  const customerDetails: ICustomer & { shippingAddress: ICustomerAddress } = {
    ...order.customerDetails,
    email: order.customerDetails.email,
    name: order.customerDetails.name,
    phoneNumber: order.customerDetails.phoneNumber,
  };

  const paymentDetails: IOrderPaymentDetails = {
    paymentDate: new Date().toISOString(),
    paymentLink: "NIL",
    paymentMethod: "banktrf",
    paymentStatus: "pending",
    tx_ref,
    transactionId: tx_ref,
  };

  const _products = order.products.map((p) => ({
    size: p.size,
    productId: p._id,
    color: p.color,
  }));

  // Parallel execution of independent operations
  const [amountRes, storeRes, integrationsRes] = await Promise.allSettled([
    calculateTotalAmount(_products, couponCode),
    validateOrderCreation(storeId, order),
    fetchIntegrations(storeId),
  ]);

  const checkFulfilment =
    amountRes.status === "rejected" ||
    storeRes.status === "rejected" ||
    integrationsRes.status === "rejected";

  if (checkFulfilment) {
    throw new Error("Something went wrong why trying to process your order");
  }

  const amount = amountRes.value;
  const store = storeRes.value;
  const integrations = integrationsRes.value;

  let deliveryCost = 0;

  //
  if (order.deliveryType === "sendbox" && customerDetails) {
    const res = await calculateDeliveryCost(
      {
        ...customerDetails,
        shippingDetails: {
          ...customerDetails.shippingAddress,
        },
      },
      amount.totalAmount,
      storeId,
      order.products
    );

    const shippingPackageOption: Record<
      typeof order.shippingDetails.shippingMethod,
      0 | 1
    > = {
      EXPRESS: 0,
      STANDARD: 1,
    };

    const option =
      shippingPackageOption[
        order?.shippingDetails?.shippingMethod || "STANDARD"
      ];

    const totalShippingCost = res.rates?.[option]?.fee;

    deliveryCost = totalShippingCost;
  }

  const { flutterwaveIntegration } = integrations;

  if (flutterwaveIntegration?.integration?.isConnected) {
    const useCustomerDetails =
      flutterwaveIntegration.integration.settings.useCustomerDetails;

    if (!useCustomerDetails) {
      customerDetails.email = store.email;
      customerDetails.name = store.storeName;
      customerDetails.phoneNumber = store.phoneNumber;
    }

    const paymentData: chargePayload<{ orderId: string }> = {
      amount: amount.totalAmount + deliveryCost,
      email: customerDetails.email,
      reference: tx_ref,
      metadata: {
        orderId: order._id,
      },
    };

    const charge = await createCharge(paymentData);

    paymentDetails.paymentLink = charge.data.authorization_url;
  } else if (verifyStorePaymentOption(store.paymentDetails)) {
    paymentDetails.paymentLink = undefined;
    paymentDetails.paymentMethod = "banktrf";
    paymentDetails.tx_ref = undefined;
    paymentDetails.paymentDate = undefined;
  } else {
    const err = new Error(
      "This store does not have an active payment option, please message the store owner about this error"
    );
    throw err;
  }

  // Create order
  const newOrder = new OrderModel({
    ...order,
    _id,
    storeId,
    paymentDetails,
    orderStatus: "Pending",
    amountLeftToPay: amount.totalAmount + deliveryCost,
    totalAmount: amount.totalAmount + deliveryCost,
    amountPaid: 0,
    coupon: couponCode,
    shippingDetails: {
      ...order.shippingDetails,
      shippingCost: deliveryCost,
    },
  });

  await newOrder.save({ validateModifiedOnly: true });

  try {
    await handleOrderNotifications(
      newOrder,
      store.email,
      store.storeCode,
      store.customizations?.theme
    );
  } catch (error) {
    console.log(error);
  }

  return newOrder;
};

export const calculateProductReviewStats = async (productId: string) => {
  try {
    const [stats] = await RatingModel.aggregate([
      { $match: { productId } },
      {
        $group: {
          _id: "$productId",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const lastReview = await RatingModel.findOne({ productId })
      .sort({ createdAt: -1 })
      .lean();

    return {
      averageRating: stats?.averageRating || 0,
      totalReviews: stats?.totalReviews || 0,
      lastReview: lastReview || null,
    };
  } catch (error) {
    console.error("Error calculating review stats:", error);
    throw new Error("Could not calculate review stats.");
  }
};

export const verifyQuickEmailExist = (id: string) => {
  const emailExist = quickEmails.find((email) => email.id === id);
  if (!Boolean(emailExist))
    throw new Error("This email with this ID does not exist yet!");

  return emailExist;
};

export const sendQuickEmail = async (
  order: IOrder,
  emailId: string,
  recipientEmail: string | string[]
) => {
  const { label } = verifyQuickEmailExist(emailId);

  await sendEmail(
    recipientEmail,
    getQuickEmailsTemplate(emailId, order),
    undefined,
    label
  );
};

export const _editOrder = async (
  orderId: string,
  updates: Partial<IOrder>,
  partial = false
) => {
  try {
    // Validate orderId
    if (!orderId) {
      throw new Error("Order ID is required");
    }

    // Find and update the order
    const updatedOrder = await OrderModel.findOneAndUpdate(
      { _id: orderId },
      // If partial is true, use $set to only update specified fields
      partial ? { $set: updates } : updates,
      {
        new: true, // Return updated document
      }
    );

    // Check if order exists
    if (!updatedOrder) {
      throw new Error("Order not found");
    }

    return updatedOrder;
  } catch (error) {
    // Re-throw with more context
    throw error instanceof Error ? error : new Error("Failed to update order");
  }
};

export const _editStore = async (
  storeId: string,
  updates: Partial<IStore>,
  partial = false,
  runValidators = true
) => {
  if (updates?.customizations?.category?.showImage) {
    const categories = await CategoryModel.find({
      storeId,
    });
    const allCategoriesHaveImages = categories.every(
      (category) => !!category.img
    );

    if (!allCategoriesHaveImages)
      throw new Error(
        "All categories must have images when showImage is enabled."
      );
  }

  const newStore = await StoreModel.findOneAndUpdate(
    { _id: storeId },
    partial ? { $set: updates } : updates,
    { runValidators, new: true }
  ).lean();

  return newStore;
};

export async function handleOrderStatusChange(doc: IOrder) {
  try {
    const emailData = {
      customerName: doc.customerDetails.name,
      orderNumber: doc._id.toString(),
      productName: doc.products[0]?.productName || "your order",
      trackingLink: `${process.env.FRONTEND_URL}/orders/${doc._id}`,
      expectedDeliveryDate: doc.shippingDetails.estimatedDeliveryDate,
    };

    let emailContent = getOrderStatusChangedEmailTemplate(doc.orderStatus, {
      ...emailData,
    });

    if (emailContent) {
      await sendEmail(
        doc.customerDetails.email,
        emailContent,
        undefined,
        `Order #${doc._id} ${doc.orderStatus}`
      );
    }
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

export async function findOrder(
  orderId: string,
  storeId?: string,
  throwOn404 = true,
  projection?: Partial<Record<keyof IOrder, 0 | 1>>
) {
  const order = await OrderModel.findOne({ _id: orderId, storeId }, projection);

  if (throwOn404 && !order) {
    throw new Error(`Order with Id ${orderId} not found in our database.`);
  }

  return order;
}

export async function findStore(
  store: any,
  throwOn404 = true,
  projection?: Partial<Record<keyof IStore, 0 | 1>>
) {
  const _store = await StoreModel.findOne(
    typeof store === "string" ? { _id: store } : store,
    projection
  );

  if (throwOn404 && !_store) {
    throw new Error(`Store with query not found in our database.`);
  }

  return _store;
}

export async function findUser(
  user: any,
  throwOn404 = true,
  projection?: Partial<Record<keyof IUser, 0 | 1>>
) {
  const _user = await UserModel.findOne(
    typeof user === "string" ? { _id: user } : user,
    projection
  );

  if (throwOn404 && !_user) {
    throw new Error(`User with this query not found in our database.`);
  }

  return _user;
}

export const _verifyTransaction = async <
  T = { orderId: string; storeId: string }
>(
  tx_ref: string
) => {
  const response = await axios.get<VerifyChargeResponse<T>>(
    `https://api.paystack.co/transaction/verify/${tx_ref}`,
    {
      headers: {
        Authorization: `Bearer ${config.PAYSTACK_SECRET}`,
      },
    }
  );

  return response;
};

export const handleReferralLogic = async (
  referralCode: string,
  referreeId: string
) => {
  try {
    // Validate inputs
    if (!referralCode || !referreeId) {
      return { success: false, message: "Invalid referral or referree Id" };
    }

    const [referrerRes, referreeRes] = await Promise.allSettled([
      UserModel.findOne({ referralCode }),
      UserModel.findById(referreeId),
    ]);

    if (
      referrerRes.status !== "fulfilled" ||
      referreeRes.status !== "fulfilled"
    ) {
      return { success: false, message: "Invalid referral or referree code" };
    }

    const [referrer, referree] = [referrerRes.value, referreeRes.value];

    // Check if the referree has already been referred
    const existingReferral = await ReferralModel.findOne({
      referree: referreeId,
    });

    if (existingReferral) {
      return { success: false, message: "User has already been referred" };
    }

    // Check if the referrer is trying to refer themselves
    if (referrer.id === referreeId) {
      return { success: false, message: "Users cannot refer themselves" };
    }

    // Create a new referral record
    await ReferralModel.create({
      referrer: referrer.id,
      referree: referreeId,
      date: new Date(),
    });

    return {
      success: true,
      message: "Referral successful",
      referrer: referrer.toObject(),
      referree: referree.toObject(),
    };
  } catch (error) {
    return {
      success: false,
      message: "An error occurred while processing the referral",
    };
  }
};

export const generateReferralReward = async () => {};

export const validateSignUpInput = (input: SignUpBody): string | null => {
  if (!input.email || !input.email.includes("@")) {
    return "Invalid email address";
  }
  if (!input.storeName || input.storeName.length < 3) {
    return "Store name must be at least 3 characters long";
  }
  if (!input.fullName || input.fullName.length < 2) {
    return "Full name must be at least 2 characters long";
  }
  if (!input.productType) {
    return "Product type is required";
  }
  // Add more validations as needed
  return null;
};

export const verifyStorePaymentOption = (paymentDetails: IPaymentDetails) => {
  return Boolean(
    paymentDetails?.accountName &&
      paymentDetails?.accountNumber &&
      paymentDetails?.bankName
  );
};

export async function getOrderStats(storeId: string) {
  const stats = await OrderModel.aggregate([
    // Match orders for the specific store
    { $match: { storeId: storeId } },

    // Group all documents to calculate statistics
    {
      $facet: {
        // Total orders count
        totalOrders: [{ $count: "count" }],

        // Delivered over time (orders that were delivered)
        deliveredOrders: [
          { $match: { orderStatus: "Completed" } },
          { $count: "count" },
        ],

        // Returns count (orders with Refunded status)
        returns: [{ $match: { orderStatus: "Refunded" } }, { $count: "count" }],

        // Average order value and total amount
        orderValues: [
          {
            $group: {
              _id: null,
              avgOrderValue: { $avg: "$totalAmount" },
              totalAmount: { $sum: "$totalAmount" },
            },
          },
        ],
      },
    },

    // Project the final format
    {
      $project: {
        totalOrders: { $arrayElemAt: ["$totalOrders.count", 0] },
        deliveredOverTime: { $arrayElemAt: ["$deliveredOrders.count", 0] },
        returns: { $arrayElemAt: ["$returns.count", 0] },
        avgOrderValue: { $arrayElemAt: ["$orderValues.avgOrderValue", 0] },
        totalAmount: { $arrayElemAt: ["$orderValues.totalAmount", 0] },
      },
    },
  ]);

  // Handle null values and return formatted stats
  const result = stats[0];
  return {
    totalOrders: result.totalOrders || 0,
    deliveredOverTime: result.deliveredOverTime || 0,
    returns: result.returns || 0,
    avgOrderValue: Math.round(result.avgOrderValue || 0),
    totalAmount: result.totalAmount || 0,
  };
}

export const createPickup = async (
  orderId: string,
  storeId: string,
  pickUpType: string,
  estimatedDeliveryDate?: string
) => {
  if (!estimatedDeliveryDate) {
    throw new Error("Invalid Date Type");
  }

  if (pickUpType === "pickup" && new Date() > new Date(estimatedDeliveryDate)) {
    throw new Error(
      "Pick up date cannot be a back date, Please use a valid date."
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  const endSession = async () => {
    await session.abortTransaction();
    session.endSession();
  };

  try {
    if (!orderId || !storeId) throw new Error("Invalid orderId or storeId.");

    const isValidObjectId = /^[a-fA-F0-9]{24}$/;
    if (!isValidObjectId.test(orderId) || !isValidObjectId.test(storeId)) {
      await endSession();
      throw new Error("Invalid ID format.");
    }

    const [order, store] = await Promise.all([
      OrderModel.findOne({ _id: orderId, storeId }, undefined, { session }),
      StoreModel.findOne({ _id: storeId }, undefined, { session }).select(
        "+balance"
      ),
    ]);

    if (!order || !store) {
      await endSession();
      throw Error("Order or store not found.");
    }

    if (order.deliveryType !== "sendbox") {
      await endSession();
      throw new Error("Invalid delivery type.");
    }

    const user = await UserModel.findById(store.owner, undefined, { session });
    if (!user) {
      await endSession();
      throw new Error("Store owner not found.");
    }

    const { storeAddress } = await StoreSttings.findOne(
      { storeId },
      { storeAddress: 1 },
      { session }
    );

    const defaultAddress = storeAddress?.find((address) => address.isDefault);
    if (!defaultAddress) {
      await endSession();
      throw new Error("No default address found.");
    }

    const customerDetails: ICustomer & {
      shippingDetails: ICustomerAddress;
    } = {
      email: order.customerDetails.email,
      name: order.customerDetails.name,
      phoneNumber: order.customerDetails.phoneNumber,
      shippingDetails: {
        addressLine1: order.customerDetails.shippingAddress.addressLine1,
        addressLine2: order.customerDetails.shippingAddress.addressLine2,
        city: order.customerDetails.shippingAddress.city,
        country: order.customerDetails.shippingAddress.country,
        lat: 0,
        lng: 0,
        postalCode: order.customerDetails.shippingAddress.postalCode,
        state: order.customerDetails.shippingAddress.state,
      },
    };

    const dc = order.shippingDetails.shippingCost;

    if (!dc) {
      await endSession();
      throw new Error("Failed to calculate delivery cost.");
    }

    console.log(store.balance, { dc });

    if (store.balance < dc) {
      await endSession();
      throw new Error(
        `Insufficient balance. Top up by ${formatAmountToNaira(
          dc - store.balance
        )}.`
      );
    }

    const getDefaultDimension = (
      products: IProduct[],
      key: keyof IProductDimensions
    ) =>
      Math.max(
        products.reduce((acc, curr) => acc + (curr.dimensions?.[key] || 0), 0),
        1
      );

    const weight =
      order.products?.reduce((acc, curr) => acc + (curr.weight || 0), 0) || 0;

    if (weight <= 0) {
      await endSession();
      throw new Error("Invalid product weight.");
    }

    const items = order.products.map((p) => ({
      name: p.productName,
      description: p.description || "No description provided",
      quantity: p.quantity || 1,
      value: p.discount || p.price.default || 0,
    }));

    const dimensions = {
      height: getDefaultDimension(order.products, "height"),
      width: getDefaultDimension(order.products, "width"),
      length: getDefaultDimension(order.products, "length"),
    };

    const pickUpPayload = {
      origin: {
        first_name: store.storeName,
        last_name: store.storeName,
        state: defaultAddress.state,
        email: user.email,
        city: defaultAddress.state,
        country: "NG",
        phone: user.phoneNumber,
      },
      destination: {
        first_name: customerDetails.name,
        last_name: customerDetails.name,
        phone: customerDetails.phoneNumber,
        state: customerDetails.shippingDetails.state,
        email: customerDetails.email,
        city: customerDetails.shippingDetails.state,
        country: "NG",
      },
      weight,
      dimension: dimensions,
      incoming_option: pickUpType,
      region: "NG",
      service_type: "international",
      package_type: "general",
      total_value: order.totalAmount,
      currency: "NGN",
      channel_code: "api",
      pickup_date: estimatedDeliveryDate, // Dynamically set pickup date
      items,
      service_code: "standard",
      customs_option: "recipient",
      callback_url: process.env.CALLBACK_URL || "",
    };

    const response = await axios.post(
      "https://live.sendbox.co/shipping/shipments",
      pickUpPayload,
      {
        headers: { Authorization: `Bearer ${config.SEND_BOX_ACCESS_TOKEN}` },
      }
    );

    const { tracking_code } = response.data;
    if (!tracking_code) {
      await endSession();
      throw new Error("Failed to retrieve tracking code.");
    }

    order.shippingDetails.trackingNumber = tracking_code;
    store.balance -= dc;

    await Promise.all([
      order.save({ validateModifiedOnly: true }),
      store.save({ validateModifiedOnly: true }),
    ]);

    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    await endSession();
    throw error;
  }
};

export const handleIntegrationConnection = async (
  storeId: string,
  integrationId: string
) => {
  try {
    verifyIntegration(integrationId);

    if (integrationId === integrationIds[4]) {
      return {
        success: false,
        message: "Instagram integration not available right now!",
        statusCode: 400,
      };
    }

    const store = await findStore(storeId);
    if (!store) {
      return {
        success: false,
        message: "Store not found",
        statusCode: 404,
      };
    }

    const { phoneNumber } = await findUser(store.owner, true, {
      phoneNumber: 1,
    });

    const integration = await IntegrationModel.findOne({
      storeId: storeId,
      "integration.name": integrationId,
    });

    const isConnected = integration?.integration?.isConnected;

    const integrationSettings: Record<string, any> = {
      sendbox: {
        shippingRegions: [],
        deliveryNationwide: true,
      },
      paystack: {
        chargeCustomers: false,
        storeName: store.storeName,
        storePhoneNumber: phoneNumber,
        useCustomerDetails: false,
      },
      chatbot: {
        name: `${store.storeName} AI`,
        language: "english",
        permissions: {
          allowProductAccess: false,
          allowOrderAccess: true,
          allowCustomerAccess: true,
        },
      },
      unsplash: {
        numberOfImages: 1,
      },
    };

    const settings = isConnected
      ? integration.integration.settings
      : integrationSettings[integrationId];

    if (integration) {
      await IntegrationModel.updateOne(
        {
          storeId: storeId,
          "integration.name": integrationId,
        },
        {
          $set: {
            "integration.settings": settings,
            "integration.isConnected": !isConnected,
          },
        }
      );
    } else {
      await IntegrationModel.create({
        storeId: storeId,
        integration: {
          name: integrationId,
          settings,
          isConnected: true,
        },
      });
    }

    return {
      success: true,
      message: `${integrationId} is ${
        isConnected ? "Disconnected" : "Connected"
      } successfully`,
      statusCode: 200,
    };
  } catch (error) {
    console.error(error);
    const err = error as Error;
    return {
      success: false,
      message: err.message,
      statusCode: 500,
    };
  }
};
