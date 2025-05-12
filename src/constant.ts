import dotenv from "dotenv";
import { generateRandomString } from "./helper";
import { IStore } from "./types";
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { PipelineStage } from "mongoose";

dotenv.config();

export const iconList = [
  "ShoppingBag",
  "ShoppingCart",
  "Store",
  "Package",
  "Truck",
  "CreditCard",
  "Wallet",
  "DollarSign",
  "Percent",
  "Tag",
  "Tags",
  "Ticket",
  "Receipt",
  "BarChart",
  "PieChart",
  "TrendingUp",
  "Gift",
  "Award",
  "Star",
  "Heart",
  "ThumbsUp",
  "Zap",
  "Box",
  "Boxes",
  "Archive",
  "Clipboard",
  "ClipboardCheck",
  "ClipboardList",
  "Smartphone",
  "Laptop",
  "Monitor",
  "Printer",
  "Camera",
  "Headphones",
  "Speaker",
  "Watch",
  "Shirt",
  "Shoe",
  "Umbrella",
  "Coffee",
  "Utensils",
  "ShoppingBasket",
  "Banknote",
  "Coins",
  "CreditCard",
  "Landmark",
  "Building",
  "Home",
  "Truck",
  "Plane",
  "Car",
  "Train",
  "Ship",
  "MapPin",
  "Globe",
  "Search",
  "Filter",
  "SortAsc",
  "SortDesc",
  "ArrowUpDown",
];

export const integrationIds = [
  "unsplash",
  "flutterwave",
  "chatbot",
  "sendbox",
  "instagram",
];

export const quickEmails = [
  {
    id: "order-reminder",
    label: "Remind customer about order",
  },
  {
    id: "under-pay",
    label: "Payment discrepancy notice",
  },
  {
    id: "delivery-delay",
    label: "Delivery delay notification",
  },
  {
    id: "order-feedback",
    label: "Request order feedback",
  },
];

export const themes = [
  {
    id: "modern-purple",
    name: "Modern Purple",
    primary: "#8B5CF6",
    secondary: "#C4B5FD",
  },
  {
    id: "ocean-blue",
    name: "Ocean Blue",
    primary: "#3B82F6",
    secondary: "#93C5FD",
  },
  {
    id: "forest-green",
    name: "Forest Green",
    primary: "#10B981",
    secondary: "#6EE7B7",
  },
  {
    id: "sunset-orange",
    name: "Sunset Orange",
    primary: "#F97316",
    secondary: "#FDBA74",
  },
  {
    id: "berry-red",
    name: "Berry Red",
    primary: "#EF4444",
    secondary: "#FCA5A5",
  },
];

export const config = {
  TRANSACTION_REDIRECT_URL: (storeCode: string, orderId: string) =>
    process.env.CLIENT_DOMAIN + `/store/${storeCode}/track-order/${orderId}`,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  SESSION_SECRET: process.env.SESSION_SECRET,
  DOMAIN: process.env.DOMAIN,
  PORT: process.env.PORT,
  CLIENT_DOMAIN: process.env.CLIENT_DOMAIN,
  MONGO_URI: process.env.MONGO_URI,
  HOST_EMAIL: process.env.HOST_EMAIL,
  HOST_EMAIL_PASSWORD: process.env.HOST_EMAIL_PASSWORD,
  IBB_API_KEY: process.env.IBB_API_KEY,
  PAYSTACK_PUBK: process.env.PAYSTACK_PUBK,
  PAYSTACK_SECRET: process.env.PAYSTACK_SECRET,
  APP_NAME: process.env.APP_NAME,
  FREE_USER_PRODUCTS: process.env.FREE_USER_PRODUCTS,
  SEND_BOX_ACCESS_TOKEN: process.env.SEND_BOX_ACCESS_TOKEN,
  SEND_BOX_REFRESH_TOKEN: process.env.SEND_BOX_REFRESH_TOKEN,
  SEND_BOX_CLIENT_SECRET: process.env.SEND_BOX_CLIENT_SECRET,
  SEND_BOX_URL: process.env.SEND_BOX_URL,
  SUBCRIPTION_FEE: 600,
  SESSION_DURATION: 24 * 60 * 60 * 1000,
  "X-RAPIDAPI-HOST": process.env["X-RAPIDAPI-HOST"],
  "X-RAPIDAPI-KEY": process.env["X-RAPIDAPI-KEY"],
  GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
  TOTAL_CUSTOMER_CHAT: process.env.TOTAL_CUSTOMER_CHAT,
  CHATBOT_SUBSCRIPTION_FEE: process.env.CHATBOT_SUBSCRIPTION_FEE,
  FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
  BILL_STACK_API_KEY: process.env.BILLSTACK_API_KEY,
};

