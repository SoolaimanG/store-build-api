import mongoose, { Document, mongo } from "mongoose";
import {
  ICategory,
  IChatBotConversation,
  ICustomerAddress,
  IDedicatedAccount,
  IIntegrationSubscription,
  INewsLetter,
  Integration,
  IntegrationProps,
  IOrder,
  IOrderPaymentDetails,
  IOTP,
  IPaymentDetails,
  IProduct,
  IRating,
  IReferral,
  ISection,
  IStore,
  IStoreBankAccounts,
  IStoreHeroSection,
  IStoreSettings,
  IStoreTheme,
  ISubscription,
  ITransaction,
  ITutorial,
  IUser,
  Metadata,
  PATHS,
} from "./types";
import {
  findStore,
  findUser,
  generateRandomString,
  handleIntegrationConnection,
  sendEmail,
  validateIntegrationSubscription,
} from "./helper";
import { config, themes } from "./constant";
import axios from "axios";
import {
  balanceUpdatedEmail,
  generateAdminOrderNotificationEmail,
  generateManualPaymentEmail,
  generateOrderCompletionEmail,
  generateOrderEmailWithPaymentLink,
  generateWelcomeEmail,
  subscriptionSuccessful,
} from "./emails";
import { Account, Store } from "./server-utils";

interface ICoupon extends Document {
  storeId: string;
  couponCode?: string;
  expirationDate: Date;
  selectedProducts: string[];
  selectedCategories: string[];
  appliedTo: "shoppingCart" | "products";
  type: "percentageCoupon" | "nairaCoupon";
  discountValue: number;
  maxUsage: number;
  customerUsage?: Record<string, number>;
  createdAt?: Date;
  updatedAt?: Date;
}

export const NewsLetterSchema = new mongoose.Schema<INewsLetter>(
  {
    email: { type: String, required: true },
    joinedFrom: { type: String, enum: ["input", "modal"], default: "input" },
  },
  { timestamps: true }
);

export const ProductTypeSchema = new mongoose.Schema({
  name: { type: String },
  icon: { type: String },
});

export const UserSchema = new mongoose.Schema<IUser>(
  {
    phoneNumber: {
      type: String,
      validate: {
        async validator(phoneNumber: string) {
          try {
            const res = await axios.get<{ is_valid: boolean }>(
              `https://validate-phone-by-api-ninjas.p.rapidapi.com/v1/validatephone?number=${phoneNumber}&country=NG`,
              {
                headers: {
                  "x-rapidapi-host": config["X-RAPIDAPI-HOST"],
                  "x-rapidapi-key": config["X-RAPIDAPI-KEY"],
                },
              }
            );

            if (!res.data.is_valid) return false;
          } catch (error) {
            return false;
          }

          return true;
        },
        message:
          "Please enter a valid phone number or use +234 instead of direct number",
      },
      unique: true,
      trim: true,
    },
    fullName: { type: String, required: true, unique: true, trim: true },
    discoveredUsBy: {
      type: String,
      enum: ["blog-post", "google-search", "referral", "social-media", "other"],
      default: "referral",
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      match: [/\S+@\S+\.\S+/, "Please use a valid email address"],
    },
    firstTimeUser: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    plan: {
      type: { type: String, enum: ["free", "premium"], default: "free" },
      subscribedAt: { type: String },
      autoRenew: { type: Boolean, default: false },
      expiredAt: { type: String },
      amountPaid: { type: Number },
    },
    paymentOnHold: {
      type: Boolean,
      default: false,
    },
    welcomeEmailSent: {
      type: Boolean,
      default: false,
    },
    referralCode: {
      type: String,
      default: generateRandomString(7),
      unique: true,
    },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (this.isModified("email") && !this.isNew) {
    this.isEmailVerified = false;
  }

  next();
});

UserSchema.post("save", async function (doc) {
  const store = await findStore({ owner: doc._id }, false);

  if (this.isNew) {
    store.customizations.theme = themes[0];

    store.customizations.category = {
      ...store.customizations.category,
      header: "Our Categories",
      showImage: false,
    };

    const defaultSection: ISection = {
      display: "flex",
      header: "For You!",
      products: "random",
    };

    store.sections = [defaultSection];

    await Promise.all([
      handleIntegrationConnection(store._id, "paystack", true),
      handleIntegrationConnection(store._id, "sendbox", true),
      store.save({ validateModifiedOnly: true }),
    ]);
  }

  try {
    if (!doc.firstTimeUser) return;

    if (doc.isEmailVerified && !doc.welcomeEmailSent) {
      const email = generateWelcomeEmail({ userName: doc.fullName });
      await sendEmail(doc.email, email, undefined, "Welcome To Store Build");
      doc.welcomeEmailSent = true;
      await doc.save({ validateModifiedOnly: true });
    }
  } catch (error) {
    console.error("Error in post save hook:", error);
  }
});

