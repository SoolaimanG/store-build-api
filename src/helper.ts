import mongoose, { PipelineStage } from "mongoose";
import {
  FlutterwaveResponse,
  IChatBotConversation,
  IChatBotIntegration,
  ICoupon,
  ICustomer,
  ICustomerAddress,
  IDiscoveredUsBy,
  IIntegrationSubscription,
  IJoinNewsLetterFrom,
  IOrder,
  IOrderPaymentDetails,
  IOrderProduct,
  IOrderStatus,
  IOTPFor,
  IPlan,
  IProduct,
  IProductDimensions,
  IStore,
  IStoreTheme,
  IUser,
  IUserActions,
  OrderQuery,
  ShipmentResponse,
  ShippingData,
  SignUpBody,
  TransactionRequest,
  VerifyChargeResponse,
} from "./types";
import {
  AISuggestionModel,
  CategoryModel,
  ChatBotConversationModel,
  Coupon,
  IntegrationModel,
  IntegrationSubscriptionModel,
  NewsLetterModel,
  OrderModel,
  OTPModel,
  ProductModel,
  ProductTypesModel,
  RatingModel,
  ReferralModel,
  StoreModel,
  StoreSttings,
  TransactionModel,
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
} from "./emails";
import axios from "axios";
import {
  config,
  iconList,
  integrationIds,
  quickEmails,
  referralPipeLine,
  themes,
} from "./constant";
import { validationResult } from "express-validator";
import {
  Content,
  FunctionDeclaration,
  GoogleGenerativeAI,
  SchemaType,
} from "@google/generative-ai";
import { LRUCache } from "lru-cache";
import { Account, PaymentService, SendBox, Store } from "./server-utils";

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
  data?: any,
  _status?: string
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

  const checkCode = new Set(Object.keys(status)).has(code + "");

  return checkCode ? status[code] : { status: _status, message, code, data };
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

export const cloneStore = async (templateId: string) => {
  const _store = await StoreModel.findOne({ templateId });

  if (!_store) return null;

  return _store.customizations;
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
    port: 465,
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
    SENDBOX = "sendbox",
  }

  // Fetch both integrations in parallel
  const [sendBoxIntegration, flutterwaveIntegration] = await Promise.all([
    IntegrationModel.findOne({
      storeId,
      "integration.name": Integration.SENDBOX,
    }).lean(),
    IntegrationModel.findOne({
      storeId,
      "integration.name": Integration.FLUTTERWAVE,
    }).lean(),
  ]);

  return { sendBoxIntegration, flutterwaveIntegration };
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
        secondary: theme?.secondary || "",
        primary: theme?.primary || "",
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

  const filter: any = startDate ? { createdAt: { $gte: startDate } } : {};
  const prevFilter: any =
    prevStartDate && prevEndDate
      ? { createdAt: { $gte: prevStartDate, $lt: prevEndDate } }
      : {};

  const currentOrders = await OrderModel.find({
    ...filter,
    orderStatus: "Completed",
    storeId,
  });
  const prevOrders = await OrderModel.find({
    ...prevFilter,
    orderStatus: "Completed",
    storeId,
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
  if (!product.productName) {
    throw new Error("ProductName is required");
  }

  if (!product.price.default) {
    throw new Error("Price for product is required");
  }

  if (!product.media.length) {
    throw new Error(
      "Product required atleast one media for product visibility"
    );
  }

  if (!product.stockQuantity) {
    throw new Error("Cannot create product with zero stock");
  }

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

  if (!doesNotExist) {
    throw new Error("This category does not exist on your categories");
  }
};

export const _createProduct = async (product: IProduct) => {
  return await ProductModel.create(product);
};

export const _editProduct = async (product: Partial<IProduct>) => {
  return await ProductModel.findByIdAndUpdate(product._id, product, {
    new: true,
  });
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

export async function createCharge({
  currency = "NGN",
  session_duration = 1440,
  max_retry_attempt = 2,
  ...props
}: TransactionRequest) {
  try {
    const res = await axios.post<FlutterwaveResponse>(
      `https://api.flutterwave.com/v3/payments`,
      { currency, session_duration, max_retry_attempt, ...props },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        },
      }
    );

    return res.data;
  } catch (error) {
    throw error;
  }
}

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

  if (!store.isActive) {
    throw new Error(
      "Cannot proceed because this store is not active, please contact support"
    );
  }

  return store;
};

