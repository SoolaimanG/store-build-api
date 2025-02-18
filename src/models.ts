import mongoose, { Document } from "mongoose";
import {
  ICategory,
  ICustomerAddress,
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
  IStoreHeroSection,
  IStoreSettings,
  IStoreTheme,
  ISubscription,
  IUser,
} from "./types";
import {
  areAllProductDigital,
  findStore,
  findUser,
  generateRandomString,
  handleIntegrationConnection,
  handleOrderNotifications,
  handleOrderStatusChange,
  sendEmail,
} from "./helper";
import { Query } from "mongoose";
import { themes } from "./constant";
import axios from "axios";
import {
  balanceUpdatedEmail,
  EmailType,
  generateEmail,
  generateWelcomeEmail,
  subscriptionSuccessful,
} from "./emails";

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
    phoneNumber: { type: String },
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
  },
  { timestamps: true }
);

UserSchema.post("save", async function (doc) {
  if (doc.firstTimeUser) {
    try {
      const store = await findStore({ owner: doc._id });

      const section: ISection = {
        display: "flex",
        header: "For You!",
        products: "random",
      };
      const theme = store.customizations.theme || themes[0];

      store.customizations.theme = theme;
      store.customizations.category.showImage = false;
      store.sections = Boolean(store.sections.length)
        ? store.sections
        : [section];

      const storeProducts = await ProductModel.find({
        isActive: true,
        storeId: store._id,
      }).countDocuments();

      const isFirstTimer = Boolean(
        doc.isEmailVerified && doc.phoneNumber && storeProducts
      );

      doc.firstTimeUser = !isFirstTimer;

      // To switch user from being a first-timer, make sure that the user have add a product, phone number and also verify their email address

      await Promise.all([
        handleIntegrationConnection(store._id, "paystack"),
        handleIntegrationConnection(store._id, "sendbox"),
        store.save({ validateModifiedOnly: true }),
        doc.save({ validateModifiedOnly: true }),
      ]);
    } catch (error) {
      console.log(error);
    }

    if (doc.isEmailVerified) {
      const email = generateWelcomeEmail({ userName: doc.fullName });

      // Trigger a welcome email to the user
      await sendEmail(doc.email, email, undefined, "Welcome To Store Build");
    }
  }
});

const ReferralSchema: mongoose.Schema<IReferral> = new mongoose.Schema({
  referrer: { type: String, ref: "User", required: true },
  referree: { type: String, ref: "User", required: true },
  rewardClaimed: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
});

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
      default: generateRandomString(6),
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
      default: true,
      validate: {
        async validator(isActive: boolean) {
          if (!isActive) return true;
          // For a store to be active, the store must have atleast one product, the owner of the store verify the email and add a phone number.

          const user = await findUser(this.owner);

          const storeHasProduct = await ProductModel.find({
            isActive: true,
            storeId: this._id,
          });

          if (!storeHasProduct.length) return false;

          if (!user.isEmailVerified) return false;

          if (!user.phoneNumber) return false;

          return true;
        },
        message:
          "For store active and available to the public, Add atleast one product, verify your email address and add your phone number",
      },
    },
    balance: { type: Number, default: 0, select: false },
    paymentDetails: {
      type: StorePaymentDetailsSchema,
      validate: {
        async validator() {
          return true;
        },
        message:
          "Please make sure your Bank Name matches the Full Name on your store.",
      },
      select: false,
    },
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
          enum: ["date", "name", "price", "discount"],
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
    expiredAt: { type: Number, default: Date.now() + 10 * 60 * 1000 },
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
    enum: ["banktrf"],
    default: "banktrf",
    required: true,
  },
  transactionId: { type: String, required: true },
  paymentDate: { type: String, required: true },
  tx_ref: { type: String, required: true },
  paymentLink: { type: String, required: true },
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
    maxStock: { type: Number, required: true },
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
    if (this.deliveryType !== "sendbox") {
      this.customerDetails.shippingAddress = undefined;
      this.shippingDetails.shippingCost = 0;
      this.shippingDetails.trackingNumber = undefined;
    }

    if (areAllProductDigital(this.products)) {
      this.shippingDetails = undefined;
    }

    next();
  } catch (error) {
    next(error);
  }
});

OrderSchema.post("save", async function (order) {});

StoreSchema.pre("save", async function (next) {
  if (this.isActive) {
    // ! Make Sure At least two products exist;
    // ! Make Sure a payment option is added manual/automatic(flutterwave)
    // ! Incase of physical products make sure that address is added
    // ! Create a products/product page for the user
  }

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

  if (!this.isModified("status")) return next(); // Check if 'status' is modified

  const currentStatus = this.status;

  if (["banned", "on-hold"].includes(currentStatus)) {
    const { email } = await findUser(this.owner, true, { email: 1 });

    await sendEmail(email, "");
  }

  next();
});

StoreSchema.pre("updateOne", async function (next) {
  const query = this.getQuery();
  const update = this.getUpdate() as mongoose.UpdateQuery<IStore>;

  if (!update.status) return next(); // Proceed if 'status' is not being updated

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

  const store = await this.model.findOne(query); // Fetch the existing document

  if (
    store &&
    ["banned", "on-hold"].includes(update.status) &&
    store.status !== update.status
  ) {
    const { email } = await UserModel.findOne({ id: update.owner });

    await sendEmail(email, "");
  }
  next();
});

StoreSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate() as mongoose.UpdateQuery<IStore>;

  if (update?.status && ["banned", "on-hold"].includes(update.status)) {
    const currentStore = await this.model.findOne(this.getQuery());

    if (currentStore && currentStore.status !== update.status) {
      const { email } = await mongoose
        .model("User")
        .findOne({ id: currentStore.owner });
      await sendEmail(email, "Your store status has been updated.");
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
});

const IntegrationSchema = new mongoose.Schema<Integration>({
  storeId: { type: String, required: true },
  integration: { type: IntegrationPropsSchema, required: true },
});

export const AddressModel = mongoose.model("address", AddressSchema);
export const CategoryModel = mongoose.model("category", CategorySchema);
export const StoreSttings = mongoose.model("storeSettings", StoreSettingSchema);
export const RatingModel = mongoose.model("Rating", RatingSchema);
export const ProductModel = mongoose.model("Product", ProductSchema);
export const OrderModel = mongoose.model("order", OrderSchema);
export const NewsLetterModel = mongoose.model("newsletter", NewsLetterSchema);
export const ProductTypesModel = mongoose.model(
  "productType",
  ProductTypeSchema
);
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
