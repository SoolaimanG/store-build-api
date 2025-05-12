import { FunctionDeclaration } from "@google/generative-ai";
import { Document } from "mongoose";

export type IJoinNewsLetterFrom = "modal" | "input";

export type INewsLetter = {
  email: string;
  joinedFrom: IJoinNewsLetterFrom;
};

export type IPlanType = "free" | "premium";

export type IDiscoveredUsBy =
  | "referral"
  | "social-media"
  | "blog-post"
  | "google-search"
  | "other";

export type IStoreTemplates =
  | "tech"
  | "fitness"
  | "food"
  | "book"
  | "beauty"
  | "decoration";

export type IOTPFor = "login" | "verify-email" | "withdraw";

export type ITimeStamp = {
  createdAt?: string;
  updatedAt?: string;
};

export type IPlan = {
  type: IPlanType;
  subscribedAt: string;
  autoRenew: boolean;
  expiredAt: string;
  amountPaid: number;
};

// Main User Data Structure
export type IUser = {
  _id?: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  plan: IPlan;
  discoveredUsBy: IDiscoveredUsBy;
  firstTimeUser: boolean;
  isEmailVerified: boolean;
  referralCode: string;
  paymentOnHold: boolean;
  welcomeEmailSent?: boolean;
  tutorialVideoWatch?: boolean;
} & ITimeStamp;

export type IOTP = {
  token: string;
  user: string;
  expiredAt: number;
  tokenFor: IOTPFor;
} & ITimeStamp;

export type IReferral = {
  referrer: string;
  referree: string;
  date: Date;
  rewardClaimed: boolean;
} & ITimeStamp;

export interface SignUpBody {
  email: string;
  storeName: string;
  fullName: string;
  referralCode?: string;
  productType: string;
}

export type IBannerType = "discount" | "best-selling";
export type IBtnAction = "goToPage" | "checkOut";
export type ISortBy = "price" | "discount" | "date" | "name";
export type IProductToShow =
  | "random"
  | "best-sellers"
  | "expensive"
  | "discounted";
export type IDisplay = "grid" | "flex";
export type IDisplayStyle = "one" | "two" | "three";

export type IStoreFeatures = {
  header: string;
  description: string;
  style: IDisplayStyle;
  image: string;
};

export type ISection = {
  _id?: string;
  header: string;
  products: IProductToShow;
  display: IDisplay;
};

export type IStoreStatus = "active" | "on-hold" | "banned";
export type IPaymentStatus = "successful" | "paid" | "failed" | "pending";
export type IPaymentDetails = {
  accountNumber: string;
  bankName: string;
  accountName: string;
};

export type IStoreTheme = {
  id: string;
  name: string;
  primary: string;
  secondary: string;
};

export type IStoreHeroSection = {
  product: string;
  message: string;
  description: string;
  btnAction: "addToCart" | "buyNow";
  image: string;
  style: IDisplayStyle;
};

export type IStore = {
  _id?: string;
  storeName: string;
  storeCode: string;
  productType: string;
  templateId: string;
  status: IStoreStatus;
  aboutStore?: string;
  description?: string;
  balance: number;
  owner: string;
  isActive: boolean;
  previewFor?: string;
  customizations?: {
    logoUrl: string;
    theme?: IStoreTheme;
    hero?: IStoreHeroSection;
    banner?: {
      type: IBannerType;
      product: string;
      description: string;
      header: string;
      btnAction: IBtnAction;
      buttonLabel: string;
      image?: string;
    };
    category?: {
      showImage: boolean;
      icon?: string;
      header: string;
      image?: string;
    };
    productsPages: {
      canFilter: boolean;
      canSearch: boolean;
      sort: ISortBy[];
      havePagination: boolean;
    };
    productPage: {
      showSimilarProducts: boolean;
      style: IDisplayStyle;
      showReviews: boolean;
    };
    features: {
      showFeatures: boolean;
      features: IStoreFeatures[];
      style: IDisplayStyle;
    };
    footer: {
      style: IDisplayStyle;
      showNewsLetter: boolean;
    };
  };
  sections?: ISection[];
  lockedBalance?: number;
  pendingBalance?: number;
} & ITimeStamp;

export type IStoreSettings = {
  storeId: string;
  storeAddress?: (ICustomerAddress & { isDefault?: boolean })[];
};

