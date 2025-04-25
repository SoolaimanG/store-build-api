import axios from "axios";
import { config } from "./constant";
import { findStore, findUser, sendEmail } from "./helper";
import crypto from "crypto";
import {
  IntegrationModel,
  OrderModel,
  StoreSttings,
  TransactionModel,
  UserModel,
} from "./models";
import {
  FlutterwaveVirtualAccountResponse,
  BillStackWebHook,
  ICustomer,
  ICustomerAddress,
  IOrderProduct,
  IPaymentFor,
  IStore,
  ITransaction,
  IUser,
  ShipmentResponse,
  PATHS,
  FlutterwaveResponse,
} from "./types";
import mongoose from "mongoose";
import { generateSubscriptionEmail } from "./emails";

export const restrictPropertyModification = (
  data: object,
  restrictedKeys: string[]
) => {
  const allKeys = Object.keys(data);

  for (const restrictedKey of restrictedKeys) {
    if (allKeys.includes(restrictedKey)) {
      throw new Error(
        "UNAUTHORIZE_ACTION: You are not allow to modify/configure this properties"
      );
    }
  }
};

//INTEGRATION
export class SendBox {
  auth: string;
  storeId: string;

  constructor(storeId: string, auth?: string, assert = false) {
    this.storeId = storeId;
    this.auth = auth;

    if (assert) {
      this.getIntegration().then((integration) => {
        if (!integration) {
          throw new Error(
            "SENDBOX_NOT_CONFIGURED: Sendbox integration is not configured on this store"
          );
        }
      });
    }
  }

  async getIntegration() {
    const integration = await IntegrationModel.findOne({
      "integration.name": "sendbox",
      storeId: this.storeId,
    }).select("+apiKeys");

    return integration;
  }

  async saveSendBoxAccessKey() {
    if (!this.auth) {
      throw new Error("ACCESS_TOKEN_REQUIRED: Please provide an access token");
    }

    const integration = await this.getIntegration();

    integration.integration.apiKeys = {
      accessKey: this.auth,
      token: this.auth,
    };

    return await integration.save({ validateModifiedOnly: true });
  }

  async disconnectSendBox() {
    const integration = await this.getIntegration();

    if (!integration) {
      throw new Error("NO_SENDBOX_INTEGRATION: No Sendbox integration found");
    }

    integration.integration.isConnected = false;

    return await integration.save({ validateModifiedOnly: true });
  }

  async deleteApiKeys() {
    const integration = await this.getIntegration();

    if (!integration) {
      throw new Error("NO_SENDBOX_INTEGRATION: No Sendbox integration found");
    }

    integration.integration.apiKeys = {};

    return await integration.save({ validateModifiedOnly: true });
  }

  async calculateShippingCost(
    customerDetails: ICustomer & { shippingDetails: ICustomerAddress },
    productValue: number,
    products: IOrderProduct[]
  ) {
    if (!customerDetails) {
      throw new Error("Customer address is required to calculate cost");
    }

    const checkCustomerDetails = !(
      customerDetails.email &&
      customerDetails.shippingDetails.state &&
      customerDetails.phoneNumber
    );

    if (checkCustomerDetails) {
      throw new Error(
        "Missing required parameter: Phone Number, Email or State"
      );
    }

    customerDetails.shippingDetails.country = "nigeria";

    const integration = await this.getIntegration();

    const [storeSettings, store] = await Promise.allSettled([
      StoreSttings.findOne({ storeId: this.storeId }),
      findStore(this.storeId),
    ]);

    if (storeSettings.status !== "fulfilled" || store.status !== "fulfilled") {
      throw new Error("Something went wrong: Store Settings or Store");
    }

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

    if (!settings) {
      throw new Error(
        "Store address is not available yet! Please contact store to provide branch address."
      );
    }

    const weight = products.reduce((acc, curr) => curr.weight + acc, 0) || 2;

    const items = products.map((p) => ({
      name: p.productName,
      description: p.description,
      quantity: p.quantity,
      value: p.discount || p.price.default,
    }));

    const calculateDimension = (dimension: "height" | "width" | "length") => {
      return (
        products.reduce((acc, curr) => curr.dimensions[dimension] + acc, 0) || 1
      );
    };

    const height = calculateDimension("height");
    const width = calculateDimension("width");
    const length = calculateDimension("length");

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

    const res = await axios.post<ShipmentResponse>(
      `${config.SEND_BOX_URL}/shipping/shipment_delivery_quote`,
      payload,
      {
        headers: {
          Authorization: integration.integration.apiKeys["accessKey"],
          "Content-Type": "application/json",
        },
      }
    );

    return res?.data;
  }