const ReferralSchema: mongoose.Schema<IReferral> = new mongoose.Schema({
  referrer: { type: String, ref: "User", required: true },
  referree: { type: String, ref: "User", required: true },
  rewardClaimed: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
});

const TransactionSchema: mongoose.Schema<ITransaction> = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    paymentFor: {
      type: String,
      enum: ["order", "subscription", "store-build-ai"],
      required: true,
    },
    paymentMethod: { type: String, required: true },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["successful", "paid", "failed", "pending"],
    },
    txRef: { type: String, required: true },
    identifier: { type: String, required: true },
    paymentChannel: {
      type: String,
      enum: ["balance", "billStack", "flutterwave"],
      required: true,
    },
    type: {
      type: String,
      enum: ["Funding", "Withdrawal", "Refund", "Transfer", "Payment"],
      required: true,
    },
    meta: { type: mongoose.Schema.Types.Mixed },
    storeId: { type: String, required: true },
  },
  { timestamps: true }
);

export const CategorySchema = new mongoose.Schema<ICategory>(
  {
    icon: { type: String },
    img: { type: String },
    name: { type: String, required: true },
    slot: { type: String, required: true },
    storeId: { type: "String", required: true },
  },
  { timestamps: true }
);

export const StorePaymentDetailsSchema = new mongoose.Schema<IPaymentDetails>({
  accountName: { type: String },
  accountNumber: { type: String },
  bankName: { type: String },
});

const ThemeSchema = new mongoose.Schema<IStoreTheme>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  primary: { type: String, required: true },
  secondary: { type: String, required: true },
});

const HeroSchema = new mongoose.Schema<IStoreHeroSection>({
  btnAction: { type: String, enum: ["addToCart", "buyNow"], default: "buyNow" },
  description: { type: String },
  image: { type: String, required: true },
  message: { type: String, required: true },
  style: { type: String, enum: ["one", "two", "three"], default: "one" },
  product: {
    type: String,
    required: true,
    validate: {
      validator: async (productId: string) => {
        const doestProductExist = Boolean(
          await ProductModel.exists({ _id: productId })
        );

        return doestProductExist;
      },
      message: "Sorry but this product does not exist in our database.",
    },
  },
});