export const areAllProductDigital = (products: IProduct[]) => {
  return products.every((product) => product.isDigital);
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

export const maskAccountNumber = (accountNumber: string): string => {
  if (!accountNumber) return "";

  const lastFourDigits = accountNumber.slice(-4);
  const maskedPortion = "*".repeat(accountNumber.length - 4);

  return maskedPortion + lastFourDigits;
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

    if (!allCategoriesHaveImages) {
      throw new Error(
        "All categories must have images when showImage is enabled."
      );
    }
  }

  return await StoreModel.findOneAndUpdate(
    { _id: storeId },
    partial ? { $set: updates } : updates,
    { runValidators, new: true }
  ).lean();
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
  projection?: Partial<Record<keyof IOrder, 0 | 1>>,
  args?: any
) {
  const order = await OrderModel.findOne(
    { _id: orderId, storeId, ...args },
    projection
  );

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

export async function findProduct(
  product: any,
  throwOn404 = true,
  projection?: Partial<Record<keyof IProduct, 0 | 1>>
) {
  const _product = await ProductModel.findOne(
    typeof product === "string" ? { _id: product } : product,
    projection
  );

  if (throwOn404 && !_product) {
    throw new Error(`Product with this query not found in our database.`);
  }

  return _product;
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

export const verifyStorePaymentOption = (storeId: string) => {
  return false;
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

export const handleIntegrationConnection = async (
  storeId: string,
  integrationId: string,
  shouldToggle = false
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
      flutterwave: {
        chargeCustomers: false,
        storeName: store.storeName,
        storePhoneNumber: phoneNumber,
        useCustomerDetails: false,
      },
      chatbot: {
        name:
          // @ts-ignore
          integration?.integration?.settings?.name || `${store.storeName} AI`,
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
      const i = await IntegrationModel.findOne({
        storeId: storeId,
        "integration.name": integrationId,
      });

      i.integration.settings = settings;
      i.integration.isConnected = shouldToggle ? !isConnected : isConnected;

      await i.save({ validateModifiedOnly: true });
    } else {
      const i = new IntegrationModel({
        storeId: storeId,
        integration: {
          name: integrationId,
          settings,
          isConnected: true,
        },
      });
      await i.save();
    }

    return {
      success: true,
      message: `${integrationId.toUpperCase()} is ${
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

export class StoreBuildAI extends Store {
  //public userId?: string; // Changed from protected to public to match base class
  private systemPrompt: string;
  private chatBotName = "StoreBuild AI";
  private readonly sessionId: string;
  private readonly model: any;
  private isAdmin: boolean;
  private actions: FunctionDeclaration[] = [];
  private userEmail?: string;
  public successProps: any;
  //public storeId: string;

  // Add caching
  private static permissionsCache = new LRUCache({
    max: 500, // Store up to 500 items
    ttl: 1000 * 60 * 5, // Cache for 5 minutes
  });

  private static chatHistoryCache = new LRUCache({
    max: 1000,
    ttl: 1000 * 30, // Cache for 30 seconds
  });

  constructor(
    storeId?: string,
    userId?: string,
    sessionId = "",
    isAdmin = false,
    userEmail?: string
  ) {
    super();
    this.sessionId = sessionId || Date.now() + "";
    this.systemPrompt = "";
    this.isAdmin = isAdmin;
    this.userEmail = userEmail;
    this.storeId = storeId;
    this.userId = userId;

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: this.systemPrompt,
    });
  }

  async getStorePermissions(): Promise<any> {
    const cacheKey = `permissions:${this.storeId}`;
    const cached = StoreBuildAI.permissionsCache.get(cacheKey);
    if (cached) return cached as IChatBotIntegration;

    const integration = await IntegrationModel.findOne({
      storeId: this.storeId,
      "integration.name": "chatbot",
    }).lean();

    if (!integration?.integration?.isConnected) {
      throw new Error(
        "Chat bot is not configured as an integration on this store."
      );
    }

    const permissions = integration.integration.settings;
    StoreBuildAI.permissionsCache.set(cacheKey, permissions);
    return permissions;
  }

  async onSuccess(props?: any): Promise<any> {
    return this.successProps;
  }

  async getChatHistory(): Promise<IChatBotConversation[]> {
    const cacheKey = `history:${this.userId}`;
    const cached = StoreBuildAI.chatHistoryCache.get(cacheKey);
    if (cached) return cached as IChatBotConversation[];

    const skip = await ChatBotConversationModel.countDocuments({
      userId: this.userId,
      sessionId: this.sessionId,
    });

    const history = await ChatBotConversationModel.find({
      userId: this.userId,
      sessionId: this.sessionId,
    })
      .sort({ createdAt: 1 })
      .skip(Math.max(0, skip - 20))
      .limit(20)
      .lean();

    StoreBuildAI.chatHistoryCache.set(cacheKey, history);
    return history;
  }

  // Batch save messages
  private messageQueue: IChatBotConversation[] = [];

  private async batchSaveMessages(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    await ChatBotConversationModel.insertMany(this.messageQueue);
    this.messageQueue = [];
  }

  private queueMessage(message: IChatBotConversation): void {
    this.messageQueue.push(message);
  }

  async customerHelper(query: any): Promise<string> {
    this.systemPrompt = this.buildSystemPrompt(this.storeId);
    // Parallelize all initial data fetching
    const [permissions, storeData] = await Promise.all([
      this.getStorePermissions(),
      findStore(this.storeId, true, {
        customizations: 1,
        storeName: 1,
        createdAt: 1,
        status: 1,
        owner: 1,
      }),
    ]);

    const user = await findUser(storeData.owner, true, { email: 1 });

    this.chatBotName = permissions.name;

    // Use template literals only once
    const contextStr = this.buildContextString(permissions, user);

    this.systemPrompt = this.systemPrompt + contextStr;

    return this.generateResponse(query.question);
  }

  async storeAssistant(query: string) {
    const instructions = this.buildStoreAssistantContext();
    this.systemPrompt = this.buildSystemPrompt(this.storeId);

    this.systemPrompt =
      this.systemPrompt +
      "Addition INFO: Trigger just the function that is required to be done and stop execuation, execuate just one function at a time " +
      instructions;

    const categories = await CategoryModel.find(
      {
        storeId: this.storeId,
      },
      { slot: 1 }
    );

    this.actions = [
      {
        name: "findOrder",
        description: `This function is use to track an order, in a user store and also it requires storeId so use ${this.storeId} as the storeId`,
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            _id: {
              type: SchemaType.STRING,
              description:
                "This is an order Id that will be used to track an order",
            },
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user to provide a storeId use this as the default store ID ${this.storeId}`,
            },
            email: {
              type: SchemaType.STRING,
              description:
                "Prompt the user to provide the email associated with the order, while this is optional its very much required.",
            },
          },
        },
      },
      {
        name: "editStore",
        description:
          "This function is use to change and modify their store customizations and store properties like storeName, aboutStore, descriptions and more This function will only the modified properties, Note: If you do not retrieve an info from the user, do not trigger the function.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeName: {
              type: SchemaType.STRING,
              description:
                "This is the name given to the store and can be modify",
            },
            aboutStore: {
              type: SchemaType.STRING,
              description:
                "This is the about store, like when the store was created and more, If the user wants you can improve the writing for the user",
            },
            description: {
              type: SchemaType.STRING,
              description: "This is the description of the store",
            },
            customizations: {
              type: SchemaType.OBJECT,
              properties: {
                logoUrl: {
                  type: SchemaType.STRING,
                  description: "URl of image of the logo of the store",
                },
                category: {
                  type: SchemaType.OBJECT,
                  properties: {
                    showImage: {
                      type: SchemaType.BOOLEAN,
                      description:
                        "This is to decide whether u want image to show in the store front category section or not",
                    },
                    header: {
                      type: SchemaType.STRING,
                      description:
                        "This is the header to show on header of the category section",
                    },
                  },
                },
                productsPages: {
                  type: SchemaType.OBJECT,
                  description:
                    "This is the products page of the user store front",
                  properties: {
                    canFilter: {
                      type: SchemaType.BOOLEAN,
                      description:
                        "This is turn on when the user wants the page to show a filter button",
                    },
                    canSearch: {
                      type: SchemaType.BOOLEAN,
                      description:
                        "This is turn on when the user wants the page to show a search button",
                    },
                    havePagination: {
                      type: SchemaType.BOOLEAN,
                      description:
                        "This is turn on when users wants the product page to have pagination",
                    },
                  },
                },
                productPage: {
                  type: SchemaType.OBJECT,
                  description:
                    "This is the product page of the user store front",
                  properties: {
                    showSimilarProducts: {
                      type: SchemaType.BOOLEAN,
                      description:
                        "This is turn on when you want the product detail page to show similar products",
                    },
                    style: {
                      type: SchemaType.STRING,
                      enum: ["one", "two", "three"],
                      description:
                        "These are the different styles of the product page",
                    },
                    showReviews: {
                      type: SchemaType.BOOLEAN,
                      description:
                        "This is turn on when the user wants the page to show reviews",
                    },
                  },
                },
                features: {
                  type: SchemaType.OBJECT,
                  description: "This is the features of the user store front",
                  properties: {
                    showFeatures: {
                      type: SchemaType.BOOLEAN,
                      description:
                        "This is turn on when the user wants the page to show features",
                    },
                    style: {
                      type: SchemaType.STRING,
                      enum: ["one", "two", "three"],
                      description:
                        "These are the different styles of the product page",
                    },
                  },
                },
                footer: {
                  type: SchemaType.OBJECT,
                  description: "",
                  properties: {
                    showNewsLetter: {
                      type: SchemaType.BOOLEAN,
                      description:
                        "This is turn on when the user wants the page to show the",
                    },
                    style: {
                      type: SchemaType.STRING,
                      enum: ["one", "two", "three"],
                      description:
                        "These are the different styles of the product page",
                    },
                  },
                },
                theme: {
                  type: SchemaType.OBJECT,
                  description:
                    "When you want to ask the user to change the theme, show the user the available themes and ask the user to choose and then fill the theme, show the user the [name] so it will be user friendly",
                  properties: {
                    name: {
                      type: SchemaType.STRING,
                      description:
                        "This is the name of the color E.g Red, Yellow and Green",
                    },
                    primary: {
                      type: SchemaType.STRING,
                      description: "This is the primary color",
                    },
                    secondary: {
                      type: SchemaType.STRING,
                      description: "This is the secondary color",
                    },
                    id: {
                      type: SchemaType.STRING,
                      description:
                        "This is the id of the color, use the name of the theme as default id but it should be in this format E.g: modern-purple, ocean-blue",
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        name: "deleteProduct",
        description:
          "This function is use to delete a product from the store, Make sure you prompt the user for confirmation before deleting",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            _id: {
              type: SchemaType.STRING,
              description: "This is the id of the product to be deleted",
            },
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user to provide this, use this ${this.storeId} as store Id`,
            },
          },
          required: ["_id"],
        },
      },
      {
        name: "addProducts",
        description:
          "This function is use to add a product to the store, Note: this can only be trigger when it matches the user intent 80%",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user to provide this, use this ${this.storeId} as store Id`,
            },
            productName: {
              type: SchemaType.STRING,
              description: "This is the name of the product",
            },
            description: {
              type: SchemaType.STRING,
              description: "This is the description of the product",
            },
            category: {
              type: SchemaType.STRING,
              description: "This is the category of the product",
              enum: categories.map((category) => category.slot),
            },
            isDigital: {
              type: SchemaType.BOOLEAN,
              description: "This is turn on when the product is digital",
            },
            price: {
              type: SchemaType.OBJECT,
              properties: {
                default: {
                  type: SchemaType.NUMBER,
                  description: "This is the default price of the product",
                },
                useDefaultPricingForDifferentSizes: {
                  type: SchemaType.BOOLEAN,
                  description:
                    "This is when u want to use default pricing for all the sizes",
                },
                sizes: {
                  type: SchemaType.ARRAY,
                  description:
                    "This are the sizes of the product with their prices",
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      size: {
                        type: SchemaType.NUMBER,
                        description: "This is the price of a size",
                      },
                    },
                    required: ["size"],
                  },
                },
              },
            },
            discount: {
              type: SchemaType.NUMBER,
              description: "This is the discount of the product",
            },
            availableSizes: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.STRING,
                description: "This is the available sizes of the product",
                enum: ["M", "S", "L", "XL", "XXL"],
              },
            },
            media: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  url: {
                    type: SchemaType.STRING,
                    description: "This is the url of the media",
                  },
                  altText: {
                    type: SchemaType.STRING,
                    description:
                      "Generate random text according to the product name",
                  },
                  mediaType: {
                    type: SchemaType.STRING,
                    enum: ["image", "video"],
                    description: "This is the type of media",
                  },
                },
                required: ["url"],
              },
            },
            availableColors: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  name: {
                    type: SchemaType.STRING,
                    description: "This is the name of the color",
                  },
                  colorCode: {
                    type: SchemaType.STRING,
                    description: "This is the color code of the color",
                  },
                },
              },
            },
            weight: {
              type: SchemaType.NUMBER,
              description: "This is the weight of the product",
            },
            dimensions: {
              type: SchemaType.OBJECT,
              properties: {
                height: {
                  type: SchemaType.NUMBER,
                  description: "This is the height of the product",
                },
                width: {
                  type: SchemaType.NUMBER,
                  description: "This is the width of the product",
                },
                length: {
                  type: SchemaType.NUMBER,
                  description: "This is the length of the product",
                },
              },
            },
            shippingDetails: {
              type: SchemaType.OBJECT,
              properties: {
                isFreeShipping: {
                  type: SchemaType.BOOLEAN,
                  description:
                    "This is turn on when the product is free shipping",
                },
                shippingRegions: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.STRING,
                    description: "This is the shipping regions of the product",
                  },
                },
                shipAllRegion: {
                  type: SchemaType.BOOLEAN,
                  description:
                    "This is turn on when the product is free shipping",
                },
              },
            },
          },
          required: [
            "productName",
            "description",
            "media",
            "category",
            "isDigital",
            "price",
            "discount",
            "availableSizes",
            "availableColors",
            "weight",
            "dimensions",
            "shippingDetails",
          ],
        },
      },
      {
        name: "storeAnalytics",
        description:
          "This function helps get the analytics of the store, give the user a hint on where to inprove store performance",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default.`,
            },
          },
        },
      },
      {
        name: "getOrderAnalytics",
        description:
          "This function is use to get the order analytics of the store",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not query the user about the store Id, use ${this.storeId} as default`,
            },
          },
        },
      },
      {
        name: "createCoupon",
        description:
          "This is a function that allow the user to create a coupon to give discount to customers",
        parameters: {
          type: SchemaType.OBJECT,
          description: "",
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `This is the store Id use, do not prompt the user to provide one, use ${this.storeId} as default`,
            },
            couponCode: {
              type: SchemaType.STRING,
              description:
                "This is the code of the coupon, you can help the user to generate a random code that is 8 characters long",
            },
            expirationDate: {
              type: SchemaType.STRING,
              description:
                "This is the expiration date of the coupon, if the user did not want to provide use 30days as default in ISO string, Note if the user provides the am expiration time please understand the context and try and convert it to ISO-String",
            },
            selectedProducts: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.STRING,
                description: "This is the ids of the product",
              },
            },
            selectedCategories: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.STRING,
                description:
                  "This is the ids of the category, This is Optional",
                enum: categories.map((category) => category.slot),
              },
            },
            appliedTo: {
              type: SchemaType.STRING,
              enum: ["shoppingCart", "products"],
              description:
                "Ask this question before asking for selected products because selected product is only required if the appliedTo is products else its optional",
            },
            type: {
              type: SchemaType.STRING,
              enum: ["percentageCoupon", "nairaCoupon"],
            },
            discountValue: {
              type: SchemaType.NUMBER,
              description: "This is the discount value",
            },
            maxUsage: {
              type: SchemaType.NUMBER,
              description:
                "This is the maximum number of times the coupon can be used",
            },
            customerUsage: {
              type: SchemaType.OBJECT,
              properties: {
                maxUsagePerCustomer: {
                  type: SchemaType.NUMBER,
                },
              },
            },
          },
          required: ["discountValue", "appliedTo", "maxUsage"],
        },
      },
      {
        name: "connectIntegration",
        description:
          "This function is use to connect integrations in the store, The available integrations that can be connected are sendbox, chatbot, unsplash, paystack and instagram, If the chatBot integration return an error saying you need to subcribe first to use chat, suggest to the user where they want to subscribe and if they agree trigger the [subcribeToChatBot]",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
            integrationName: {
              type: SchemaType.STRING,
              description: "This is the name of the integration",
              enum: ["sendbox", "chatbot", "unsplash", "paystack", "instagram"],
            },
          },
        },
      },
      {
        name: "referralStats",
        description:
          "This is use to get the referral stats of the store, you can perform analysis base on the user prompt",
        parameters: {
          type: SchemaType.OBJECT,
          description: "This are the parameters required or some optional ones",
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
          },
        },
      },
      {
        name: "getUser",
        description:
          "This is use to get the user i.e the owner of the store, using the userId, this returns the user email, createdAt, fullName and _id",
        parameters: {
          type: SchemaType.OBJECT,
          description: "",
          properties: {
            userId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.userId} as default`,
            },
          },
        },
      },
      {
        name: "getOrders",
        description:
          "This is use to get orders and perform analytics on the orders base on the user query, you can also use it to get best customers, customers are gotten using with the only order that the orderStatus is completed.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
          },
        },
      },
      {
        name: "calculateDeliveryCost",
        description:
          "This is use to calculate the delivery cost of the store, first show the user the products to select from triggering the [getProducts] function, then populate the products field with the data of the selected product",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            customerDetails: {
              type: SchemaType.OBJECT,
              description: `This are details of the user, with contains, email, name,phone number, you can optionally use the [getUser] to populate the data if the user wants you to use it.`,
              properties: {
                email: {
                  type: SchemaType.STRING,
                  description:
                    "This is an email and make sure that this email is a valid email",
                },
                phoneNumber: {
                  type: SchemaType.STRING,
                  description: "This is the number of the customer",
                },
                name: {
                  type: SchemaType.STRING,
                  description: "This is the name of the customer",
                },
                shippingDetails: {
                  type: SchemaType.OBJECT,
                  properties: {
                    addressLine1: {
                      type: SchemaType.STRING,
                      description: "This is the address of the customer",
                    },
                    addressLine2: {
                      type: SchemaType.STRING,
                      description: "This is the address of the customer",
                    },
                    city: {
                      type: SchemaType.STRING,
                      description: "This is the city of the customer",
                    },
                    state: {
                      type: SchemaType.STRING,
                      description: "This is the state of the customer",
                    },
                    postalCode: {
                      type: SchemaType.STRING,
                      description: "This is the postal code of the customer",
                    },
                    country: {
                      type: SchemaType.STRING,
                      description: "This is the country of the customer",
                    },
                  },
                  required: ["state", "country", "city"],
                },
              },
            },
            totalAmount: {
              type: SchemaType.NUMBER,
              description:
                "This is the total amount of the order, Note this, use the products the user selects to sum use the amount of the order and then populate this field, except the user wants to provide the amount themselves.",
            },
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
            products: {
              type: SchemaType.ARRAY,
              description:
                "Do not prompt the user to provide this, This are the products that the user selects to calculate the delivery cost, also prompt the use the quantity and the size they want if neccessary and if the use did not provide the quantity use 1 as the quantity for each product.",
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  storeId: {
                    type: SchemaType.STRING,
                    description: `Do not prompt the user to provide this, use this ${this.storeId} as store Id`,
                  },
                  productName: {
                    type: SchemaType.STRING,
                    description: "This is the name of the product",
                  },
                  description: {
                    type: SchemaType.STRING,
                    description: "This is the description of the product",
                  },
                  category: {
                    type: SchemaType.STRING,
                    description: "This is the category of the product",
                    enum: categories.map((category) => category.slot),
                  },
                  isDigital: {
                    type: SchemaType.BOOLEAN,
                    description: "This is turn on when the product is digital",
                  },
                  price: {
                    type: SchemaType.OBJECT,
                    properties: {
                      default: {
                        type: SchemaType.NUMBER,
                        description: "This is the default price of the product",
                      },
                      useDefaultPricingForDifferentSizes: {
                        type: SchemaType.BOOLEAN,
                        description:
                          "This is when u want to use default pricing for all the sizes",
                      },
                      sizes: {
                        type: SchemaType.ARRAY,
                        description:
                          "This are the sizes of the product with their prices",
                        items: {
                          type: SchemaType.OBJECT,
                          properties: {
                            size: {
                              type: SchemaType.NUMBER,
                              description: "This is the price of a size",
                            },
                          },
                          required: ["size"],
                        },
                      },
                    },
                  },
                  discount: {
                    type: SchemaType.NUMBER,
                    description: "This is the discount of the product",
                  },
                  availableSizes: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.STRING,
                      description: "This is the available sizes of the product",
                      enum: ["M", "S", "L", "XL", "XXL"],
                    },
                  },
                  media: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        url: {
                          type: SchemaType.STRING,
                          description: "This is the url of the media",
                        },
                        altText: {
                          type: SchemaType.STRING,
                          description:
                            "Generate random text according to the product name",
                        },
                        mediaType: {
                          type: SchemaType.STRING,
                          enum: ["image", "video"],
                          description: "This is the type of media",
                        },
                      },
                      required: ["url"],
                    },
                  },
                  availableColors: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        name: {
                          type: SchemaType.STRING,
                          description: "This is the name of the color",
                        },
                        colorCode: {
                          type: SchemaType.STRING,
                          description: "This is the color code of the color",
                        },
                      },
                    },
                  },
                  weight: {
                    type: SchemaType.NUMBER,
                    description: "This is the weight of the product",
                  },
                  dimensions: {
                    type: SchemaType.OBJECT,
                    properties: {
                      height: {
                        type: SchemaType.NUMBER,
                        description: "This is the height of the product",
                      },
                      width: {
                        type: SchemaType.NUMBER,
                        description: "This is the width of the product",
                      },
                      length: {
                        type: SchemaType.NUMBER,
                        description: "This is the length of the product",
                      },
                    },
                  },
                  shippingDetails: {
                    type: SchemaType.OBJECT,
                    properties: {
                      isFreeShipping: {
                        type: SchemaType.BOOLEAN,
                        description:
                          "This is turn on when the product is free shipping",
                      },
                      shippingRegions: {
                        type: SchemaType.ARRAY,
                        items: {
                          type: SchemaType.STRING,
                          description:
                            "This is the shipping regions of the product",
                        },
                      },
                      shipAllRegion: {
                        type: SchemaType.BOOLEAN,
                        description:
                          "This is turn on when the product is free shipping",
                      },
                    },
                  },
                },
              },
            },
          },
          required: ["customerDetails"],
        },
      },
      {
        name: "getProduct",
        description: `This is use to compare products of the store, perform analytics base on user queries with the products, ${
          this.isAdmin ? "you can also suggest pricing and discounts" : ""
        }, learn about the product using your knowledge base and advise the user, do not return the entire list of the product even if you are ask to just return ${
          this.isAdmin ? "50" : "10"
        } products`,
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
            _id: {
              type: SchemaType.STRING,
              description:
                "This is the id of the product, This is not neccessary but its better to provide it for faster query",
            },
            productName: {
              type: SchemaType.STRING,
              description:
                "This is the name of the product, it can be use to query and look for the product",
            },
            description: {
              type: SchemaType.STRING,
              description:
                "This is the product description and you can use it query the product",
            },
          },
        },
      },
      {
        name: "compareProducts",
        description:
          "Use this function if a user wants to compare products in the store",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use this ${this.storeId} as default`,
            },
            productOne: {
              type: SchemaType.OBJECT,
              description:
                "One of the following must be provided before you proceed either the user prompt for the _id or the product name",
              properties: {
                _id: {
                  type: SchemaType.STRING,
                  description: "This is the id of the first product",
                },
                productName: {
                  type: SchemaType.STRING,
                  description: "This is the name of the first product",
                },
              },
            },
            productTwo: {
              type: SchemaType.OBJECT,
              description:
                "One of the properties must be provided before you can proceed, either you the user prompt for the _id or the product name",
              properties: {
                _id: {
                  type: SchemaType.STRING,
                  description: "This is the id of the second product",
                },
                productName: {
                  type: SchemaType.STRING,
                  description: "This is the name of the second product",
                },
              },
            },
          },
        },
      },
      {
        name: "getProducts",
        description:
          "This is use to get products of the store and can perform analytics that matches the user query",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
          },
        },
      },
      {
        name: "subscribeToChat",
        description:
          "This is use to subscribe to the chatbot, chatbot cannot be connected using the connectIntegration function because to connect a chatbot to a store, the user need to pay a fee of N2000 which will be deducted from their store balance, so when the user agree then trigger the function, also Note that if the subscription is cancelled then they loose their access to the chatbot.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
          },
        },
      },
      {
        name: "getIntegrations",
        description: "This is use to get the integrations of the store",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
          },
        },
      },
      {
        name: "createPickUp",
        description:
          "This is use to create a pickup of an order, It uses sendBox as the delivery partner",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            orderId: {
              type: SchemaType.STRING,
              description: "This is the order Id needed to create the pickup",
            },
            pickUpType: {
              type: SchemaType.STRING,
              description: `This is the type of the pickup type`,
              enum: ["pickup", "dropoff"],
            },
            estimatedDeliveryDate: {
              type: SchemaType.STRING,
              description:
                "This is the time of estimated delivery time, which you will always convert to ISO string",
            },
          },
          required: ["orderId", "pickUpType", "estimatedDeliveryDate"],
        },
      },
    ];

    return this.generateResponse(query);
  }

  // This use gemini-API to generate response.
  private async generateResponse(prompt: string | string[]): Promise<string> {
    let response: string = "";

    try {
      this.queueMessage({
        actionPerformed: "None",
        intent: "",
        metadata: {
          confidenceScore: 1,
          model: "gemini-flash-2.0-pro",
          tokensUsed: 0,
        },
        sessionId: this.sessionId,
        userId: this.userId,
        userPrompt: prompt as string,
      });

      const chatHistory = await this.getChatHistory();
      const formattedHistory = this.formatChatHistory(chatHistory);

      const payment = new PaymentService(this.storeId);
      const sendBox = new SendBox(this.storeId, true, true);

      // Public function declearations
      const funcDeclearations: FunctionDeclaration[] = [
        {
          name: "storeData",
          description:
            "This is use to get details about the store like, the store name, about store, descriptions",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              storeId: {
                type: SchemaType.STRING,
                description: `Do not prompt the user about this, use ${this.storeId} as default`,
              },
            },
          },
        },
      ];

      const chatSession = this.model.startChat({
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 1000,
          responseMimeType: "text/plain",
        },
        history: formattedHistory,
        tools: [
          {
            functionDeclarations: [...this.actions, ...funcDeclearations],
          },
        ],
      });

      const result = await chatSession.sendMessage(prompt);
      response = result.response.text();

      const _functionCall = result?.response?.functionCalls()?.[0];

      // Enhanced function detection and execution logic
      if (_functionCall) {
        let r;

        switch (_functionCall["name"]) {
          case "findOrder":
            try {
              r = await findOrder(
                _functionCall["args"]["_id"],
                this.storeId,
                true,
                undefined,
                { "customerDetails.email": _functionCall["args"]["email"] }
              );
            } catch (error) {
              return (error as Error).message;
            }

            break;
          case "sendEmail":
            try {
              await sendEmail(
                _functionCall["args"]["adminEmail"],
                _functionCall["args"]["body"],
                _functionCall["args"]["email"],
                _functionCall["args"]["subject"]
              );

              r = `Email sent to ${_functionCall["args"]["email"]} successfully`;
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "storeAnalytics":
            const res = await calculateMetrics(
              "all",
              _functionCall["args"]["storeId"]
            );
            r = { ...res };
            break;
          case "getOrderAnalytics":
            try {
              r = await getOrderStats(_functionCall["args"]["storeId"]);
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "storeData":
            try {
              const { storeName, status, aboutStore, description, owner } =
                await findStore(_functionCall["args"]["storeId"], true, {
                  storeName: 1,
                  status: 1,
                  aboutStore: 1,
                  description: 1,
                  owner: 1,
                });

              r = {
                storeName,
                status,
                aboutStore,
                description,
                owner,
              };
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "editStore":
            try {
              const store = await _editStore(
                this.storeId,
                _functionCall["args"],
                true
              );

              r = { ...store };
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "addProducts":
            try {
              const products = new ProductModel(_functionCall["args"]);
              r = await products.save({ validateBeforeSave: true });
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "createCoupon":
            try {
              const coupon = new Coupon({
                storeId: this.storeId,
                ..._functionCall["args"],
              });

              r = await coupon.save();
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "getProduct":
            try {
              let product;

              if (_functionCall["args"]["_id"]) {
                product = await findProduct(_functionCall["args"]["_id"]);
              } else {
                product = await findProduct({
                  productName: {
                    $regex: new RegExp(
                      _functionCall["args"]["productName"],
                      "i"
                    ),
                  },
                  description: {
                    $regex: new RegExp(
                      _functionCall["args"]["description"],
                      "i"
                    ),
                  },
                });
              }

              r = !!Object.keys(product).length ? { ...product } : "Not found";
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "compareProducts":
            try {
              const productOne = _functionCall["args"]["productOne"];
              const productTwo = _functionCall["args"]["productTwo"];

              if (productOne && productTwo) {
                let product1;
                let product2;

                if (productOne["_id"]) {
                  product1 = await findProduct(productOne["_id"]);
                } else {
                  product1 = await findProduct({
                    productName: {
                      $regex: new RegExp(productOne["productName"], "i"),
                    },
                  });
                }

                if (productTwo["_id"]) {
                  product2 = await findProduct(productTwo["_id"]);
                } else {
                  product2 = await findProduct({
                    productName: {
                      $regex: new RegExp(productOne["productName"], "i"),
                    },
                  });
                }

                r = { product1, product2 };
              } else {
                r = "The user fail to provide one of the require parameter";
              }
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "connectIntegration":
            try {
              const { integrationName } = _functionCall["args"];
              const integration = await handleIntegrationConnection(
                this.storeId,
                integrationName
              );
              r = integration.message;
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "referralStats":
            try {
              const store = await findStore(this.storeId, true, {
                owner: 1,
              });
              const { _id: userId } = await findUser(store.owner, true, {
                _id: 1,
              });
              const response = await ReferralModel.aggregate(
                referralPipeLine(userId)
              );

              const referralData = {
                totalReferrals: response?.[0]?.totalReferrals || 0,
                totalEarnings: response?.[0]?.totalEarnings || 0,
                referrals: response?.[0]?.referral?.join(", ") || "Zero",
              };

              r = {
                result: referralData,
              };
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "getUser":
            try {
              r = await findUser(this.userId, true, {
                fullName: 1,
                email: 1,
                createdAt: 1,
                _id: 1,
              });
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "getProducts":
            try {
              const products = await ProductModel.find({
                storeId: this.storeId,
              });

              r = {
                products,
              };
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "getOrders":
            try {
              const orders = await OrderModel.find({
                storeId: this.storeId,
              });

              r = {
                orders,
              };
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "calculateDeliveryCost":
            try {
              const res = await calculateDeliveryCost(
                _functionCall["args"]["customerDetails"],
                _functionCall["args"]["totalAmount"],
                this.storeId,
                _functionCall["args"]["products"]
              );

              r = { res };
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "getStoreDetails":
            try {
              const [store, storeOwner] = await Promise.all([
                findStore(this.storeId, true, {
                  customizations: 1,
                  storeName: 1,
                  createdAt: 1,
                  status: 1,
                  owner: 1,
                  productType: 1,
                  aboutStore: 1,
                  description: 1,
                }),
                findUser(_functionCall["args"]["userId"], true),
              ]);

              r = {
                store,
                storeOwner,
              };
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "subscribeToChat":
            try {
              r = await payment.subscribeForAI();
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "getIntegrations":
            try {
              r = await IntegrationModel.find({
                storeId: this.storeId,
              });
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "deleteProduct":
            try {
              r = await ProductModel.findByIdAndDelete(
                _functionCall["args"]["_id"]
              );
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "createPickUp":
            try {
              r = await sendBox.createShipment(
                {
                  pickUpDate: _functionCall["args"]["pickUpType"],
                  packageType: "general",
                },
                _functionCall["args"]["orderId"],
                true
              );
            } catch (error) {
              return (error as Error).message;
            }
            break;
          case "getProductTypes":
            try {
              r = await ProductTypesModel.find({});
            } catch (error) {
              r = (error as Error).message;
            }
            break;
          case "generateStore":
            try {
              const user = await this.createAccount({
                email: _functionCall["args"]["email"],
                fullName: _functionCall["args"]["fullName"],
              });

              await this.createStore({
                owner: user._id,
                storeName: _functionCall["args"]["storeName"],
                productType: _functionCall["args"]["productType"],
                templateId: _functionCall["args"]["templateId"],
              });

              await this.sendOTP({
                email: _functionCall["args"]["email"],
                tokenFor: "login",
                storeName: _functionCall["args"]["storeName"],
              });

              this.successProps = { showVerifyOTPModal: true };
            } catch (error) {
              r = (error as Error).message;
            }
            break;
          case "verifyOTP":
            try {
              const message = await this.verifyOTP({
                email: _functionCall["args"]["otp"],
                token: this.userEmail,
              });

              r = message;
            } catch (error) {
              r = (error as Error).message;
            }
            break;
          default:
            break;
        }

        const res = await chatSession.sendMessage([
          {
            functionResponse: {
              name: _functionCall["name"],
              response: { r },
            },
          },
        ]);

        response = res.response.text();
      }

      this.queueMessage({
        actionPerformed: "None",
        aiResponse: response,
        intent: _functionCall?.["name"] || "",
        metadata: {
          confidenceScore: 1,
          model: "gemini-flash-2.0-pro",
          tokensUsed: result.response.usageMetadata.totalTokenCount,
        },
        sessionId: this.sessionId,
        userId: this.userId,
        userPrompt: prompt as string,
      });

      await this.batchSaveMessages();

      return response;
    } catch (error) {
      console.error("Error generating AI response:", error);
      throw new Error("Failed to generate AI response");
    }
  }

  private formatChatHistory(conversations: IChatBotConversation[]): Content[] {
    return conversations.map((conv) => ({
      parts: [{ text: conv.userPrompt ? conv.userPrompt : conv.aiResponse }],
      role: conv.userPrompt ? "user" : "model",
    }));
  }

  private buildSystemPrompt(storeId: string): string {
    return `
  You are an AI assistant specialized in e-commerce and store management. Your role is to assist with customer services like sending messages to support, tracking orders, comparing products, and making inquiries about products. Always maintain a professional, concise, and helpful tone.
  
  Your name is Store Build AI
  
  Guidelines:
  1. Focus on Store-Related Tasks:
     - You are restricted to answering questions and handling tasks related to this specific store.
     - Do not respond to questions or tasks outside the scope of e-commerce or this store's operations.
  
  2. Handling Casual Conversations:
     - You may respond to casual messages like greetings or small talk.
     - If a casual question touches on a restricted or unrelated topic, do not provide an answer.
  
  3. Function Calls:
     - Only make function calls when the user's intent explicitly matches the purpose of the function.
     - Do not call a function unless the user has provided all required information for it.
  
  4. Handling storeId:
     - Some functions require a storeId parameter. Use the following storeId: ${storeId}
     - Do not ask the user for the storeId or reveal it in any way.

     The website has the following pages with these functions:

    - Home Page (/): The main landing page providing an overview of the platform.
    - Features Section (#features): Highlights key features and capabilities of the platform.
    - Subscribe Section (#subscribe): Allows visitors to subscribe to newsletters or updates.
    - Sign Up (/sign-up): New user registration page.
    - Sign In (/sign-in): Existing user login page.
    - Dashboard (/store-dashboard/): Central hub showing store performance metrics, recent orders, and key statistics.
    - Store Products (/store-products/): Manage inventory, add new products, edit details, and set pricing.
    - Store Front (/store-front/): Customize the appearance of the customer-facing store, including themes and layouts.
    - Store Orders (/store-orders/): View, process, and manage all customer orders and transaction history.
    - Store Settings (/store-settings/): Configure general store settings like payment methods, shipping options, and store policies.
    - Store Customers (/store-customers/): Manage customer accounts, view purchase history, and handle customer relationships.
    - Store Integrations (/store-integrations/): Connect and manage third-party services and plugins.
    - Store (/store/): The customer-facing storefront where visitors can browse and purchase products.
    - Store Coupon (/store/coupon/): Page for customers to apply and manage discount coupons and promotional offers.

    This are the available themes on the website
    ${JSON.stringify(themes, null, 2)}
    If use ask of it return it
  
  Important:
  - Never deviate from the context of this store.
  - Maintain accuracy, professionalism, and confidentiality while assisting users.
  - The store currency is in Naira so always use naira
  `;
  }

  private buildContextString(permissions: any, user: any): string {
    const { permissions: p } = permissions;

    if (p.allowOrderAccess) {
      this.actions.push({
        name: "findOrder",
        description: `This function is use to track an order, in a user store and also it requires storeId so use ${this.storeId} as the storeId`,
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            _id: {
              type: SchemaType.STRING,
              description:
                "This is an order Id that will be used to track an order",
            },
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user to provide a storeId use this as the default store ID ${this.storeId}`,
            },
            email: {
              type: SchemaType.STRING,
              description:
                "This is the email related to the order and its required because of security and privacy issues",
            },
          },
          required: ["_id", "email"],
        },
      });
    }

    if (!p.allowCustomerAccess) {
      this.actions = [];
    } else {
      const actions: FunctionDeclaration[] = [
        {
          name: "compareProducts",
          description:
            "Use this function if a user wants to compare products in the store",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              storeId: {
                type: SchemaType.STRING,
                description: `Do not prompt the user about this, use this ${this.storeId} as default`,
              },
              productOne: {
                type: SchemaType.OBJECT,
                description:
                  "One of the following must be provided before you proceed either the user prompt for the _id or the product name",
                properties: {
                  _id: {
                    type: SchemaType.STRING,
                    description: "This is the id of the first product",
                  },
                  productName: {
                    type: SchemaType.STRING,
                    description: "This is the name of the first product",
                  },
                },
              },
              productTwo: {
                type: SchemaType.OBJECT,
                description:
                  "One of the properties must be provided before you can proceed, either you the user prompt for the _id or the product name",
                properties: {
                  _id: {
                    type: SchemaType.STRING,
                    description: "This is the id of the second product",
                  },
                  productName: {
                    type: SchemaType.STRING,
                    description: "This is the name of the second product",
                  },
                },
              },
            },
          },
        },
        {
          name: "getProducts",
          description:
            "This is use to get products of the store and can perform analytics that matches the user query",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              storeId: {
                type: SchemaType.STRING,
                description: `Do not prompt the user about this, use ${this.storeId} as default`,
              },
            },
          },
        },
        {
          name: "sendEmail",
          description: "",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              email: {
                type: SchemaType.STRING,
                description: "This is the email of the recipient",
              },
              subject: {
                type: SchemaType.STRING,
                description:
                  "This is the subject of the email -Improve the content",
              },
              body: {
                type: SchemaType.STRING,
                description:
                  "This is the body of the email --Return an html that us beautiful",
              },
              adminEmail: {
                type: SchemaType.STRING,
                description: `Do not prompt the user about this use this as default ${user.email}`,
              },
            },
            required: ["email", "subject", "body"],
          },
        },
        {
          name: "getStoreDetails",
          description:
            "You can use this to get store details are like the support email or customer support or owner email, store name, store description, store about us, the store theme",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              storeId: {
                type: SchemaType.STRING,
                description: `Do not prompt the user about this, use ${this.storeId} as default`,
              },
              userId: {
                type: SchemaType.STRING,
                description: `Do not prompt the user about this, use ${user._id} as default`,
              },
            },
          },
        },
      ];

      this.actions = [...this.actions, ...actions];
    }

    if (p.allowProductAccess) {
      this.actions.push({
        name: "getProduct",
        description: `This is use to compare products of the store, perform analytics base on user queries with the products, ${
          this.isAdmin ? "you can also suggest pricing and discounts" : ""
        }, learn about the product using your knowledge base and advise the user, do not return the entire list of the product even if you are ask to just return ${
          this.isAdmin ? "50" : "10"
        } products`,
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            storeId: {
              type: SchemaType.STRING,
              description: `Do not prompt the user about this, use ${this.storeId} as default`,
            },
            _id: {
              type: SchemaType.STRING,
              description:
                "This is the id of the product, This is not neccessary but its better to provide it for faster query",
            },
            productName: {
              type: SchemaType.STRING,
              description:
                "This is the name of the product, it can be use to query and look for the product",
            },
            description: {
              type: SchemaType.STRING,
              description:
                "This is the product description and you can use it query the product",
            },
          },
        },
      });
    }

    return `
    AI_Name: ${this.chatBotName}
    Language_To_Use: "English"

    Permissions:
    - Product Queries: ${p.allowProductAccess ? `Enabled` : "Disabled"}
    - Customer Queries: ${p.allowCustomerAccess ? ` Enabled` : "Disabled"}
    - Order Queries: ${p.allowOrderAccess ? `Enabled` : "Disabled"}`;
  }

  private buildStoreAssistantContext() {
    const instructions = `
    General Behavior
    Be professional, concise, and helpful in all interactions.
    Ensure responses are clear and aligned with the user's intent.
    Prioritize user privacy and security; never expose sensitive information.
    Use functions or system actions only when appropriate, based on user requests and available permissions.
    `;

    return instructions;
  }

  async rateLimiter(limiter = 2) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000); // Subtract 1 minute from the current time

    const chat = await ChatBotConversationModel.find({
      userId: this.userId,
      sessionId: this.sessionId,
      aiResponse: {
        $gte: 1,
      },
      createdAt: {
        $gte: oneMinuteAgo,
      },
    });

    if (chat.length >= limiter) {
      throw new Error(
        "RATE_LIMIT_EXCEEDED: This bot only accepts two messages per minute"
      );
    }
  }

  async aiSuggestions() {
    const now = new Date();

    const user = await UserModel.findById(this.userId);

    if (!user) {
      throw new Error("User not found");
    }

    const { expiredAt, type } = user?.plan || {};

    const expire = new Date(expiredAt);

    if (now > expire) {
      user.plan = {
        ...user.plan,
        type: "free",
      };

      await user.save({ validateModifiedOnly: true });

      throw new Error("Your subscription has expired");
    }

    const suggestions = await AISuggestionModel.find({
      storeId: this.storeId,
      createdAt: { $gte: new Date().setHours(0, 0, 0, 0) },
    }).lean();

    if (!!suggestions.length) {
      console.log("Requested");
      return suggestions;
    }

    const store = await StoreModel.findOne(
      {
        owner: this.userId,
      },
      { _id: 1 }
    );

    const storeProducts = await ProductModel.find({
      storeId: store?._id,
    });

    const storeOrders = await OrderModel.find({
      storeId: store?._id,
    });

    const storeTransactions = await TransactionModel.find({
      storeId: store?._id,
      paymentFor: "order",
      paymentChannel: "flutterwave",
      type: "Payment",
    });

    // Calculate key metrics
    const totalProducts = storeProducts.length;
    const totalOrders = storeOrders.length;
    const totalRevenue = storeTransactions.reduce(
      (sum, transaction) => sum + (transaction.amount || 0),
      0
    );

    // Get product categories and their performance
    const productCategories: Record<string, any> = {};
    storeProducts.forEach((product) => {
      const category = product.category || "Uncategorized";
      if (!productCategories[category]) {
        productCategories[category] = {
          count: 0,
          revenue: 0,
          orders: 0,
        };
      }
      productCategories[category].count++;
    });

    // Get top selling products
    const productSales = storeProducts
      .map((product) => {
        const productOrders = storeOrders.filter((order) =>
          order.products?.some(
            (item) => item._id?.toString() === product._id?.toString()
          )
        );

        const totalSold = productOrders.reduce((sum, order) => {
          const item = order.products?.find(
            (item) => item._id?.toString() === product._id?.toString()
          );
          return sum + (item?.quantity || 0);
        }, 0);

        // Update category revenue and orders
        const category = product.category || "Uncategorized";
        if (productCategories[category]) {
          productCategories[category].revenue +=
            totalSold * (product.price.default || 0);
          productCategories[category].orders += totalSold;
        }

        return {
          productId: product._id,
          name: product.productName,
          category: product.category || "Uncategorized",
          totalSold,
          revenue: totalSold * (product.price.default || 0),
        };
      })
      .sort((a, b) => b.totalSold - a.totalSold);

    const topProducts = productSales.slice(0, 5);

    // Get order status distribution
    const orderStatusCounts: Record<string, any> = {};
    storeOrders.forEach((order) => {
      const status = order.orderStatus || "Pending";
      orderStatusCounts[status] = (orderStatusCounts[status] || 0) + 1;
    });

    // Get recent sales trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrders = storeOrders.filter(
      (order) => new Date(order.createdAt) >= thirtyDaysAgo
    );

    const dailySales: Record<string, any> = {};
    recentOrders.forEach((order) => {
      const date = new Date(order.createdAt).toISOString().split("T")[0];
      dailySales[date] = (dailySales[date] || 0) + 1;
    });

    // Format the data for the prompt
    const salesTrend = Object.entries(dailySales)
      .map(([date, count]) => `${date}: ${count} orders`)
      .join("\n");

    const topProductsList = topProducts
      .map(
        (product, index) =>
          `${index + 1}. ${product.name} (${product.category}): ${
            product.totalSold
          } units sold, Revenue: ${product.revenue}`
      )
      .join("\n");

    const categoryAnalysis = Object.entries(productCategories)
      .map(
        ([category, data]) =>
          `${category}: ${data.count} products, ${data.orders} orders, Revenue: ${data.revenue}`
      )
      .join("\n");

    const orderStatusAnalysis = Object.entries(orderStatusCounts)
      .map(([status, count]) => `${status}: ${count} orders`)
      .join("\n");

    const instructions = `
   You are a business analytics expert providing insights and suggestions for an e-commerce store owner.
   
   Below are the data of a user online store, help analyze and suggest improvements.
   
   STORE ANALYTICS:
   - Total Products: ${totalProducts}
   - Total Orders: ${totalOrders}
   - Total Revenue: ${totalRevenue}
   
   CATEGORY ANALYSIS:
   ${categoryAnalysis}
   
   TOP SELLING PRODUCTS:
   ${topProductsList}
   
   ORDER STATUS DISTRIBUTION:
   ${orderStatusAnalysis}
   
   RECENT SALES TREND (LAST 30 DAYS):
   ${salesTrend}
   
   Based on this data, generate EXACTLY 3 business suggestions in the following JSON format:
   [
     {
       "title": "Short, actionable title for the suggestion",
       "description": "Detailed explanation with specific insights from the data",
       "action": "Call-to-action button text"
     },
     ...
   ]
   
   Each suggestion should:
   1. Be based on actual patterns in the data
   2. Include specific references to products, categories, or metrics
   3. Provide actionable advice the store owner can implement
   4. Have a relevant action button text that makes sense for the suggestion
   
   IMPORTANT: Return ONLY the JSON array with exactly 3 suggestions. No introduction, explanation or other text.
   
   Do not ask the user questions just suggest improve to the user online store
 `;

    this.systemPrompt = instructions;

    const chatSession = this.model.startChat({
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
      },
    });

    const result = await chatSession.sendMessage(this.systemPrompt);
    const response = result.response.text();

    //@ts-ignore
    const r = JSON.parse(response).map((res) => ({
      ...res,
      storeId: this.storeId,
    }));

    const _suggestions = await AISuggestionModel.insertMany(r);

    return _suggestions;
  }
}

export function formatChatHistory(
  conversations: IChatBotConversation[]
): Content[] {
  return conversations.map((conv) => ({
    parts: [{ text: conv.userPrompt || conv.aiResponse }],
    role: conv.userPrompt ? "user" : "model",
  }));
}

export const validateIntegrationSubscription = async (
  storeId: string,
  integrationId: string
) => {
  const now = new Date();

  const subscription = await IntegrationSubscriptionModel.findOne({
    storeId,
    integrationId,
    expiredAt: { $gte: now.toISOString() },
    isActive: true,
  });

  return subscription;
};

export const isProfileComplete = async (userId: string, storeId: string) => {
  // Check for emailVerification, checkIfUserHasAddAProduct, checkBankAccountVerification

  const [user, productExist] = await Promise.all([
    findUser(userId, true, { isEmailVerified: 1 }),
    ProductModel.exists({ storeId }),
  ]);

  return Boolean(user.isEmailVerified && productExist);
};
