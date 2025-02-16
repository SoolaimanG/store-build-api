import dotenv from "dotenv";
import { generateRandomString } from "./helper";
import { IStore } from "./types";

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
  "paystack",
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
};

export const DEFAULT_STORE_CONFIG: IStore = {
  storeName: "New Store " + generateRandomString(5),
  storeCode: generateRandomString(5),
  productType: "",
  templateId: generateRandomString(18),
  status: "active",
  aboutStore: "",
  description: "",
  balance: 0,
  owner: "",
  isActive: true,
  customizations: {
    logoUrl: "",
    banner: {
      type: "discount",
      product: "",
      description: "",
      header: "We bring the store to your door",
      btnAction: "goToPage",
      buttonLabel: "Shop Now",
      image: "",
    },
    category: {
      showImage: true,
      icon: "",
      header: "Categories",
      image: "",
    },
    productsPages: {
      canFilter: true,
      canSearch: true,
      sort: ["date", "discount", "name"],
      havePagination: true,
    },
    productPage: {
      showSimilarProducts: true,
      style: "one",
      showReviews: true,
    },
    features: {
      showFeatures: false,
      features: [],
      style: "one",
    },
    footer: {
      style: "one",
      showNewsLetter: true,
    },
  },
};