export type ICategory = {
  _id: string;
  slot: string;
  img?: string;
  icon?: string;
  name: string;
  storeId: string;
};

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  storeId?: string;
  isEmailVerified?: boolean;
}

export type ICheckFor = "storeName" | "email";

export interface TransactionResponse {
  status: string; // "success"
  message: string; // "Transaction fetched successfully"
  data: TransactionData;
}

export interface TransactionData {
  id: number; // 288200108
  tx_ref: string; // "LiveCardTest"
  flw_ref: string; // "YemiDesola/FLW275407301"
  device_fingerprint: string; // "N/A"
  amount: number; // 100
  currency: string; // "NGN"
  charged_amount: number; // 100
  app_fee: number; // 1.4
  merchant_fee: number; // 0
  processor_response: string; // "Approved by Financial Institution"
  auth_model: string; // "PIN"
  ip: string; // "::ffff:10.5.179.3"
  narration: string; // "CARD Transaction "
  status: string; // "successful"
  payment_type: string; // "card"
  created_at: string; // "2020-07-15T14:31:16.000Z"
  account_id: number; // 17321
  card: CardDetails;
  meta: null | any; // For cases when meta contains other types of data
  amount_settled: number; // 98.6
  customer: CustomerDetails;
}

export interface CardDetails {
  first_6digits: string; // "232343"
  last_4digits: string; // "4567"
  issuer: string; // "FIRST CITY MONUMENT BANK PLC"
  country: string; // "NIGERIA NG"
  type: string; // "VERVE"
  token: string; // "flw-t1nf-4676a40c7ddf5f12scr432aa12d471973-k3n"
  expiry: string; // "02/23"
}

export interface CustomerDetails {
  _id?: string;
  name: string;
  phone_number: string;
  email: string;
  created_at: string;
}

export type ISubscription = {
  _id: string;
  tx_ref: string;
  user: string;
  amountPaid: number;
  paymentType: string;
  status: IPaymentStatus;
} & ITimeStamp;

export type ICustomer = {
  email: string;
  phoneNumber: string;
  name?: string;
};

export interface CustomerDetails {
  email: string;
  name: string;
}

export interface Order extends Document {
  storeId: string;
  customerDetails: CustomerDetails;
  amountPaid: number;
  products: any[]; // Replace 'any' with a proper product type if available
  updatedAt: Date;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  amountSpent: number;
  itemsBought: number;
  lastPurchase: Date;
}

export interface CustomerStats {
  label: string;
  value: number;
  percentage: number;
  formattedValue?: string; // Add this line
}

export interface GetCustomersQuery {
  search?: string;
  sortBy?: "recent" | "spend" | "vip";
  page?: number;
  limit?: number;
  filter?: string;
}

export interface GetCustomersResponse {
  customerStats: CustomerStats[];
  customers: Customer[];
  totalCustomers: number;
  totalPages: number;
}

export type IOrderPaymentDetails = {
  paymentStatus: IPaymentStatus;
  paymentMethod: string;
  transactionId?: string; // Unique ID for the payment transaction
  paymentDate?: string; // Date and time of payment
  paymentLink?: string;
  tx_ref?: string;
};

export type ITutorial = {
  _id?: string;
  title: string;
  description: string;
  category: string;
  isCompleted?: boolean;
  user: string;
  rating: number;
  videoId?: string;
  type: "video" | "image";
};

export type ICustomerAddress = {
  _id?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat?: number;
  lng?: number;
};

export enum PATHS {
  HOME = "/",
  FEATURES = "#features",
  SUBSCRIBE = "#subscribe",
  SIGNUP = "/sign-up",
  SIGNIN = "/sign-in",
  DASHBOARD = "/store-dashboard/",
  STORE_PRODUCTS = "/store-products/",
  STORE_FRONT = "/store-front/",
  STORE_ORDERS = "/store-orders/",
  STORE_SETTINGS = "/store-settings/",
  STORE_CUSTOMERS = "/store-customers/",
  STORE_INTEGRATIONS = "/store-integrations/",
  STORE = "/store/",
  STORE_COUPON = "/store/coupon/",
  CONFIRM_FLUTTERWAVE_PAYMENT = "/flutterwave/payment/",
}

export type IShippingDetails = {
  shippingMethod: "STANDARD" | "EXPRESS";
  shippingCost: number;
  estimatedDeliveryDate: string;
  trackingNumber?: string;
  carrier: "SENDBOX" | string;
};