  async createShipment(
    payload: {
      packageType: "general" | "food";
      pickUpDate: string;
    },
    orderId: string,
    useDefaultAddress = false
  ) {
    let storeAddress: ICustomerAddress;
    const { integration } = await this.getIntegration();

    const order = await OrderModel.findById(orderId);
    const { owner } = await findStore(this.storeId);
    const {
      email: storeEmail,
      fullName,
      phoneNumber,
    } = await findUser(owner, true, { email: 1, fullName: 1, phoneNumber: 1 });

    const [firstName, lastName] = fullName.split(" ");

    const customerDetails = order.customerDetails;

    if (useDefaultAddress) {
      const settings = await StoreSttings.findOne({ storeId: this.storeId });

      const address = settings.storeAddress.find(
        (address) => address.isDefault
      );

      if (!address) {
        throw new Error(
          "Please Add your store address before creating a new shipment."
        );
      }

      storeAddress = address;
    }

    const weight =
      order.products.reduce((acc, curr) => curr.weight + acc, 0) || 2;

    const calculateDimension = (dimension: "height" | "width" | "length") => {
      return (
        order.products.reduce(
          (acc, curr) => curr.dimensions[dimension] + acc,
          0
        ) || 1
      );
    };

    const height = calculateDimension("height");
    const width = calculateDimension("width");
    const length = calculateDimension("length");

    const items = order.products.map((p) => ({
      name: p.productName,
      description: p.description,
      quantity: p.quantity,
      value: p.discount || p.price.default,
    }));

    const _payload = {
      origin: {
        first_name: firstName,
        last_name: lastName,
        state: storeAddress.state,
        email: storeEmail,
        city: storeAddress.state,
        country: "NG",
        phone: phoneNumber,
        name: "",
      },
      destination: {
        first_name: customerDetails.name,
        last_name: customerDetails.name,
        phone: customerDetails.phoneNumber,
        name: "",
        state: customerDetails.shippingAddress.state,
        email: customerDetails.email,
        city: customerDetails.shippingAddress.state,
        country: "NG",
      },
      weight,
      dimension: {
        length,
        width,
        height,
      },
      incoming_option: "pickup",
      region: "NG",
      service_type: "international",
      package_type: payload.packageType,
      total_value: order.totalAmount,
      currency: "NGN",
      channel_code: "api",
      pickup_date: payload.pickUpDate,
      items,
      service_code: "standard",
      customs_option: "recipient",
    };

    const response = await axios.post<ShipmentResponse>(
      `https://sandbox.staging.sendbox.co/shipping/shipments`,
      _payload,
      {
        headers: {
          Authorization: integration.apiKeys["accessKey"],
        },
      }
    );

    order.shippingDetails.trackingNumber = response.data.tracking_code;
    order.shippingDetails.estimatedDeliveryDate = payload.pickUpDate;
    order.shippingDetails.carrier = "SENDBOX";

    await order.save({
      validateModifiedOnly: true,
    });

    return response?.data;
  }

  async connectSendBox() {
    const integration = await this.getIntegration();

    if (!integration?.integration) {
      integration.integration = {
        isConnected: true,
        settings: {
          deliveryNationwide: false,
          shippingRegions: [],
        },
        apiKeys: {},
        name: "sendbox",
      };

      return await integration.save({
        validateModifiedOnly: true,
      });
    }

    integration.integration.isConnected = true;

    return await integration.save({
      validateModifiedOnly: true,
    });
  }
}

/**
 * PaymentService handles all payment-related operations including virtual account creation,
 * transaction management, and payment verification.
 */
export class PaymentService {
  private ref: string;
  public virtualAccount?: FlutterwaveVirtualAccountResponse;
  public transaction?: ITransaction;
  private amount: number;
  private paymentMethod: string;
  public session: mongoose.ClientSession | null = null;
  private store: IStore | null = null;
  paymentLink: string;

  constructor(amount = 0, paymentMethod = "banktrf") {
    this.amount = amount;
    this.paymentMethod = paymentMethod;
  }