export const StoreSchema: mongoose.Schema<IStore> = new mongoose.Schema(
  {
    storeName: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator(storeName: string) {
          return /^[a-zA-Z0-9\s]+$/.test(storeName); // Example: Alphanumeric and spaces only
        },
        message:
          "Store name can only contain alphanumeric characters and spaces.",
      },
    },
    storeCode: {
      type: String,
      required: true,
      unique: true,
    },
    productType: {
      type: String,
      required: true,
      validate: {
        async validator(productType: string) {
          const doesProductTypeExist = Boolean(
            await ProductTypesModel.exists({ _id: productType })
          );
          return doesProductTypeExist;
        },
        message: "Invalid product type provided.",
      },
    },
    templateId: {
      type: String,
      default: generateRandomString(18),
      validate: {
        async validator(id: string) {
          let attempt = 5;

          while (attempt > 0) {
            const store = await findStore({ templateId: id }, false, {
              templateId: 1,
            });

            if (!store) {
              // If no store is found with the current template ID, validation passes
              return true;
            }

            // Generate a new ID for the next attempt
            id = generateRandomString(18);
            attempt--;
          }

          // If attempts are exhausted, validation fails
          return false;
        },
        message:
          "Unable to generate a unique template ID after multiple attempts.",
      },
    },
    previewFor: {
      type: String,
      validate: {
        validator(previewTime) {
          const now = new Date();

          return now <= new Date(previewTime);
        },
        message: "Preview time can only be in the future.",
      },
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "on-hold", "banned"],
      default: "active",
    },
    aboutStore: { type: String },
    description: { type: String },
    owner: {
      type: String,
      required: true,
      index: true,
      path: "user",
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    balance: { type: Number, default: 0, select: false },
    customizations: {
      logoUrl: { type: String },
      theme: {
        type: ThemeSchema,
        validate: {
          validator(t: IStoreTheme) {
            if (!t.id) return true;

            const doesThemeExist = themes.find(
              (theme) =>
                theme.id === t.id &&
                theme.name === t.name &&
                theme.primary === t.primary &&
                theme.secondary === t.secondary
            );

            if (!doesThemeExist) return false;

            return true;
          },
          message: "Invalid Theme Selection, Please select available themes.",
        },
      },
      hero: { type: HeroSchema },
      banner: {
        type: {
          type: String,
          enum: ["discount", "best-selling"],
        },
        product: {
          type: String,
          validate: {
            async validator(productId: string) {
              if (!productId) return true;

              const isValid = Boolean(
                await ProductModel.exists({ id: productId })
              ); // Replace with actual function
              return isValid;
            },
            message:
              "Invalid product ID (Product might not exist) provided for the banner.",
          },
        },
        description: { type: String },
        header: { type: String },
        btnAction: {
          type: String,
          enum: ["goToPage", "checkOut"],
        },
        buttonLabel: { type: String },
        image: { type: String },
      },
      category: {
        showImage: {
          type: Boolean,
          default: false,
          validate: {
            async validator(showImage: boolean) {
              if (!showImage) return;

              const categories = await CategoryModel.find({
                storeId: this._id,
              });

              const doesAllCategoriesHaveImage = categories.every((category) =>
                category.img.startsWith("https")
              );

              return doesAllCategoriesHaveImage;
            },
            message:
              "If show image is turn on, then all categories must have images in them.",
          },
        },
        icon: { type: String },
        header: { type: String },
      },
      productsPages: {
        canFilter: { type: Boolean, default: true },
        canSearch: { type: Boolean, default: true },
        sort: {
          type: [String],
          //enum: ["date", "name", "price", "discount"],
        },
        havePagination: { type: Boolean, default: true },
      },
      productPage: {
        showSimilarProducts: { type: Boolean, default: true },
        style: {
          type: String,
          enum: ["one", "two", "three"],
          default: "one",
        },
        showReviews: { type: Boolean, default: true },
      },
      features: {
        showFeatures: { type: Boolean, default: false },
        features: [
          {
            header: { type: String },
            description: { type: String },
            style: {
              type: String,
              enum: ["one", "two", "three"],
              default: "one",
            },
            image: { type: String },
          },
        ],
        style: { type: String, enum: ["one", "two", "three"], default: "one" },
      },
      footer: {
        style: { type: String, enum: ["one", "two", "three"], default: "one" },
        showNewsLetter: { type: Boolean, default: false },
      },
    },
    sections: [
      {
        header: { type: String, required: true },
        products: {
          type: String,
          enum: ["random", "best-sellers", "expensive", "discounted"],
        },
        display: { type: String, enum: ["grid", "flex"] },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const OtpSchema = new mongoose.Schema<IOTP>(
  {
    token: { type: String, required: true },
    tokenFor: {
      type: String,
      enum: ["login", "verify-email"],
      default: "login",
    },
    user: { type: String, required: true },
    expiredAt: {
      type: Number,
      default: Date.now() + 10 * 60 * 1000,
      validate: {
        async validator(expireAt: number) {
          const now = Date.now();

          return now <= expireAt;
        },
        message: "Invalid time format (Back date)",
      },
    },
  },
  { timestamps: true }
);

export const SubscriptionSchema = new mongoose.Schema<ISubscription>(
  {
    amountPaid: { type: "Number", default: 0 },
    tx_ref: { type: "String", required: true },
    user: { type: String, required: true },
    paymentType: { type: String },
    status: {
      type: String,
      enum: ["pending", "failed", "successful", "paid"],
      default: "pending",
    },
  },
  { timestamps: true }
);

SubscriptionSchema.post("save", async function (doc) {
  if (doc.status === "paid") {
    const user = await findUser(doc.user, true, { plan: 1 });
    const store = await findStore({ owner: user._id }, true, { storeName: 1 });

    await sendEmail(
      user.email,
      subscriptionSuccessful(
        user.plan.amountPaid + "",
        user.plan.subscribedAt,
        user.plan.expiredAt,
        store.storeName
      )
    );
  }
});

// Payment Details Subdocument
const PaymentDetailsSchema = new mongoose.Schema<IOrderPaymentDetails>({
  paymentStatus: {
    type: String,
    enum: ["paid", "pending", "failed", "successful"],
    required: true,
    default: "pending",
  },
  paymentMethod: {
    type: String,
  },
  transactionId: { type: String, required: true },
  paymentDate: { type: String, required: true },
  tx_ref: { type: String, required: true },
  paymentLink: { type: String },
});

// Address Subdocument
const AddressSchema: mongoose.Schema<
  ICustomerAddress & { isDefault?: boolean }
> = new mongoose.Schema({
  addressLine1: { type: String },
  addressLine2: { type: String },
  city: { type: String },
  state: { type: String },
  postalCode: { type: String },
  country: { type: String },
  lat: { type: Number },
  lng: { type: Number },
  isDefault: { type: Boolean, default: false },
});

// Shipping Details Subdocument
const ShippingDetailsSchema = new mongoose.Schema({
  shippingMethod: {
    type: String,
    enum: ["STANDARD", "EXPRESS"],
    default: "STANDARD",
  },
  shippingCost: { type: Number, default: 0 },
  estimatedDeliveryDate: {
    type: String,
    default: new Date(Date.now() + 60 * 60 * 24 * 5 * 1000).toISOString(),
    validate: {
      validator(date: string) {
        const today = new Date();
        const estimatedDeliveryDate = new Date(date);

        return estimatedDeliveryDate > today;
      },
    },
  },
  trackingNumber: { type: String },
  carrier: { type: String, default: "SENDBOX" },
});

// Media Schema
const ProductMediaSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    validate: {
      validator(v: string) {
        if (!v || !v.startsWith("https")) false;
        return true;
      },
    },
  },
  altText: { type: String },
  mediaType: {
    type: String,
    enum: ["image", "video"],
    required: true,
  },
});