export interface BreakdownItem {
  code: string;
  name: string;
  value: number;
  description?: string;
}

export interface Rate {
  base_fee: number;
  is_enabled: boolean;
  applied_credits: number;
  volumetric_weight: number;
  currency: string;
  pickup_date: string; // ISO datetime string
  discount_fee: number;
  rate_type: string;
  vat: number;
  customs_options: string[];
  insurance_fee: number;
  caption: string;
  additional_fee: number;
  billable_weight: number;
  service_code: string;
  insurance_option: string;
  insurance_cap: number;
  fee: number;
  delivery_eta_string: string;
  pickup_eta_string: string;
  breakdown: BreakdownItem[];
  delivery_window: string;
  rate_card_id: string;
  sla_description: string;
  code: string;
  description: string;
  name: string;
  key: string;
  delivery_date: string; // ISO datetime string
  pickup_window: string;
}

export interface IItem {
  value: number;
  quantity: number;
  name: string;
  item_type: string;
  hts_code: string;
  disclaim: boolean;
}

export interface Address {
  country: string;
  state: string;
  last_name: string;
  lat: number;
  first_name: string;
  post_code: string;
  city: string;
  lng: number;
}

export interface ShipmentResponse {
  package_type: string;
  service_code: string;
  status: string;
  destination: Address;
  currency: string;
  items: IItem[];
  weight: number;
  rates: Rate[];
  origin: Address;
  region: string;
  rate: Rate;
  service_type: string;
  rate_type: string;
}

export type IDeliveryType = "pick_up" | "waybill" | "sendbox";

export type IOrderStatus =
  | "Pending"
  | "Completed"
  | "Cancelled"
  | "Refunded"
  | "Shipped"
  | "Processing";

export type OrderQuery = {
  $or?: Array<Record<string, any>>;
  [key: string]: any;
};

export type IOrderProduct = IProduct & {
  color?: string;
  size: string;
  quantity?: number;
};

export type IOrder = {
  _id?: string;
  storeId: string;
  orderStatus: IOrderStatus;
  paymentDetails: IOrderPaymentDetails;
  products: IOrderProduct[];
  customerDetails: { shippingAddress: ICustomerAddress } & ICustomer;
  amountPaid: number;
  amountLeftToPay: number;
  totalAmount: number;
  shippingDetails: IShippingDetails;
  deliveryType: IDeliveryType;
  note?: string;
  coupon?: string;
} & ITimeStamp;

export type IProductMedia = {
  _id: string;
  url: string; // URL of the product image
  altText?: string; // Alt text for accessibility
  mediaType: "image" | "video";
};

export type IVariantOption = {
  name: string; // Name of the option (e.g., Red, Large)
  priceAdjustment?: number; // Optional price adjustment for the variant
};

export type IVariant = {
  variantName: string; // Name of the variant (e.g., Color, Size)
  options: IVariantOption[]; // Array of options for the variant
};

export type IProductDimensions = {
  length?: number; // Length of the product
  width?: number; // Width of the product
  height?: number; // Height of the product
};

export type IProductShippingDetails = {
  isFreeShipping: boolean;
  shippingCost?: number;
  shippingRegions: string[];
  shipAllRegion: boolean;
};

export interface IRatings {
  average: number; // Average rating (1-5 scale)
  totalReviews: number; // Total number of reviews
}

export type IAvailableColors = {
  name: string;
  colorCode: string;
};

export type IGender = "M" | "F" | "U";

export type IProduct = {
  _id?: string;
  storeId: string;
  productName: string;
  description: string;
  category: string;
  tags?: string[];
  isDigital: boolean;
  price: {
    default: number;
    useDefaultPricingForDifferentSizes: boolean;
    sizes: Record<string, number>[];
  };
  discount: number;
  digitalFiles?: string[];
  stockQuantity: number;
  maxStock: number;
  gender: IGender[];
  availableSizes: string[];
  media: IProductMedia[];
  availableColors: IAvailableColors[];
  weight: number;
  dimensions?: IProductDimensions;
  shippingDetails: IProductShippingDetails;
  ratings: IRatings; // Product ratings and reviews
  isActive: boolean;
  averageRating?: number;
  totalReviews?: number;
  lastReview?: IRating;
} & ITimeStamp;

export interface IRating {
  storeId: string;
  productId: string;
  userEmail: string;
  rating: number;
  note: string;
}