export const referralPipeLine = (userId: string): PipelineStage[] => [
  {
    $match: { referrer: userId },
  },
  {
    $lookup: {
      from: "users",
      localField: "referree",
      foreignField: "_id",
      as: "referreeDetails",
    },
  },
  {
    $unwind: "$referreeDetails",
  },
  {
    $lookup: {
      from: "orders",
      localField: "referree",
      foreignField: "storeId",
      as: "orders",
    },
  },
  {
    $group: {
      _id: null,
      totalReferrals: { $sum: 1 },
      totalEarnings: {
        $sum: {
          $cond: ["$rewardClaimed", 100, 0],
        },
      },
      referrals: {
        $push: {
          fullName: "$referreeDetails.fullName",
          joinedAt: "$referreeDetails.createdAt",
          signUpComplete: {
            $cond: [
              {
                $and: [
                  { $ne: ["$referreeDetails.email", null] },
                  { $ne: ["$referreeDetails.phoneNumber", null] },
                  { $ne: ["$referreeDetails.fullName", null] },
                ],
              },
              true,
              false,
            ],
          },
          totalOrders: { $size: "$orders" },
        },
      },
    },
  },
  {
    $project: {
      _id: 0,
      totalReferrals: 1,
      totalEarnings: 1,
      referrals: 1,
    },
  },
];