  public async startSession(): Promise<PaymentService> {
    this.session = await mongoose.startSession();
    this.session.startTransaction();
    return this;
  }

  public async cancelSession(): Promise<PaymentService> {
    if (!this.session) {
      throw new Error("No active session to cancel");
    }

    await this.session.abortTransaction();
    await this.session.endSession();
    return this;
  }

  public async commitSession(): Promise<PaymentService> {
    if (!this.session) {
      throw new Error("No active session to commit");
    }

    await this.session.commitTransaction();
    await this.session.endSession();
    return this;
  }

  public async generateRef() {
    this.ref = new mongoose.Types.ObjectId().toString();
    return this;
  }

  public getAccountCreated(): FlutterwaveVirtualAccountResponse {
    if (!this.virtualAccount) {
      throw new Error("Virtual account has not been created yet");
    }
    return this.virtualAccount;
  }

  public async creditStoreOwner(): Promise<PaymentService> {
    if (!this.store) {
      throw new Error("Store not set");
    }

    if (!this.session) {
      throw new Error("No active session");
    }

    await UserModel.findByIdAndUpdate(
      this.store.owner,
      {
        $inc: { balance: this.amount },
      },
      {
        runValidators: true,
        session: this.session,
      }
    );

    return this;
  }

  public getTransaction(): ITransaction {
    if (!this.transaction) {
      throw new Error("Transaction has not been created yet");
    }
    return this.transaction;
  }

  public validateBillStackSignature(signature: string): void {
    if (!signature) {
      throw new Error("Missing signature header");
    }

    const SECRET_KEY = process.env.BILL_STACK_SECRET_KEY;
    if (!SECRET_KEY) {
      throw new Error("BILL_STACK_SECRET_KEY environment variable is not set");
    }

    // Generate the MD5 hash of the secret key
    const expectedSignature = crypto
      .createHash("md5")
      .update(SECRET_KEY)
      .digest("hex");

    // Compare the received signature with the expected one
    if (signature !== expectedSignature) {
      throw new Error("Invalid signature");
    }
  }

  public async createVirtualAccount({
    note,
    email,
  }: {
    note?: string;
    email: string;
  }): Promise<PaymentService> {
    const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!FLUTTERWAVE_SECRET_KEY) {
      throw new Error("FLUTTERWAVE_SECRET_KEY environment variable is not set");
    }