export type IUserProductPreference = {
  color: string;
  size: string;
  quantity: number;
};

export type IPaymentIntegration = {
  chargeCustomer: boolean;
  useCustomerDetails: boolean;
};

export type IChatBotIntegrationPermissions = {
  allowProductAccess: boolean;
  allowOrderAccess: boolean;
  allowCustomerAccess: boolean;
};

export type IChatBotIntegration = {
  name: string;
  language: "en";
  permissions: IChatBotIntegrationPermissions;
};

export type IDeliveryIntegration = {
  deliveryNationwide: boolean;
  shippingRegions?: string[];
};

export type IUserActions = "ADD_PRODUCT" | "UPLOAD_VIDEO" | "USE_AI";

export type IMediaIntegration = {
  images: "1" | "2" | "3";
};

export type IntegrationProps = {
  isConnected: boolean;
  name: string;
  settings?:
    | IChatBotIntegration
    | IDeliveryIntegration
    | IMediaIntegration
    | IPaymentIntegration;
  apiKeys?: {
    accessKey?: string;
    token?: string;
  };
  subcription?: {
    comment?: string;
    start_date: string;
    end_date: string;
  };
};

export type Integration = {
  _id: string;
  storeId: string;
  integration: IntegrationProps;
} & ITimeStamp;

export interface chargePayload<T = any> {
  amount: number;
  email: string;
  reference: string;
  metadata?: T;
}

export interface chargeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface VerifyChargeResponse<T = any> {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    receipt_number: string | null;
    amount: number;
    message: string | null;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: T;
    log: {
      start_time: number;
      time_spent: number;
      attempts: number;
      errors: number;
      success: boolean;
      mobile: boolean;
      input: any[];
      history: {
        type: string;
        message: string;
        time: number;
      }[];
    };
    fees: number;
    fees_split: string | null;
    authorization: {
      authorization_code: string;
      bin: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      channel: string;
      card_type: string;
      bank: string;
      country_code: string;
      brand: string;
      reusable: boolean;
      signature: string;
      account_name: string | null;
    };
    customer: {
      id: number;
      first_name: string | null;
      last_name: string | null;
      email: string;
      customer_code: string;
      phone: string | null;
      metadata: string | null;
      risk_action: string;
      international_format_phone: string | null;
    };
    plan: string | null;
    split: Record<string, any>;
    order_id: string | null;
    paidAt: string;
    createdAt: string;
    requested_amount: number;
    pos_transaction_data: string | null;
    source: string | null;
    fees_breakdown: string | null;
    connect: string | null;
    transaction_date: string;
    plan_object: Record<string, any>;
    subaccount: Record<string, any>;
  };
}

export type ICoupon = {
  _id?: string;
  storeId: string;
  couponCode?: string; // Optional for automatically applied discounts
  expirationDate: string; // Prefer ISO 8601 format
  selectedProducts: string[]; // Array of product IDs
  selectedCategories: string[]; // Array of category IDs
  appliedTo: "shoppingCart" | "products";
  type: "percentageCoupon" | "nairaCoupon";
  discountValue: number; // Percentage or amount based on `type`
  maxUsage: number; // Total allowed usage across all customers
  customerUsage?: Record<string, number>; // Optional: tracks usage per customer
} & ITimeStamp;