// Product Dimensions Schema
const ProductDimensionsSchema = new mongoose.Schema({
  length: { type: Number },
  width: { type: Number },
  height: { type: Number },
});

// Product Shipping Details Schema
const ProductShippingDetailsSchema = new mongoose.Schema({
  isFreeShipping: { type: Boolean, required: true },
  shippingCost: { type: Number },
  shippingRegions: { type: [], default: [] },
  shipAllRegion: { type: Boolean, default: true },
});

// Ratings Schema
const RatingsSchema = new mongoose.Schema({
  average: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
});

const StoreSettingSchema = new mongoose.Schema<IStoreSettings>({
  storeId: {
    type: String,
    required: true,
    validate: {
      async validator(storeId: string) {
        const store = !!(await StoreModel.findById(storeId));
        return store;
      },
    },
  },
  storeAddress: { type: [AddressSchema], default: [] },
});

// Product Schema
const ProductSchema = new mongoose.Schema<IProduct>(
  {
    storeId: { type: String, required: true },
    isDigital: { type: Boolean, default: false },
    productName: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    gender: { type: [String] },
    tags: [{ type: String }],
    digitalFiles: { type: [String], select: false },
    price: {
      default: { type: Number, required: true },
      useDefaultPricingForDifferentSizes: { type: Boolean, default: true },
      sizes: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    discount: { type: Number, required: true },
    stockQuantity: { type: Number, required: true },
    maxStock: { type: Number },
    availableSizes: [{ type: String }],
    media: [ProductMediaSchema],
    availableColors: { type: [], default: [] },
    weight: { type: Number, required: true },
    dimensions: ProductDimensionsSchema,
    shippingDetails: ProductShippingDetailsSchema,
    ratings: RatingsSchema,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Order Schema
const OrderSchema: mongoose.Schema<IOrder> = new mongoose.Schema(
  {
    storeId: {
      type: String,
      required: true,
      index: true,
      path: "store",
    },
    deliveryType: {
      default: "waybill",
      type: String,
      enum: ["waybill", "pick_up", "sendbox"],
    },
    coupon: { type: String },
    orderStatus: {
      type: String,
      default: "Pending",
      enum: [
        "Pending",
        "Completed",
        "Shipped",
        "Processing",
        "Cancelled",
        "Refunded",
      ],
      required: true,
    },
    paymentDetails: { type: PaymentDetailsSchema, required: true },
    products: { type: [ProductSchema], required: true },
    customerDetails: {
      shippingAddress: { type: AddressSchema },
      email: { type: String, required: true },
      phoneNumber: { type: String, required: true },
      name: { type: String },
    },
    amountPaid: { type: Number, default: 0 },
    amountLeftToPay: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    shippingDetails: { type: ShippingDetailsSchema },
    note: { type: String },
  },
  { timestamps: true }
);

// Define the Mongoose schema for the ICoupon model
const CouponSchema: mongoose.Schema<ICoupon> = new mongoose.Schema(
  {
    storeId: {
      type: String,
      required: [true, "Store ID is required"],
      trim: true,
    },
    couponCode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // Allows null or unique values
    },
    expirationDate: {
      type: Date,
      required: [true, "Expiration date is required"],
      default: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      validate: {
        validator: function (value: Date) {
          return value > new Date();
        },
        message: "Expiration date must be in the future",
      },
    },
    selectedProducts: {
      type: [String],
      default: [],
    },
    selectedCategories: {
      type: [String],
      default: [],
    },
    appliedTo: {
      type: String,
      required: [true, "Applied-to field is required"],
      enum: ["shoppingCart", "products"],
    },
    type: {
      type: String,
      required: [true, "Coupon type is required"],
      enum: ["percentageCoupon", "nairaCoupon"],
    },
    discountValue: {
      type: Number,
      required: [true, "Discount value is required"],
      min: [0, "Discount value cannot be negative"],
      validate: {
        validator: function (value: number) {
          if (this.type === "percentageCoupon") return value <= 100;
          return true;
        },
        message: "Percentage discount cannot exceed 100%",
      },
    },
    maxUsage: {
      type: Number,
      required: [true, "Max usage is required"],
      min: [1, "Max usage must be at least 1"],
    },
    customerUsage: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true, // Automatically creates createdAt and updatedAt fields
  }
);

// Middleware to validate storeId
CouponSchema.pre<ICoupon>("save", async function (next: any) {
  try {
    const storeExists = await StoreModel.findById(this.storeId);
    if (!storeExists) {
      return next(new Error("Invalid storeId: Store does not exist"));
    }

    if (this.appliedTo === "products" && !this.selectedProducts.length)
      next(new Error("Please select a product to applied coupon for."));

    if (this.selectedProducts.length > 0) {
      const validProducts = await ProductModel.find({
        _id: { $in: this.selectedProducts },
      });
      if (validProducts.length !== this.selectedProducts.length) {
        return next(
          new Error("Invalid selectedProducts: Some products do not exist")
        );
      }
    }

    // Validate selectedCategories
    if (this.selectedCategories.length > 0) {
      const validCategories = await CategoryModel.find({
        _id: { $in: this.selectedCategories },
      });
      if (validCategories.length !== this.selectedCategories.length) {
        return next(
          new Error("Invalid selectedCategories: Some categories do not exist")
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

AddressSchema.pre<ICustomerAddress>("save", async function (next) {
  try {
    const uriComponent = `${this.country} ${this.state} ${this.city}`;
    const url = `https://nominatim.openstreetmap.org/search.php?q=${encodeURIComponent(
      uriComponent
    )}&format=jsonv2`;

    const res: { data: { lat: string; lon: string }[] } = await axios.get(url);

    if (res.data.length === 0) {
      next(new Error("No location found for the given address"));
    }

    this.lat = Number(res.data[0].lat);
    this.lng = Number(res.data[0].lon);

    next();
  } catch (error) {
    const err = error as Error;
    next(new Error(err.message));
  }
});

// Add index for faster search on coupon codes
CouponSchema.index({ couponCode: 1 }, { unique: true, sparse: true });

OrderSchema.pre("save", async function (next) {
  try {
    const prev = await OrderModel.findById(this._id);

    if (prev && prev?.orderStatus === "Completed") {
      const err = new Error("This order has been completed");
      return next(err);
    }

    if (this.orderStatus === "Completed") {
      const store = await findStore(this.storeId);
      const { email: supportEmail, phoneNumber: supportPhone } = await findUser(
        store.owner,
        true,
        {
          email: 1,
          phoneNumber: 1,
        }
      );

      this.amountLeftToPay = 0;
      this.amountPaid = this.totalAmount;

      this.paymentDetails.paymentStatus = "paid";
      this.paymentDetails.paymentDate = this.updatedAt;

      const amountForSize = (product: IProduct, _size: string) => {
        return product.price.sizes.find((size) => size)[_size];
      };

      const emailPayload = {
        companyLogo: store.customizations.logoUrl,
        companyName: store.storeName,
        customerEmail: this.customerDetails.email,
        customerName: this.customerDetails.name,
        estimatedDelivery: this.shippingDetails.estimatedDeliveryDate,
        items: this.products.map((product) => ({
          name: product.productName,
          price:
            product.discount ||
            amountForSize(product, product.size) ||
            product.price.default,
          quantity: product.quantity || 1,
        })),
        orderId: this._id,
        shippingAddress: {
          country: this.customerDetails.shippingAddress.country,
          state: this.customerDetails.shippingAddress.state,
          city: this.customerDetails.shippingAddress.city,
          street: this.customerDetails.shippingAddress.addressLine1,
          zipCode: this.customerDetails.shippingAddress.postalCode,
        },
        shippingMethod: this.shippingDetails.shippingMethod,
        supportEmail,
        supportPhone,
        total: this.totalAmount,
      };

      const orderCompletionEmail = generateOrderCompletionEmail(emailPayload);

      //Notify the customer about this order
      await sendEmail(
        this.customerDetails.email,
        orderCompletionEmail,
        undefined,
        "Order Status Changed."
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});

OrderSchema.post("save", async function (order) {
  if (!this.isNew) return;

  // Send an email notification to user on order --> If the paystack isConnected -> True
  const store = await StoreModel.findById(order.storeId).select(
    "+paymentDetails"
  );

  const [integration, user] = await Promise.all([
    IntegrationModel.findOne({
      storeId: store._id,
      "integration.name": "paystack",
    }),
    findUser(store.owner),
  ]);

  let email;

  const { products: items, totalAmount, _id: orderNumber } = order;

  if (integration.integration.isConnected) {
    // send the user an email that have payment information with the payment link.
    email = generateOrderEmailWithPaymentLink({
      items,
      totalAmount,
      viewOrderLink: PATHS.STORE_ORDERS + order._id,
      userName: order.customerDetails.name,
      orderNumber,
      paymentLink: order.paymentDetails.paymentLink,
    });
  } else {
    email = generateManualPaymentEmail({
      items,
      totalAmount,
      viewOrderLink:
        config.CLIENT_DOMAIN +
        `/store/${store.storeCode}/track-order/` +
        order._id,
      userName: order.customerDetails.name,
      orderNumber,
      // TODO
      paymentDetails: { accountName: "", accountNumber: "", bankName: "" },
    });
  }

  // Use the default user payment information to display to user, This means that the payment will be manually

  const adminEmail = generateAdminOrderNotificationEmail({
    items,
    totalAmount,
    viewOrderLink: PATHS.STORE_ORDERS + order._id,
    adminName: user.fullName,
    orderNumber,
    customerName: order.customerDetails.name,
  });

  await Promise.all([
    sendEmail(
      order.customerDetails.email,
      email,
      undefined,
      "Order Recieved Successfully"
    ),
    sendEmail(user.email, adminEmail, undefined, "New Order Received!"),
  ]);
});

StoreSchema.pre("save", async function (next) {
  if (this.previewFor) {
    const now = new Date();

    now.setMinutes(30);
    this.previewFor = now.toISOString();
  }

  // Making sure certain creterias are satisfy before toggling this
  if (this.isActive && !this.isNew) {
    const user = await UserModel.findById(this.owner);

    const account = new Store(this._id, user._id);

    await account.canStoreGoPublic();
  }

  // This will run only when the showImage is show on the store store and will check if all the categories have images to be shown or not
  if (this.customizations?.category?.showImage) {
    const categories = await CategoryModel.find({ storeId: this._id });
    const allCategoriesHaveImages = categories.every(
      (category) => !!category.img
    );

    if (!allCategoriesHaveImages) {
      return next(
        new Error("All categories must have images when showImage is enabled.")
      );
    }
  }

  next();
});

StoreSchema.pre("findOneAndUpdate", async function (next) {
  const query = this.getQuery();
  const update = this.getUpdate() as mongoose.UpdateQuery<IStore>;

  console.log({ queryID: query._id });
  const store = await StoreModel.findById(query._id);

  if (!store) {
    throw new Error("STORE_QUERY_FAILED: unable to locate store.");
  }

  // Making sure certain creterias are satisfy before toggling this
  if (update.isActive) {
    const account = new Store(query._id, store.owner);

    await account.canStoreGoPublic();
  }

  next();
});

StoreSchema.pre("updateOne", async function (next) {
  const update = this.getUpdate() as mongoose.UpdateQuery<IStore>;

  if (update.customizations?.category?.showImage) {
    const categories = await CategoryModel.find({ storeId: update._id });
    const allCategoriesHaveImages = categories.every(
      (category) => !!category.img
    );

    if (!allCategoriesHaveImages) {
      return next(
        new Error("All categories must have images when showImage is enabled.")
      );
    }
  }

  next();
});

StoreSchema.post("save", async function (doc) {
  if (doc.isModified("balance")) {
    const [user] = await Promise.all([findUser(doc.owner)]);

    const email = balanceUpdatedEmail(user.fullName, doc.balance);

    await sendEmail(
      user.email,
      email,
      undefined,
      "Your Balance Has Been Updated"
    );
  }
});

// Rating Schema
const RatingSchema: mongoose.Schema<IRating> = new mongoose.Schema(
  {
    storeId: { type: String, required: true },
    productId: { type: String, required: true },
    userEmail: {
      type: String,
      required: true,
      minlength: [10, "please use a valid email address"],
    },
    rating: {
      type: Number,
      required: true,
      min: [1, "Minimum value of rating should be greater than 0"],
    },
    note: {
      type: String,
      required: true,
      minlength: [3, "please use a valid email address"],
    },
  },
  { timestamps: true }
);

RatingSchema.pre<IRating>("save", async function (next) {
  try {
    const review = this as IRating & Document;

    const [doesProductExist, doesStoreExist] = await Promise.all([
      ProductModel.exists({ _id: review.productId }),
      StoreModel.exists({ _id: review.storeId }),
    ]);

    if (!doesStoreExist || !doesProductExist) {
      return next(new Error("Store or product does not exist"));
    }

    const userReviewCount = await RatingModel.countDocuments({
      productId: review.productId,
      userEmail: review.userEmail,
      storeId: review.storeId,
    });

    if (userReviewCount >= 2) {
      return next(new Error("You can only write two reviews about a product"));
    }

    const hasUserPurchased = await OrderModel.exists({
      storeId: review.storeId,
      products: { $elemMatch: { _id: review.productId } },
      orderStatus: "Completed",
    });

    if (!hasUserPurchased) {
      return next(
        new Error("You can only write a review when you purchase the product")
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});

const IntegrationPropsSchema = new mongoose.Schema<IntegrationProps>({
  isConnected: { type: Boolean, default: false },
  name: { type: String, required: true },
  settings: { type: mongoose.Schema.Types.Mixed, required: true },
  apiKeys: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    select: false,
  },
  subcription: {
    start_date: {
      type: String,
    },
    end_date: {
      type: String,
    },
    comment: {
      type: String,
    },
  },
});

const IntegrationSchema = new mongoose.Schema<Integration>({
  storeId: { type: String, required: true },
  integration: { type: IntegrationPropsSchema, required: true },
});

IntegrationSchema.pre("save", async function (next) {
  try {
    if (!this.integration.isConnected) return;

    const now = new Date();

    const isConnected = this.integration.isConnected;

    const premiumIntegrations = new Set(["chatbot"]);

    const integrationId = this.integration.name;

    // Check if the integration is premium and user has subscribed to it.
    const activeSubscriptions =
      new Date(this?.integration?.subcription?.end_date) > now;

    if (premiumIntegrations.has(integrationId)) {
      if (!isConnected && !activeSubscriptions) {
        next(
          new Error(
            "CANNOT_CONNECT_INTEGRATION: Please subscription to this integration before you can connect it to your store."
          )
        );
      }

      next();
    }
  } catch (error) {
    next(error);
  }
});

const TutorialSchema: mongoose.Schema<ITutorial> = new mongoose.Schema({
  category: { type: String, required: true },
  description: { type: String, required: true },
  isCompleted: { type: Boolean, default: false },
  rating: { type: Number, required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ["video"], default: "video", required: true },
  user: { type: String, required: true },
  videoId: { type: String },
});

TutorialSchema.pre("insertMany", async function (next, docs: ITutorial[]) {
  try {
    // Function to check if a tutorial is already marked as completed
    const checkIfUserAlreadyMarkAsComplete = async (
      user: string,
      videoId: string
    ) => {
      return await TutorialModel.exists({ videoId, user });
    };

    // Filter the documents to exclude ones that already exist
    const filteredDocs: ITutorial[] = [];
    for (const doc of docs) {
      const exists = await checkIfUserAlreadyMarkAsComplete(
        doc.user,
        doc.videoId
      );
      if (!exists) {
        filteredDocs.push(doc); // Only include docs that don't exist
      }
    }

    // Replace the original docs array with the filtered ones
    docs.splice(0, docs.length, ...filteredDocs);

    next(); // Proceed to insert the filtered documents
  } catch (error) {
    next(error); // Pass any error to Mongoose for handling
  }
});

const MetadataSchema = new mongoose.Schema<Metadata>({
  tokensUsed: { type: Number, default: null },
  model: { type: String, default: null },
  confidenceScore: { type: Number, default: null },
});

const ChatBotConversationSchema = new mongoose.Schema<IChatBotConversation>(
  {
    userPrompt: { type: String },
    aiResponse: { type: String },
    userId: { type: String, required: true },
    sessionId: { type: String, required: true },
    actionPerformed: { type: String, default: null },
    intent: { type: String, default: null },
    metadata: { type: MetadataSchema, default: null },
  },
  {
    timestamps: true,
  }
);

const IntegrationSubscriptionSchema: mongoose.Schema<IIntegrationSubscription> =
  new mongoose.Schema({
    integrationId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: {
        validator(integrationId: string) {
          const premiumIntegrations = ["chatbot"];

          if (!premiumIntegrations.includes(integrationId)) return false;

          return true;
        },
        message: "Please use a valid integration ID",
      },
    },
    amountPaid: {
      type: Number,
      required: true,
      validate: {
        validator(amount: number) {
          return !isNaN(amount) || amount > 0;
        },
      },
    },
    transactionId: {
      type: String,
      required: true,
      trim: true,
    },
    paymentChannel: {
      type: String,
      required: true,
      enum: ["balance", "checkout"],
      default: "balance",
    },
    userId: {
      type: String,
      required: true,
      validate: {
        async validator(userId: string) {
          return !!(await UserModel.exists({ _id: userId }));
        },
        message: "Please use a valid user ID",
      },
    },
    storeId: {
      type: String,
      required: true,
      validate: {
        async validator(storeId: string) {
          return !!(await StoreModel.exists({ _id: storeId }));
        },
        message: "Please use a valid store ID",
      },
    },
    expiredAt: {
      type: String,
      required: true,
      default: new Date(
        new Date().setDate(new Date().getDate() + 30)
      ).toISOString(),
      validate: {
        validator(expiredAt: string) {
          const now = new Date();
          now.setDate(now.getDate() + 30);

          return new Date(expiredAt) < now;
        },
        message: "The expiration date must be at least 30 days in the future.",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  });

const StoreBankAccountSchema: mongoose.Schema<IStoreBankAccounts> =
  new mongoose.Schema(
    {
      accountName: {
        type: String,
        trim: true,
        required: true,
      },
      accountNumber: {
        type: String,
        trim: true,
        unique: true,
        required: true,
      },
      bankName: {
        type: String,
        trim: true,
        required: true,
      },
      storeId: {
        type: String,
        required: true,
      },
      userId: {
        type: String,
        required: true,
      },
      isDefault: {
        type: Boolean,
        default: true,
      },
      bankCode: {
        type: String,
        trim: true,
        required: true,
      },
      nin: {
        type: String,
        trim: true,
        unique: true,
      },
    },
    { timestamps: true }
  );

const DedicatedAccountSchema: mongoose.Schema<IDedicatedAccount> =
  new mongoose.Schema({
    accountDetails: {
      accountName: {
        type: String,
        required: true,
      },
      accountNumber: {
        type: String,
        unique: true,
      },
      bankName: {
        type: String,
      },
    },
    accountRef: { type: String, unique: true, required: true },
    ref: { type: String, unique: true, required: true },
    storeId: { type: String, unique: true, required: true },
  });

export const ChatBotConversationModel = mongoose.model<IChatBotConversation>(
  "ChatBotConversation",
  ChatBotConversationSchema
);

export const IntegrationSubscriptionModel =
  mongoose.model<IIntegrationSubscription>(
    "integrationSubcription",
    IntegrationSubscriptionSchema
  );

export const StoreBankAccountModel = mongoose.model(
  "storebankaccount",
  StoreBankAccountSchema
);
export const TutorialModel = mongoose.model("tutorial", TutorialSchema);
export const AddressModel = mongoose.model("address", AddressSchema);
export const CategoryModel = mongoose.model("category", CategorySchema);
export const StoreSttings = mongoose.model("storeSettings", StoreSettingSchema);
export const RatingModel = mongoose.model("Rating", RatingSchema);
export const ProductModel = mongoose.model("Product", ProductSchema);
export const OrderModel = mongoose.model("order", OrderSchema);
export const NewsLetterModel = mongoose.model("newsletter", NewsLetterSchema);
export const UserModel = mongoose.model("user", UserSchema);
export const ReferralModel = mongoose.model("referral", ReferralSchema);
export const StoreModel = mongoose.model("store", StoreSchema);
export const OTPModel = mongoose.model("otp", OtpSchema);
export const SubscriptionModel = mongoose.model(
  "subscription",
  SubscriptionSchema
);
export const IntegrationModel = mongoose.model(
  "integration",
  IntegrationSchema
);
export const Coupon = mongoose.model<ICoupon>("Coupon", CouponSchema);
export const ProductTypesModel = mongoose.model(
  "productType",
  ProductTypeSchema
);
export const TransactionModel = mongoose.model(
  "transaction",
  TransactionSchema
);
export const DedicatedAccountModel = mongoose.model(
  "dedicatedAccount",
  DedicatedAccountSchema
);