    const response = await axios.post<FlutterwaveVirtualAccountResponse>(
      "https://api.flutterwave.com/v3/virtual-account-numbers",
      {
        email,
        currency: "NGN",
        amount: this.amount,
        tx_ref: this.ref,
        is_permanent: false,
        narration: note,
      },
      {
        headers: {
          Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    this.virtualAccount = response.data;
    return this;
  }

  public async createTransaction(userId: string, paymentFor?: IPaymentFor) {
    if (!this.virtualAccount) {
      throw new Error(
        "Virtual account must be created before creating a transaction"
      );
    }

    if (!this.session) {
      throw new Error("No active session");
    }

    const transactionData: ITransaction = {
      amount: this.amount,
      meta: { ...this.virtualAccount },
      paymentFor,
      paymentMethod: this.paymentMethod,
      paymentStatus: "pending",
      txRef: this.ref,
      userId,
    };

    try {
      const transaction = new TransactionModel(transactionData);
      await transaction.save({ session: this.session });
      this.transaction = transaction.toObject();
      return this;
    } catch (error) {
      throw new Error(
        `Failed to create transaction: ${(error as Error).message}`
      );
    }
  }

  public async verifyBillStackPayment(
    signature: string,
    payload: BillStackWebHook
  ): Promise<PaymentService> {
    if (!this.session) {
      throw new Error("Session must be started before verifying payment");
    }

    try {
      // Validate the webhook signature
      this.validateBillStackSignature(signature);

      const {
        event,
        data: { type, amount, merchant_reference, created_at },
      } = payload;

      this.amount = amount;

      // Validate the event type
      if (event !== "PAYMENT_NOTIFIFICATION") {
        throw new Error("Invalid Payment Notification");
      }

      if (type !== "RESERVED_ACCOUNT_TRANSACTION") {
        throw new Error("Invalid Payment Type");
      }

      // Find the transaction
      const transaction = await TransactionModel.findOne({
        txRef: merchant_reference,
      }).session(this.session);

      if (!transaction) {
        throw new Error(
          `Transaction not found for reference: ${merchant_reference}`
        );
      }

      this.transaction = transaction.toObject();

      // Check if transaction is already processed
      if (transaction.paymentStatus === "successful") {
        throw new Error("Transaction already processed");
      }

      // Process based on payment type
      if (transaction.paymentFor === "order") {
        await this.processOrderPayment(created_at);
      } else if (transaction.paymentFor === "subscription") {
        await this.processSubscriptionPayment(created_at);
      } else {
        throw new Error(`Unknown payment type: ${transaction.paymentFor}`);
      }

      // Update transaction status
      transaction.paymentStatus = "successful";
      await transaction.save({ session: this.session });

      return this;
    } catch (error) {
      throw new Error(
        `Payment verification failed: ${(error as Error).message}`
      );
    }
  }

  private async processOrderPayment(paymentDate: string): Promise<void> {
    if (!this.transaction || !this.session) {
      throw new Error("Transaction or session not initialized");
    }

    const order = await OrderModel.findById(this.transaction.userId).session(
      this.session
    );

    if (!order) {
      throw new Error(`Order not found for ID: ${this.transaction.userId}`);
    }

    if (order.orderStatus === "Completed") {
      throw new Error("Order already completed");
    }

    // Handle partial payment
    if (this.amount < order.amountLeftToPay) {
      order.amountLeftToPay -= this.amount;
      order.amountPaid += this.amount;
      await order.save({ session: this.session });
      return;
    }

    // Handle full payment
    order.amountLeftToPay = 0;
    order.amountPaid += this.amount;
    order.orderStatus = "Completed";
    order.paymentDetails = {
      ...order.paymentDetails,
      paymentDate,
      paymentMethod: "bankTrf",
    };

    // Credit store owner
    const store = await findStore(order.storeId);
    this.store = store.toObject();
    await this.creditStoreOwner();

    await order.save({ session: this.session });
  }

  private async processSubscriptionPayment(
    subscriptionDate: string
  ): Promise<void> {
    if (!this.transaction || !this.session) {
      throw new Error("Transaction or session not initialized");
    }

    const user = await UserModel.findById(this.transaction.userId).session(
      this.session
    );

    if (!user) {
      throw new Error(`User not found for ID: ${this.transaction.userId}`);
    }

    // Calculate subscription duration based on amount
    const monthsSubscribed = Math.floor(this.amount / 600);

    // Set expiration date
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + monthsSubscribed);

    // Update user plan
    user.plan = {
      amountPaid: this.amount,
      autoRenew: true,
      type: "premium",
      expiredAt: expirationDate.toISOString(),
      subscribedAt: subscriptionDate,
    };

    await user.save({ session: this.session });

    // Send confirmation email
    await this.sendSubscriptionEmail(
      user.email,
      user.fullName,
      expirationDate.toISOString()
    );
  }

  public async payWithFlutterwave(email: string, name: string) {
    const response = await axios.post<FlutterwaveResponse>(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: this.ref,
        amount: this.amount + "",
        currency: "NGN",
        redirect_url: config.CLIENT_DOMAIN + PATHS.CONFIRM_FLUTTERWAVE_PAYMENT,
        customer: {
          email,
          name,
          phonenumber: "09012345678",
        },
        customizations: {
          title: "Flutterwave Standard Payment",
        },
        configurations: {
          session_duration: 10,
          max_retry_attempt: 5,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        },
      }
    );

    return response.data;
  }

  public async sendSubscriptionEmail(
    userEmail: string,
    userName: string,
    nextBillingDate: string
  ): Promise<PaymentService> {
    if (!this.transaction) {
      throw new Error("Transaction not initialized");
    }

    const emailTemplate = generateSubscriptionEmail({
      amount: this.transaction.amount.toString(),
      companyLogo: "",
      companyName: "storeBuild",
      contactEmail: userEmail,
      customerName: userName,
      startDate: this.transaction.createdAt || new Date().toISOString(),
      subscriptionPlan: "premium",
      nextBillingDate: nextBillingDate,
    });

    await sendEmail(
      userEmail,
      emailTemplate,
      undefined,
      "Subscription Activated"
    );

    return this;
  }
}