export type ShippingData = {
  items: {
    value: number;
    quantity: number;
    item_type: string;
    name: string;
    hts_code: string | null;
    disclaim: boolean;
  }[];
  rates: {
    fee: number;
    key?: string;
    insurance_option: string;
    applied_credits: number;
    insurance_fee: number;
    breakdown: {
      value: number;
      code: string;
      name: string;
      description: string;
    }[];
    delivery_window: string;
    is_enabled: boolean;
    caption?: string;
    currency: string;
    additional_fee: number;
    insurance_cap: number;
    delivery_date: string;
    discount_fee: number;
    pickup_eta_string: string;
    rate_card_id?: string;
    sla_description: string;
    base_fee: number;
    description: string;
    vat: number;
    pickup_date: string;
    pickup_window: string;
    name: string;
    rate_type: string;
    volumetric_weight: number;
    code: string;
    customs_options: string[];
    billable_weight: number;
    service_code: string;
    delivery_eta_string: string;
  }[];
  destination: {
    country: string;
    city: string;
    post_code: string;
    state: string;
    lng: number;
    lat: number;
  };
  rate_type: string;
  status: string;
  currency: string;
  service_type: string;
  rate: {
    fee: number;
    key?: string;
    insurance_option: string;
    applied_credits: number;
    insurance_fee: number;
    breakdown: {
      value: number;
      code: string;
      name: string;
      description: string;
    }[];
    delivery_window: string;
    is_enabled: boolean;
    caption?: string;
    currency: string;
    additional_fee: number;
    insurance_cap: number;
    delivery_date: string;
    discount_fee: number;
    pickup_eta_string: string;
    rate_card_id?: string;
    sla_description: string;
    base_fee: number;
    description: string;
    vat: number;
    pickup_date: string;
    pickup_window: string;
    name: string;
    rate_type: string;
    volumetric_weight: number;
    code: string;
    customs_options: string[];
    billable_weight: number;
    service_code: string;
    delivery_eta_string: string;
  };
  origin: {
    country: string;
    city: string;
    post_code: string;
    state: string;
    lng: number;
    lat: number;
  };
  region: string;
  service_code: string;
  weight: number;
  connector_rates: any[];
  package_type: string;
};

export type PickUpCreationResponse = {
  pickup_date: string;
  has_waybill_error: boolean;
  selected_courier_id: string;
  origin_city: string;
  pickup_courier: Record<string, unknown>;
  code: string;
  recurrent_cards: any[];
  origin_name: string;
  delivery_priority: Record<string, unknown>;
  origin_state: {
    name: string;
    code: string;
  };
  package_invoice_image: string | null;
  destination_state_name: string;
  current_status: {
    name: string;
    code: string;
  };
  user_id: string;
  destination_country: {
    name: string;
    code: string;
  };
  date_created: string;
  weight: number;
  paid: number;
  pod: string;
  destination_state_code: string;
  payment_data: {
    checkout_id: string;
    status: string;
    entity_id: string | null;
    currency: string;
    reference_code: string;
    payment_source_code: string | null;
    amount: number;
  };
  destination_state: {
    name: string;
    code: string;
  };
  destination_email: string;
  origin_country: {
    name: string;
    code: string;
  };
  origin_state_code: string;
  destination_country_name: string;
  items: {
    name: string;
    weight: number;
    quantity: number;
    piece_id: string;
    description: string;
    item_type: {
      name: string;
      code: string;
    };
    value: number;
  }[];
  region: string;
  status_code: string;
  fee: number;
  status: {
    name: string;
    code: string;
  };
  package_type: {
    weight: number;
    name: string;
    description: string;
  };
  origin_country_name: string;
  possible_actions: {
    name: string;
    code: string;
  }[];
  tracking_code: string;
  amount: number;
  package_delivery_attempt: number;
  _id: string;
  origin_email: string | null;
  insurance_option_code: string;
  origin_state_name: string;
  origin_street: string;
  last_updated: string;
  incoming_option: {
    name: string | null;
    code: string | null;
  };
  id: string;
  merchant: {
    name: string;
    email: string;
    phone: string;
  };
  pk: string;
  package_connector_other_charge: number;
  destination_city: string;
  date_booked: string;
  origin_phone: string;
  destination_name: string;
  current_awb: string | null;
  courier: {
    name: string;
  };
  origin_country_code: string;
  destination_phone: string;
  destination_street: string;
  max_quoted_fee: number;
  selected_courier: string;
  min_quoted_fee: number;
  waybill_error: string;
  courier_id: string;
  destination_country_code: string;
  quantity: number;
  total_value: number;
};

export type ITransactionType =
  | "Funding"
  | "Withdrawal"
  | "Refund"
  | "Transfer"
  | "Payment";
export type IPaymentChannel = "balance" | "billStack" | "flutterwave";

export interface ITransaction<T = any> extends ITimeStamp {
  txRef: string;
  paymentMethod: string;
  amount: number;
  paymentStatus: IPaymentStatus;
  paymentFor: IPaymentFor;
  _id?: string;
  identifier: string;
  meta?: T;
  type: ITransactionType;
  storeId: string;
  paymentChannel: IPaymentChannel;
}

export type IIntegrationSubscription = {
  integrationId: string;
  amountPaid: number;
  expiredAt: string;
  paymentChannel: "balance" | "checkout";
  transactionId: string;
  userId: string;
  storeId: string;
  isActive: boolean;
} & ITimeStamp;