export function getFunctionDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: "createProduct",
      description:
        "This action is used to create a product in the user store. ..., This function uses storeId as the argument too, but if storeID is required then it will be provided in the system Prompt", // Full description here
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          storeId: {
            type: SchemaType.STRING,
            description: "store Id of the store, its requir",
          },
          productName: {
            type: SchemaType.STRING,
            description: "Name of the product",
          },
          description: {
            type: SchemaType.STRING,
            description: "Brief description of the product",
          },
          category: {
            type: SchemaType.STRING,
            description: "Category to which the product belongs",
          },
          tags: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Tags to describe or identify the product",
          },
          isDigital: {
            type: SchemaType.BOOLEAN,
            description: "Indicates if the product is a digital good",
          },
          price: {
            type: SchemaType.OBJECT,
            properties: {
              default: {
                type: SchemaType.NUMBER,
                description: "Default price of the product",
              },
              useDefaultPricingForDifferentSizes: {
                type: SchemaType.BOOLEAN,
                description: "Indicates if size-specific pricing applies",
              },
              sizes: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    size: {
                      type: SchemaType.STRING,
                      description: "Size identifier (e.g., 'S', 'M', 'L')",
                    },
                    price: {
                      type: SchemaType.NUMBER,
                      description: "Price for the specific size",
                    },
                  },
                  required: ["size", "price"],
                },
              },
            },
            required: [
              "default",
              "useDefaultPricingForDifferentSizes",
              "sizes",
            ],
          },
          discount: {
            type: SchemaType.NUMBER,
            description: "Discount percentage on the product",
          },
          digitalFiles: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              "List of URLs to digital files if the product is digital",
          },
          stockQuantity: {
            type: SchemaType.NUMBER,
            description: "Current stock quantity available",
          },
          maxStock: {
            type: SchemaType.NUMBER,
            description: "Maximum stock capacity",
          },
          gender: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              "Genders the product is targeted at (e.g., 'M' for male, 'F' for female, 'U' for unisex)",
          },
          availableSizes: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Sizes available for the product",
          },
          media: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.OBJECT, properties: {} },
            description: "Media files (images, videos) showcasing the product",
          },
          availableColors: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.OBJECT, properties: {} },
            description: "Available colors for the product",
          },
          weight: {
            type: SchemaType.NUMBER,
            description: "Weight of the product in kilograms",
          },
          dimensions: {
            type: SchemaType.OBJECT,
            properties: {
              length: {
                type: SchemaType.NUMBER,
                description: "Length of the product",
              },
              width: {
                type: SchemaType.NUMBER,
                description: "Width of the product",
              },
              height: {
                type: SchemaType.NUMBER,
                description: "Height of the product",
              },
            },
          },
          shippingDetails: {
            type: SchemaType.OBJECT,
            description: "Shipping-related details like availability and cost",
            properties: {},
          },
          ratings: {
            type: SchemaType.OBJECT,
            description: "Product ratings and reviews",
            properties: {},
          },
          isActive: {
            type: SchemaType.BOOLEAN,
            description:
              "Indicates if the product is active and visible in the store",
          },
          averageRating: {
            type: SchemaType.NUMBER,
            description: "Average rating calculated from reviews",
          },
          totalReviews: {
            type: SchemaType.NUMBER,
            description: "Total number of reviews received",
          },
          lastReview: {
            type: SchemaType.OBJECT,
            description: "Most recent review details",
            properties: {},
          },
        },
        required: [
          "productName",
          "description",
          "category",
          "isDigital",
          "price",
          "discount",
          "stockQuantity",
          "maxStock",
          "gender",
          "availableSizes",
          "media",
          "availableColors",
          "weight",
          "shippingDetails",
          "ratings",
          "isActive",
          "storeId",
        ],
      },
    },
    {
      name: "createStore",
      description:
        "This action is used to create a new store for the user. ...", // Full description here
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          storeName: {
            type: SchemaType.STRING,
            description: "Name of the store",
          },
          productType: {
            type: SchemaType.STRING,
            description: "Type of product",
          },
          templateId: {
            type: SchemaType.STRING,
            description: "This will only help clone a store with the template",
          },
        },
        required: ["storeName", "productType"],
      },
    },
    {
      name: "sendEmail",
      description:
        "This action is used to send an email to users associated with the store. ...", // Full description here
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          reciepient: {
            type: SchemaType.STRING,
            description: "Recipient email address",
          },
          email: {
            type: SchemaType.STRING,
            description: "Email content in HTML format",
          },
          replyTo: {
            type: SchemaType.STRING,
            description: "Reply-to email address",
          },
          subject: { type: SchemaType.STRING, description: "Email subject" },
        },
        required: ["reciepient", "email"],
      },
    },
    {
      name: "createOrder",
      description:
        "This action is used to create an order in the user's store. ...", // Full description here
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          products: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              description: "IDs",
              properties: {
                productId: {
                  type: SchemaType.STRING,
                  description: "ID of the product",
                },
                quantity: {
                  type: SchemaType.NUMBER,
                  description: "Quantity of the product",
                },
                size: {
                  type: SchemaType.STRING,
                  description:
                    "This is type of size S, M, L, X, XL, XXL --Optional",
                },
              },
              required: ["productId", "quantity"],
            },
            description: "List of products included in the order",
          },
          customerDetails: {
            type: SchemaType.OBJECT,
            properties: {
              shippingAddress: {
                type: SchemaType.OBJECT,
                description: "Customer's shipping address",
                properties: {},
              },
              name: { type: SchemaType.STRING, description: "Customer's name" },
              email: {
                type: SchemaType.STRING,
                description: "Customer's email",
              },
              phone: {
                type: SchemaType.STRING,
                description: "Customer's phone number",
              },
            },
            required: ["shippingAddress", "name", "email", "phone"],
          },
          shippingDetails: {
            type: SchemaType.OBJECT,
            description: "Shipping-related details",
            properties: {
              shippingMethod: {
                enum: ["STANDARD", "EXPRESS"],
                type: SchemaType.STRING,
                description: "This is how the user wants its shipping method",
              },
              deliveryType: {
                enum: ["pick_up", "sendbox", "waybill"],
                type: SchemaType.STRING,
              },
              shippingAddress: {
                type: SchemaType.OBJECT,
                description: "Shipping address details",
                properties: {
                  addressLine1: {
                    type: SchemaType.STRING,
                    description: "Street address line 1",
                  },
                  addressLine2: {
                    type: SchemaType.STRING,
                    description: "Street address line 2",
                  },
                  postalCode: {
                    type: SchemaType.STRING,
                    description: "Postal code",
                  },
                  city: {
                    type: SchemaType.STRING,
                    description: "City",
                  },
                  state: {
                    type: SchemaType.STRING,
                    description: "State or province",
                  },
                  country: {
                    type: SchemaType.STRING,
                    description: "Country",
                  },
                },
                required: ["state", "country"],
              },
            },
          },
          deliveryType: {
            type: SchemaType.STRING,
            description: "Type of delivery (e.g., 'Standard', 'Express')",
          },
          note: {
            type: SchemaType.STRING,
            description: "Additional notes for the order",
          },
          coupon: {
            type: SchemaType.STRING,
            description: "Coupon code applied to the order",
          },
        },
        required: [
          "orderStatus",
          "paymentDetails",
          "products",
          "customerDetails",
          "amountPaid",
          "amountLeftToPay",
          "totalAmount",
          "shippingDetails",
          "deliveryType",
        ],
      },
    },
    {
      name: "editStore",
      description: "This function will update the user store ...", // Full description here
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          storeName: {
            type: SchemaType.STRING,
            description: "Name of the store",
          },
          templateId: {
            type: SchemaType.STRING,
            description: "ID of the template used by the store",
          },
          aboutStore: {
            type: SchemaType.STRING,
            description: "Additional information about the store",
          },
          description: {
            type: SchemaType.STRING,
            description: "Detailed description of the store",
          },
          previewFor: {
            type: SchemaType.STRING,
            description: "ID or code for preview purposes",
          },
          customizations: {
            type: SchemaType.OBJECT,
            properties: {
              logoUrl: {
                type: SchemaType.STRING,
                description: "URL of the store logo",
              },
              theme: {
                type: SchemaType.OBJECT,
                description: "Theme customization details",
                properties: {},
              },
              hero: {
                type: SchemaType.OBJECT,
                description: "Hero section details",
                properties: {},
              },
              banner: {
                type: SchemaType.OBJECT,
                properties: {
                  type: {
                    type: SchemaType.STRING,
                    description: "Type of banner",
                  },
                  product: {
                    type: SchemaType.STRING,
                    description: "Associated product for the banner",
                  },
                  descriptionheader: {
                    type: SchemaType.STRING,
                    description: "Banner header text",
                  },
                  btnAction: {
                    type: SchemaType.OBJECT,
                    description: "Action associated with the banner button",
                    properties: {},
                  },
                  buttonLabel: {
                    type: SchemaType.STRING,
                    description: "Label for the banner button",
                  },
                  image: {
                    type: SchemaType.STRING,
                    description: "Image URL for the banner",
                  },
                },
                required: [
                  "type",
                  "product",
                  "descriptionheader",
                  "btnAction",
                  "buttonLabel",
                ],
              },
              category: {
                type: SchemaType.OBJECT,
                properties: {
                  showImage: {
                    type: SchemaType.BOOLEAN,
                    description: "Indicates if category images are displayed",
                  },
                  icon: {
                    type: SchemaType.STRING,
                    description: "Icon representing the category",
                  },
                  header: {
                    type: SchemaType.STRING,
                    description: "Header text for the category section",
                  },
                  image: {
                    type: SchemaType.STRING,
                    description: "Image URL for the category",
                  },
                },
                required: ["showImage", "header"],
              },
              productsPages: {
                type: SchemaType.OBJECT,
                properties: {
                  canFilter: {
                    type: SchemaType.BOOLEAN,
                    description: "Indicates if products can be filtered",
                  },
                  canSearch: {
                    type: SchemaType.BOOLEAN,
                    description: "Indicates if search functionality is enabled",
                  },
                  sort: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.OBJECT, properties: {} },
                    description: "Sorting options available",
                  },
                  havePagination: {
                    type: SchemaType.BOOLEAN,
                    description: "Indicates if pagination is enabled",
                  },
                },
                required: ["canFilter", "canSearch", "sort", "havePagination"],
              },
              productPage: {
                type: SchemaType.OBJECT,
                properties: {
                  showSimilarProducts: {
                    type: SchemaType.BOOLEAN,
                    description: "Indicates if similar products are shown",
                  },
                  style: {
                    type: SchemaType.STRING,
                    description: "Display style for the product page",
                  },
                  showReviews: {
                    type: SchemaType.BOOLEAN,
                    description: "Indicates if product reviews are displayed",
                  },
                },
                required: ["showSimilarProducts", "style", "showReviews"],
              },
              features: {
                type: SchemaType.OBJECT,
                properties: {
                  showFeatures: {
                    type: SchemaType.BOOLEAN,
                    description: "Indicates if features are displayed",
                  },
                  features: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.OBJECT, properties: {} },
                    description: "List of features",
                  },
                  style: {
                    type: SchemaType.STRING,
                    description: "Display style for the features section",
                  },
                },
                required: ["showFeatures", "features", "style"],
              },
              footer: {
                type: SchemaType.OBJECT,
                properties: {
                  style: {
                    type: SchemaType.STRING,
                    description: "Display style for the footer",
                  },
                  showNewsLetter: {
                    type: SchemaType.BOOLEAN,
                    description: "Indicates if the newsletter section is shown",
                  },
                },
                required: ["style", "showNewsLetter"],
              },
            },
          },
          sections: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.OBJECT, properties: {} },
            description: "Custom sections for the store",
          },
        },
        required: ["storeName", "templateId", "customizations"],
      },
    },
  ];
}

export function getCustomerFunctionDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: "findProduct",
      description:
        "This will be use to find product a user request a detail about and then process and give the user a text reponse",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          productName: {
            type: SchemaType.STRING,
            description:
              "This is the name of the product the user wants to know more information about",
          },
          storeId: {
            type: SchemaType.STRING,
            description: "This is the store id of the store",
          },
        },
        required: ["storeId", "productName"],
      },
    },
    {
      name: "findOrder",
      description: "",
      parameters: {
        type: SchemaType.OBJECT, // Corrected to OBJECT
        properties: {
          _id: {
            type: SchemaType.STRING,
            description: "This is order",
          },
          storeId: {
            type: SchemaType.STRING,
            description: "This is storeId",
          },
        },
        required: ["_id", "storeId"],
      },
    },
    {
      name: "findCustomer",
      description: "This is user to get customer data and process the data",
      parameters: {
        type: SchemaType.OBJECT, // Corrected to OBJECT
        properties: {
          email: {
            type: SchemaType.STRING,
            description: "This is use to query the db to get the user",
          },
          storeId: {
            type: SchemaType.STRING,
            description: "This is the store Id",
          },
        },
        required: ["email", "storeId"],
      },
    },
  ];
}