// StoreBuild AI Configs

export interface AIActions<T = any> {
  name: string;
  arguments: T;
  description: string;
}

export type StoreActions = {
  role: "admin" | "user";
  actions: FunctionDeclaration[];
};

export interface Metadata {
  tokensUsed?: number;
  model?: string;
  confidenceScore?: number;
}

export interface IChatBotConversation extends ITimeStamp {
  _id?: string;
  userPrompt?: string;
  aiResponse?: string;
  userId: string;
  sessionId: string;
  actionPerformed?: string;
  intent?: string;
  metadata?: Metadata;
}

export type IStoreBankAccounts = {
  storeId: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  isDefault: boolean;
  userId: string;
  nin: string;
} & ITimeStamp;

export type IPaymentFor = "order" | "subscription" | "store-build-ai";

export type virtualAccountCreationProps = {
  type: "oneTimeAccount" | "dedicatedAccount";
  storeId: string;
  userId: string;
  meta?: any;
  paymentFor: IPaymentFor;
  amount: number;
  name: string;
  email?: string;
};

export interface paymentAccountCreationProps<T = any> {
  tx_ref: string;
  orderId?: string;
  amount: number;
  storeId: string;
  paymentFor: IPaymentFor;
  subcriptionId?: string;
  meta?: T;
  createdAt?: string;
  updatedAt?: string;
}

export type budPayPayload = {
  email: string;
  amount: string;
  currency: string;
  reference: string;
  name: string;
};

//FLUTTERWAVE TRANSACTION REQUEST
type ICustomerDetails = {
  email: string;
  name?: string;
  phonenumber?: string;
};

type Customizations = {
  title?: string;
  logo?: string;
  description?: string;
};

type Subaccount = {
  id: string; // Assuming ID is a string, update the type if needed.
  [key: string]: any; // Optional extra fields for flexibility.
};

export interface TransactionRequest<T = any> {
  tx_ref: string; // Unique reference code for the transaction.
  amount: number; // Amount to charge the customer.
  currency?: string; // Currency to charge in, defaults to "NGN".
  redirect_url: string; // URL to redirect the customer after payment.
  customer: ICustomerDetails; // Customer details (email is required).
  session_duration?: number; // Duration in minutes, max 1440.
  max_retry_attempt?: number; // Maximum retry attempts after failure.
  customizations?: Customizations; // Options to customize payment modal.
  meta?: T; // Extra information to store alongside the transaction.
  payment_plan?: string; // Payment plan ID for recurring payments.
  subaccounts?: Subaccount[]; // Array of subaccounts for payment splitting.
  payment_options?: string[]; // Payment methods to be displayed.
}

export type FlutterwaveResponse = {
  status: "success";
  message: string;
  data: {
    link: string;
  };
};

//SHIPMENT --> SendBox

export interface State {
  name: string;
  code: string;
}

export interface Country {
  name: string;
  code: string;
}

export interface Status {
  name: string;
  code: string;
}

export interface PaymentData {
  checkout_id: string;
  status: string;
  entity_id: null | string;
  currency: string;
  reference_code: string;
  payment_source_code: null | string;
  amount: number;
}

export interface ItemType {
  name: string;
  code: string;
}

export interface ShippingItem {
  name: string;
  weight: number;
  quantity: number;
  piece_id: string;
  description: string;
  item_type: ItemType;
  value: number;
}

export interface Action {
  name: string;
  code: string;
}

export interface PackageType {
  weight: number;
  name: string;
  description: string;
}

export interface IncomingOption {
  name: null | string;
  code: null | string;
}

export interface Merchant {
  name: string;
  email: string;
  phone: string;
}

export interface Courier {
  name: string;
}

export interface DeliveryPriority {
  [key: string]: any; // This appears to be an empty object in the example
}

export interface PickupCourier {
  [key: string]: any; // This appears to be an empty object in the example
}

export interface ShipmentResponse {
  pickup_date: string;
  has_waybill_error: boolean;
  selected_courier_id: string;
  origin_city: string;
  pickup_courier: PickupCourier;
  code: string;
  recurrent_cards: any[]; // Empty array in the example
  origin_name: string;
  delivery_priority: DeliveryPriority;
  origin_state: State;
  package_invoice_image: null | string;
  destination_state_name: string;
  current_status: Status;
  user_id: string;
  destination_country: Country;
  date_created: string;
  weight: number;
  paid: number;
  pod: string;
  destination_state_code: string;
  payment_data: PaymentData;
  destination_state: State;
  destination_email: string;
  origin_country: Country;
  origin_state_code: string;
  destination_country_name: string;
  region: string;
  status_code: string;
  fee: number;
  origin_country_name: string;
  possible_actions: Action[];
  tracking_code: string;
  amount: number;
  package_delivery_attempt: number;
  _id: string;
  origin_email: null | string;
  insurance_option_code: string;
  origin_state_name: string;
  origin_street: string;
  last_updated: string;
  incoming_option: IncomingOption;
  id: string;
  merchant: Merchant;
  pk: string;
  package_connector_other_charge: number;
  destination_city: string;
  date_booked: string;
  origin_phone: string;
  destination_name: string;
  current_awb: null | string;
  courier: Courier;
  origin_country_code: string;
  destination_phone: string;
  destination_street: string;
  max_quoted_fee: number;
  selected_courier: string;
  min_quoted_fee: number;
  waybill_error: string;
  courier_id: string;
  destination_country_code: string;
  quantity: number;
  total_value: number;
}

export interface FlutterwaveVirtualAccountResponse {
  status: "success";
  message: "Virtual account created";
  data: {
    response_code: string;
    response_message: string;
    flw_ref: string;
    order_ref: string;
    account_number: string;
    account_status: "active" | "inactive";
    frequency: 1;
    bank_name: string;
    created_at: string;
    expiry_date: string;
    note: string;
    amount: string;
  };
}

export interface BillStackWebHook {
  event: "PAYMENT_NOTIFIFICATION";
  data: {
    type: "RESERVED_ACCOUNT_TRANSACTION";
    reference: string;
    merchant_reference: string;
    wiaxy_ref: string;
    amount: number;
    created_at: string;
    account: {
      account_number: string;
      account_name: string;
      bank_name: string;
      created_at: string;
    };
    payer: {
      account_number: string;
      first_name: string;
      last_name: string;
      createdAt: string;
    };
  };
}

export interface IBank {
  id: number;
  name: string;
  slug: string;
  code: string;
  longcode: string;
  gateway: "emandate";
  pay_with_bank: boolean;
  supports_transfer: boolean;
  active: boolean;
  country: "Nigeria";
  currency: "NGN";
  type: string;
  is_deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface getProductFilters {
  q?: string;
  sort?: "default" | "stock-level" | "low-to-high" | "high-to-low";
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  size?: number;
  storeId: string;
  productsToShow?: string;
  colors?: string[];
  sizes?: string[];
  gender?: IGender[];
  rating?: number;
  isActive?: boolean;
}

export interface IDedicatedAccount {
  accountRef: string;
  accountDetails: {
    accountNumber: string;
    accountName: string;
    bankName: string;
  };
  ref: string;
  storeId: string;
}

export type IBillStackReservedBankTypes =
  | "9PSB"
  | "PALMPAY"
  | "BANKLY"
  | "PROVIDUS"
  | "SAFEHAVEN";

export interface IBillStackDedicatedAccountResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    account: [
      {
        account_number: string;
        account_name: string;
        bank_name: string;
        bank_id: IBillStackReservedBankTypes;
        created_at: string;
      }
    ];
    meta: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

export interface IWithdrawalQueue extends ITimeStamp {
  _id?: string; // Unique identifier for the withdrawal request
  userId: string; // ID of user requesting withdrawal
  storeId: string; // ID of store the withdrawal is from
  amount: number; // Amount to withdraw
  status: IPaymentStatus; // Current status
  validationPassed: boolean; // Whether validation checks passed
  validationErrors?: string[]; // Any validation error messages
  bankDetails: {
    accountNumber: string; // Bank account number
    accountName: string; // Bank account name
    bankName: string; // Name of the bank
    bankCode: string; // Bank code/routing number
  };
  transactionReference?: string; // Reference ID for the transaction
  processingDate?: Date; // When withdrawal started processing
  completedDate?: Date; // When withdrawal completed
  notes?: string; // Any additional notes/comments
  failureReason?: string; // Reason if withdrawal failed
  ipAddress?: string; // IP address of requester
  userAgent?: string; // User agent of requester
}

export interface IAiSuggestion extends ITimeStamp {
  title: string;
  description: string;
  action: string;
  storeId: string;
}
