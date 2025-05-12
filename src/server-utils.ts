import axios from "axios";
import { config, themes } from "./constant";
import {
  findProduct,
  findStore,
  findUser,
  formatAmountToNaira,
  generateOTP,
  generateRandomString,
  generateToken,
  handleOrderNotifications,
  sendEmail,
} from "./helper";
import crypto from "crypto";
import {
  CategoryModel,
  Coupon,
  DedicatedAccountModel,
  IntegrationModel,
  OrderModel,
  OTPModel,
  ProductModel,
  RatingModel,
  StoreBankAccountModel,
  StoreModel,
  StoreSttings,
  TransactionModel,
  UserModel,
  WithdrawalQueueModel,
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
  ShipmentResponse,
  PATHS,
  FlutterwaveResponse,
  IOrder,
  IBank,
  IProduct,
  getProductFilters,
  IBillStackDedicatedAccountResponse,
  IDedicatedAccount,
  IBillStackReservedBankTypes,
  IPaymentChannel,
  TransactionResponse,
  Integration,
  IChatBotIntegrationPermissions,
  IUser,
  IOTPFor,
  ICoupon,
  IWithdrawalQueue,
  IRating,
} from "./types";
import mongoose from "mongoose";
import {
  generateNameMismatchEmail,
  generateSubscriptionEmail,
  otpEmailTemplate,
} from "./emails";
import dotenv from "dotenv";

dotenv.config();

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
  storeId: string;
  auth: string;
  addKeys: boolean;

  constructor(storeId: string, assert = false, addKeys = false) {
    this.storeId = storeId;
    this.addKeys = addKeys;
  }

  async getIntegration() {
    const integration = await IntegrationModel.findOne({
      "integration.name": "sendbox",
      storeId: this.storeId,
    }).select(this.addKeys ? "+apiKeys" : undefined);

    const accessKey = integration?.integration?.apiKeys?.["accessKey"];

    if (this.addKeys && !accessKey) {
      throw new Error(
        "SENDBOX_ERROR: unable to get store integration accessKey, please contact support or go to /store-integration/ page to set your sendBox accessKey"
      );
    }

    if (this.addKeys) {
      this.auth = accessKey;
    }

    return integration;
  }

  async saveSendBoxAccessKey(auth: string) {
    const integration = await this.getIntegration();

    integration.integration.apiKeys = {
      accessKey: auth,
      token: auth,
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
          Authorization: this?.auth,
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

    if (!integration?.isConnected) {
      throw new Error("SENDBOX_ERROR: sendBox is not connected to your store.");
    }

    const order = await OrderModel.findById(orderId);

    if (!order) {
      throw new Error(
        "ORDER_CREATION_FAILED: Unable to find the order related to this Id"
      );
    }

    const { owner } = await StoreModel.findById(this.storeId, { owner: 1 });
    const {
      email: storeEmail,
      fullName,
      phoneNumber,
    } = await UserModel.findById(owner, {
      email: 1,
      fullName: 1,
      phoneNumber: 1,
    });

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
          Authorization: `Bearer ${this.auth}`,
        },
      }
    );

    order.shippingDetails.trackingNumber = response.data.tracking_code;
    order.shippingDetails.estimatedDeliveryDate = payload.pickUpDate;
    order.shippingDetails.carrier = "SENDBOX";
    order.shippingDetails.shippingMethod = "STANDARD";

    await order.save({
      validateModifiedOnly: true,
    });

    return response?.data;
  }

  async connectSendBox(auth: string) {
    const integration = await this.getIntegration();

    if (!integration?.integration) {
      integration.integration = {
        isConnected: true,
        settings: {
          deliveryNationwide: false,
          shippingRegions: [],
        },
        apiKeys: {
          token: auth,
          accessKey: auth,
        },
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

export class PaymentService {
  private ref: string;
  public virtualAccount?: FlutterwaveVirtualAccountResponse;
  public transaction?: ITransaction;
  private amount: number;
  public session: mongoose.ClientSession | null = null;
  store: mongoose.Document<unknown, {}, IStore> & IStore = null;
  paymentLink: string;
  private storeId: string;
  public order: mongoose.Document<unknown, {}, IOrder> & IOrder = null;

  constructor(storeIdentifier: string) {
    this.storeId = storeIdentifier;

    this.generateRef();

    this.ref;

    //Creating a default transaction
    this.transaction = {
      _id: this.ref,
      amount: 0,
      meta: {},
      paymentFor: "order",
      paymentMethod: "",
      paymentStatus: "pending",
      txRef: "",
      identifier: "",
      storeId: this.storeId,
      type: "Funding",
      paymentChannel: "flutterwave",
    };
  }

  async getStore(payload?: { select?: string }) {
    let store;
    try {
      const query: Record<string, any> = {
        $or: [{ id: this.storeId }, { storeCode: this.storeId }],
      };

      // Try to convert storeId to ObjectId if it's a valid format
      if (mongoose.Types.ObjectId.isValid(this.storeId)) {
        query.$or.push({ _id: new mongoose.Types.ObjectId(this.storeId) });
      }

      store = await StoreModel.findOne(query).select(payload?.select);

      if (!store) {
        throw new Error("Store not found");
      }

      this.store = store;
      return this;
    } catch (error) {
      if (error.message === "Store not found") {
        throw error;
      }
      throw new Error(`Failed to fetch store: ${error.message}`);
    }
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

  public validateAmount() {
    if (this.amount <= 0) {
      throw new Error("Amount must greater than zero to initiate a charge");
    }
  }

  public getAccountCreated(): FlutterwaveVirtualAccountResponse {
    if (!this.virtualAccount) {
      throw new Error("Virtual account has not been created yet");
    }
    return this.virtualAccount;
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
    amount,
  }: {
    note?: string;
    email: string;
    amount: number;
  }) {
    const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!FLUTTERWAVE_SECRET_KEY) {
      throw new Error("FLUTTERWAVE_SECRET_KEY environment variable is not set");
    }

    const response = await axios.post<FlutterwaveVirtualAccountResponse>(
      "https://api.flutterwave.com/v3/virtual-account-numbers",
      {
        email,
        currency: "NGN",
        amount,
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

    return response.data;
  }

  public async createTransaction() {
    if (!this.session) {
      throw new Error("No active session");
    }

    try {
      const transaction = new TransactionModel(this.transaction);
      await transaction.save({ session: this.session });
      this.transaction = transaction.toObject();
      return this;
    } catch (error) {
      await this.cancelSession();
      throw new Error(`CHARGE_CREATION_FAILED: ${(error as Error).message}`);
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

  private async processOrderPayment(paymentDate: string) {
    if (!this.transaction || !this.session) {
      throw new Error("Transaction or session not initialized");
    }

    const order = await OrderModel.findById(
      this.transaction.identifier
    ).session(this.session);

    if (!order) {
      throw new Error(`Order not found for ID: ${this.transaction.identifier}`);
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
    this.store = store;
    await this.creditStoreOwner("", 0);

    await order.save({ session: this.session });
    return this;
  }

  private async processSubscriptionPayment(
    subscriptionDate: string
  ): Promise<void> {
    if (!this.transaction || !this.session) {
      throw new Error("Transaction or session not initialized");
    }

    const user = await UserModel.findById(this.transaction.identifier).session(
      this.session
    );

    if (!user) {
      throw new Error(`User not found for ID: ${this.transaction.identifier}`);
    }

    // Calculate subscription duration based on amount
    const monthsSubscribed = Math.floor(this.amount / 600);

    // Set expiration date
    const expirationDate = new Date();
    const existingDate = new Date(user.plan.expiredAt);

    // If user has an active subscription, add months to existing expiry date
    if (expirationDate < existingDate) {
      expirationDate.setTime(existingDate.getTime());
      expirationDate.setMonth(existingDate.getMonth() + monthsSubscribed);
    } else {
      expirationDate.setMonth(expirationDate.getMonth() + monthsSubscribed);
    }

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

  public async payWithFlutterwave(
    email: string,
    name: string,
    amount: number,
    phoneNumber?: string
  ) {
    const response = await axios.post<FlutterwaveResponse>(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: this.ref,
        amount,
        currency: "NGN",
        redirect_url: config.CLIENT_DOMAIN + PATHS.CONFIRM_FLUTTERWAVE_PAYMENT,
        customer: {
          email,
          name,
          phonenumber: phoneNumber,
        },
        customizations: {
          title: `${this.store.storeName} Standard Payment CheckOut.`,
        },
        configurations: {
          session_duration: 10,
          max_retry_attempt: 5,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
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

  public async getBankList() {
    const res = await axios.get<{
      status: "success";
      message: "Banks fetched successfully";
      data: IBank[];
    }>(`https://api.paystack.co/bank?country=nigeria`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
      },
    });

    return res.data.data;
  }

  public async verifyBank(accountNumber: string, bankCode: string) {
    const res = await axios.get<{
      data: {
        account_number: string;
        account_name: string;
        bank_id: number;
      };
    }>(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` } }
    );

    return res.data.data;
  }

  public async makePayment(
    id: string,
    paymentFor: IPaymentFor,
    paymentOption?: "virtualAccount" | "card",
    meta?: any
  ) {
    const PAYMENT_OPTIONS = new Set(["virtualAccount", "card"]);
    const PAYMENT_FOR = new Set<IPaymentFor>([
      "order",
      "subscription",
    ] as IPaymentFor[]);

    if (!PAYMENT_FOR.has(paymentFor)) {
      throw new Error("PAYMENT_FOR_NOT_SUPPORTED: payment for not supported");
    }

    if (!PAYMENT_OPTIONS.has(paymentOption)) {
      throw new Error(
        "PAYMENT_OPTION_NOT_SUPPORTED: payment option not supported"
      );
    }

    const data = {
      email: "",
      name: "",
      amount: 0,
      phoneNumber: "",
      paymentChannel: "",
      paymentLink: "",
      virtualAccount: {},
    };

    await this.startSession();

    await this.getStore(); //Getting the current store

    //If we can't find the store throw an error
    if (!this.store) {
      await this.cancelSession(); //Cancelling the session if we can't find the store for the order
      throw new Error(
        "CANNOT_CREATE_CHARGE: we are unable to find the store of the id you provide"
      );
    }

    if (!this.store.isActive && paymentFor === "order") {
      throw new Error(
        "CHARGE_CREATION_FAILED: unable to create charge because this store is inActive"
      );
    }

    if (!(await this.isPaymentIntegrationConnected())) {
      await this.cancelSession();
      throw new Error(
        "PAYMENT_INTEGRATION_NOT_CONNECTED: unable to create charge because payment integration is not connected"
      );
    }

    await this.generateRef(); //Generating a reference for the transaction

    //If the paymentOption is not provided set to default
    if (!paymentOption) {
      paymentOption = "virtualAccount";
    }

    //When the payment the user wants to make is for order, we run this.
    if (paymentFor === "order") {
      const order = await OrderModel.findById(id).session(this.session); //Getting the order from our database

      //if the order is not found, we throw an error to the user and end the request.
      if (!order) {
        await this.cancelSession();
        throw new Error(`ORDER_NOT_FOUND: Order with id ${id} not found`);
      }

      //If the order is already paid for, we throw an error to the user and end the request.
      if (order.orderStatus === "Completed") {
        await this.cancelSession();
        throw new Error(
          `ORDER_ALREADY_PAID: Order with id ${id} is already paid for`
        );
      }

      //If the order is cancelled, we throw an error to the user and end the request.
      if (order.orderStatus === "Cancelled") {
        await this.cancelSession();
        throw new Error(
          `ORDER_ALREADY_CANCELLED: Order with id ${id} is already cancelled`
        );
      }

      //If the order is already shipped, we throw an error to the user and end the request.
      if (order.orderStatus === "Shipped") {
        await this.cancelSession();
        throw new Error(
          `ORDER_ALREADY_SHIPPED: Order with id ${id} is already shipped`
        );
      }

      this.order = order;

      this.transaction.identifier = order._id;

      data["email"] = order.customerDetails.email;
      data["name"] = order.customerDetails.name;
      data["amount"] = order.amountLeftToPay;
      data["phoneNumber"] = order.customerDetails.phoneNumber;
      data["paymentChannel"] = "flutterwave" as IPaymentChannel;
    }

    //A user wants to make subscribe
    if (paymentFor === "subscription") {
      const user = await UserModel.findById(id).session(this.session); //Get the user that wants to subscribe to the platform

      if (!meta?.["months"]) {
        meta["months"] = 1;
      }

      if (!user) {
        await this.cancelSession();
        throw new Error("CHARGE_CREATION_FAILED: User does not exist");
      }

      data["amount"] = config.SUBCRIPTION_FEE * meta?.months;
      data["email"] = user.email;
      data["name"] = user.fullName;
      data["phoneNumber"] = user.phoneNumber;
      data["paymentChannel"] = "flutterwave" as IPaymentChannel;

      this.transaction.identifier = user._id;
    }

    //Process this transaction according to the payment option the user selects
    if (paymentOption === "virtualAccount") {
      const virtualAccount = await this.createVirtualAccount({
        email: data["email"],
        note: this.ref,
        amount: data.amount,
      });

      data.virtualAccount = virtualAccount;

      if (paymentFor === "order") {
        this.order.paymentDetails = {
          ...this.order.paymentDetails,
          transactionId: this.ref,
          tx_ref: this.ref,
        };

        await this.order.save({
          validateModifiedOnly: true,
          session: this.session,
        });
      }

      this.transaction = {
        ...this.transaction,
        meta: { ...virtualAccount.data },
        paymentMethod: "bankTrf",
        paymentChannel: "flutterwave",
      };
    }

    if (paymentOption === "card") {
      //Using the flutterwave payment gateway to make the payment
      const flutterwaveResp = await this.payWithFlutterwave(
        data.email,
        data.name,
        data.amount,
        data.phoneNumber
      );

      if (paymentFor === "order") {
        this.order.paymentDetails = {
          ...this.order.paymentDetails,
          paymentLink: flutterwaveResp.data.link,
          paymentStatus: "pending",
          paymentMethod: "flutterwave",
          transactionId: this.ref,
          tx_ref: this.ref,
        };

        await this.order.save({
          validateModifiedOnly: true,
          session: this.session,
        });
      }

      this.transaction = {
        ...this.transaction,
        meta: flutterwaveResp,
        paymentMethod: "card",
      };

      data["paymentLink"] = flutterwaveResp.data.link; //Return the payment link for the current user
    }

    //This is the transaction object that we will save in our database
    this.transaction = {
      ...this.transaction,
      amount: data["amount"],
      paymentChannel: data["paymentChannel"] as IPaymentChannel,
      paymentFor,
      paymentStatus: "pending",
      txRef: this.ref,
      storeId: this.store._id,
      type: "Payment",
      identifier: id,
      meta: {
        ...this.transaction.meta,
        ...meta,
      },
    };

    await this.createTransaction();

    await this.commitSession();

    return data;
  }

  public async getPaymentDetailsFromFlutterwave(id: string) {
    const res = await axios.get<TransactionResponse>(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${id}`,
      { headers: { Authorization: `Bearer ${config.FLUTTERWAVE_SECRET_KEY}` } }
    );

    return res.data;
  }

  private async creditStoreOwner(storeId: string, amount: number) {
    await StoreModel.findByIdAndUpdate(storeId, {
      $inc: { balance: amount },
    }).session(this.session);
  }

  public async validateFlutterwavePayment(txRef: string) {
    const now = new Date();

    await this.startSession();

    //Get the transaction with the txRef
    const transaction = await TransactionModel.findOne({ txRef }).session(
      this.session
    );

    //If the transaction is not-found throw an error
    if (!transaction) {
      await this.cancelSession();
      throw new Error(
        "PAYMENT_VALIDATION_FAILED: Unable to find this transaction aborting"
      );
    }

    const { data: flwRes } = await this.getPaymentDetailsFromFlutterwave(txRef);

    //Check if the transaction has already been completed, cancelled
    if (transaction.paymentStatus === "successful") {
      await this.cancelSession();
      throw new Error(
        "PAYMENT_VALIDATION_FAILED: Unable to process payment, payment has already been processed"
      );
    }

    if (transaction.paymentStatus === "failed") {
      await this.cancelSession();
      throw new Error(
        "PAYMENT_VALIDATION_FAILED: this transaction was already marked as failed"
      );
    }

    if (flwRes.status !== "successful") {
      await this.cancelSession();
      throw new Error(
        "PAYMENT_VALIDATION_FAILED: This transaction is not yet marked as successful yet from our payment provider"
      );
    }

    if (transaction.paymentFor === "order") {
      const order = await OrderModel.findOne({
        $or: [
          { _id: transaction.identifier },
          { "paymentDetails.transactionId": transaction.txRef },
          { "paymentDetails.tx_ref": transaction.txRef },
        ],
      });

      if (!order) {
        await this.cancelSession();
        throw new Error(
          "PAYMENT_VALIDATION_FAILED: unable to locate your order"
        );
      }

      //Credit the store owner
      const store = await StoreModel.findById(order.storeId, {
        owner: 1,
        storeName: 1,
      }).session(this.session);

      const storeOwner = await UserModel.findById(store.owner).session(
        this.session
      );

      if (!(store && storeOwner)) {
        await this.cancelSession();
        throw new Error(
          "PAYMENT_VALIDATION_FAILED: Unable to locate the store or the store owner."
        );
      }

      //This is when the amount paid is equal to the amount request
      if (flwRes.amount_settled >= order.amountLeftToPay) {
        order.paymentDetails.paymentStatus = "successful";
        order.amountLeftToPay = 0;
        order.amountPaid = flwRes.amount_settled;
        order.orderStatus = "Completed";
      }

      order.paymentDetails.paymentDate = now.toISOString();
      order.amountLeftToPay -= flwRes.amount_settled;

      order.orderStatus = "Completed";

      await order.save({ validateModifiedOnly: true, session: this.session });

      await this.creditStoreOwner(store._id, flwRes.amount_settled);

      //Send Email to user their balance has been creditted.

      const storeOwnerEmailTemplate = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Credit Alert</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .header { text-align: center; padding: 20px 0; }
              .amount { font-size: 24px; color: #28a745; text-align: center; padding: 20px 0; }
              .details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; }
              .footer { text-align: center; font-size: 12px; color: #6c757d; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Credit Alert</h2>
              </div>
              <div class="amount">
                ${formatAmountToNaira(flwRes.amount_settled)}
              </div>
              <div class="details">
                <p>Your store account has been credited.</p>
                <p>Transaction Date: ${new Date().toLocaleString()}</p>
                <p>Reference: ${flwRes.tx_ref}</p>
              </div>
              <div class="footer">
                <p>This is an automated message from StoreBuild</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const customerEmailTemplate = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Payment Confirmation</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .header { text-align: center; padding: 20px 0; }
              .store-name { color: #6b46c1; font-weight: bold; }
              .details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; }
              .footer { text-align: center; font-size: 12px; color: #6c757d; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Payment Received</h2>
              </div>
              <p>Your payment to <span class="store-name">${
                store.storeName
              }</span> has been received.</p>
              <div class="details">
                <p>Amount: ${formatAmountToNaira(flwRes.amount_settled)}</p>
                <p>Date: ${new Date().toLocaleString()}</p>
                <p>Reference: ${flwRes.tx_ref}</p>
              </div>
              <p>Thank you for your purchase!</p>
              <div class="footer">
                <p>This is an automated message from StoreBuild</p>
              </div>
            </div>
          </body>
        </html>
      `;

      await sendEmail(
        storeOwner.email,
        storeOwnerEmailTemplate,
        undefined,
        `CREDIT ALERT: ${formatAmountToNaira(flwRes.amount_settled)}`
      )
        .then(async () => {
          await sendEmail(
            order.customerDetails.email,
            customerEmailTemplate,
            undefined,
            `PAYMENT RECEIVED: ${store.storeName} has received your payment`
          );
        })
        .catch(async () => {
          await this.cancelSession();
        });
    }

    if (transaction.paymentFor === "subscription") {
      const user = await UserModel.findById(transaction.identifier).session(
        this.session
      );

      //If the user is not found throw an error
      if (!user) {
        await this.cancelSession();
        throw new Error(
          "PAYMENT_VALIDATION_FAILED: unable to find user in our database."
        );
      }

      //this will be use to configure the user subscription
      const options = {
        isReminderSet: transaction.meta?.isReminderSet ?? false,
        months: transaction.meta?.months ?? 1,
      };

      options.months = Math.floor(
        flwRes.amount_settled / config.SUBCRIPTION_FEE
      );

      now.setMonth(now.getMonth() + options.months);

      user.plan = {
        ...user.plan,
        amountPaid: flwRes.amount_settled,
        autoRenew: options.isReminderSet,
        subscribedAt: flwRes.created_at,
        type: "premium",
        expiredAt: now.toISOString(),
      };

      const emailTemplate = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Subscription Confirmation</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
              }
              .container {
                max-width: 700px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .header {
                text-align: center;
                padding: 20px 0;
                background: #6b46c1;
                color: white;
                border-radius: 8px 8px 0 0;
              }
              .content {
                padding: 20px;
                color: #333;
              }
              .button {
                display: inline-block;
                padding: 12px 24px;
                background: #6b46c1;
                color: white;
                text-decoration: none;
                border-radius: 4px;
                margin: 20px 0;
              }
              .highlight {
                background: #f8f4ff;
                padding: 15px;
                border-radius: 4px;
                margin: 15px 0;
                border-left: 4px solid #6b46c1;
              }
              .footer {
                text-align: center;
                padding: 20px;
                color: #666;
                font-size: 12px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Subscription Confirmed! 🎉</h1>
              </div>
              <div class="content">
                <h2>Thank You for Subscribing!</h2>
                <p>Your premium subscription has been successfully activated.</p>
                
                <div class="highlight">
                  <p><strong>Subscription Details:</strong></p>
                  <p>Plan: Premium</p>
                  <p>Status: Active</p>
                  <p>Duration: ${Math.floor(
                    flwRes.amount_settled / 600
                  )} months</p>
                </div>

                <p>You now have access to:</p>
                <ul>
                  <li>Unlimited product listings</li>
                  <li>Advanced analytics</li>
                  <li>Priority support</li>
                  <li>Custom domain</li>
                </ul>

                <center>
                  <a href="${
                    config.CLIENT_DOMAIN
                  }/dashboard" class="button">Go to Dashboard</a>
                </center>

                <p>If you have any questions, our support team is here to help!</p>
                
                <p>Best regards,<br>The StoreBuild Team</p>
              </div>
              
              <div class="footer">
                <p>This is an automated message, please do not reply directly to this email.</p>
                <p>© ${new Date().getFullYear()} StoreBuild. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      // Send subscription confirmation email
      await sendEmail(
        [user.email],
        emailTemplate,
        undefined,
        "Your Premium Subscription is Active!"
      );

      await user.save({ validateModifiedOnly: true, session: this.session });
    }

    if (transaction.paymentFor === "store-build-ai") {
      const user = await UserModel.findById(transaction.identifier).session(
        this.session
      );

      if (!user) {
        await this.cancelSession();
        throw new Error(
          "PAYMENT_VALIDATION_FAILED: unable to find user aborting transaction"
        );
      }

      const { _id } = await StoreModel.findOne({ owner: user._id }, { _id: 1 });

      const integration = await IntegrationModel.findOne({
        storeId: _id,
        "integration.name": "chatbot",
      });

      if (integration) {
        now.setDate(now.getDate() + 30);

        integration.integration = {
          ...integration.integration,
          isConnected: true,
          subcription: {
            start_date: new Date().toISOString(),
            end_date: now.toISOString(),
            comment: "You successfully subscribed for store-build-ai",
          },
          settings: {
            ...integration.integration.settings,
            permissions: {
              allowCustomerAccess: true,
              allowOrderAccess: true,
              allowProductAccess: true,
            },
          },
        };

        await integration.save({
          validateModifiedOnly: true,
          session: this.session,
        });
      }

      if (!integration) {
        const payload: Integration = {
          storeId: _id,
          integration: {
            apiKeys: {},
            isConnected: true,
            name: "chatbot",
            //@ts-ignore
            settings: {
              allowCustomerAccess: true,
              allowOrderAccess: true,
              allowProductAccess: true,
            } as IChatBotIntegrationPermissions,
            subcription: {
              start_date: new Date().toISOString(),
              end_date: now.toISOString(),
              comment: "You successfully subscribed for store-build-ai",
            },
          },
        };

        const newIntegration = new IntegrationModel(payload);

        await newIntegration.save({ session: this.session });
      }
    }

    //Mark this transaction as completed
    transaction.paymentStatus = "successful";
    transaction.paymentMethod = flwRes.payment_type;

    await transaction.save({
      validateModifiedOnly: true,
      session: this.session,
    });

    await this.commitSession();
  }

  public async isPaymentIntegrationConnected() {
    const integration = await IntegrationModel.findOne({
      "integration.name": "paystack",
      storeId: this.store._id,
      "integration.isConnected": true,
    });

    return Boolean(integration);
  }

  public async doesStoreHasBankAccountAvailable() {
    return Boolean(
      await StoreBankAccountModel.exists({
        storeId: this.storeId,
        isDefault: true,
      })
    );
  }

  public async subscribeForAI() {
    const now = new Date();

    now.setDate(now.getDate() + 30);

    await this.startSession(); //Start a mongoose session

    await this.generateRef();

    await this.getStore({ select: "+balance" });

    if (!this.store) {
      await this.cancelSession();
      throw new Error("PAYMENT_ERROR: Unable to locate your store");
    }

    if (!this.store.balance) {
      this.store.balance = 0;
    }

    const { email, fullName } = await UserModel.findById(this.store.owner, {
      email: 1,
      fullName: 1,
    }).session(this.session);

    const SUBSCRIPTION_FEE = Number(config.SUBCRIPTION_FEE || 2000);

    if (this.store.balance < SUBSCRIPTION_FEE) {
      await this.cancelSession();
      throw new Error("PAYMENT_ERROR: Insufficient balance");
    }

    this.transaction = {
      ...this.transaction,
      paymentFor: "store-build-ai",
      identifier: this.store.owner,
      txRef: this.ref,
      paymentChannel: "balance",
      paymentMethod: "balance",
      amount: SUBSCRIPTION_FEE,
      paymentStatus: "successful",
      type: "Payment",
      storeId: this.storeId,
    };

    const integrationPayload: Integration = {
      integration: {
        apiKeys: {},
        isConnected: true,
        name: "chatbot",
        //@ts-ignore
        settings: {
          permissions: {
            allowCustomerAccess: true,
            allowOrderAccess: true,
            allowProductAccess: true,
          },
        },
        subcription: {
          start_date: new Date().toISOString(),
          end_date: now.toISOString(),
          comment: "You successfully subscribed for store-build-ai",
        },
      },
      storeId: this.storeId,
    };

    const integration = await IntegrationModel.findOne({
      storeId: this.storeId,
      "integration.name": "chatbot",
    });

    if (!integration) {
      const newIntegration = new IntegrationModel(integrationPayload);

      await newIntegration.save({ session: this.session });
    } else {
      integration.integration = {
        ...integration.integration,
        ...integrationPayload.integration,
      };

      await integration.save({
        validateModifiedOnly: true,
        session: this.session,
      });
    }

    await this.createTransaction();

    this.store.balance -= SUBSCRIPTION_FEE;

    await this.store.save({
      validateModifiedOnly: true,
      session: this.session,
    });

    await sendEmail(
      [email],
      `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Welcome to StoreBuild AI!</title>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { text-align: center; padding: 20px; background: #6b46c1; color: white; }
              .content { padding: 20px; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to StoreBuild AI!</h1>
              </div>
              
              <div class="content">
                <h2>Your AI Assistant is Ready! 🎉</h2>
                <p>Hello ${fullName},</p>
                
                <p>Great news! StoreBuild AI has been successfully activated on your store. Your virtual assistant is now ready to help manage your store and assist your customers.</p>

                <h3>What StoreBuild AI Can Do:</h3>
                <ul>
                  <li>Answer customer questions 24/7</li>
                  <li>Help manage orders and inventory</li>
                  <li>Provide product recommendations</li>
                  <li>Handle basic customer support</li>
                  <li>Generate product descriptions</li>
                </ul>

                <p>Your AI assistant is already learning about your products and store policies to provide the best possible service.</p>

                <p>To customize your AI settings, visit your store dashboard and navigate to the AI Assistant section.</p>

                <p>If you need any help getting started with StoreBuild AI, our support team is here to help!</p>

                <p>Best regards,<br>The StoreBuild Team</p>
              </div>

              <div class="footer">
                <p>© ${new Date().getFullYear()} StoreBuild. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
      undefined,
      "Welcome to StoreBuild AI - Your Virtual Assistant is Ready!"
    );

    await this.commitSession();
  }

  public async requestWithdraw(
    amount: number,
    accountId: string,
    otp?: string
  ) {
    const now = new Date();

    await this.startSession();

    await this.getStore();

    if (!this.store) {
      await this.cancelSession();
      throw new Error("WITHDRAWAL_FAILED: Unable to locate user store");
    }

    await this.generateRef();

    if (!otp) {
      await this.cancelSession();
      throw new Error(
        "WITHDRAWAL_FAILED: OTP is required to withdraw to your account."
      );
    }

    if (typeof amount !== "number") {
      await this.cancelSession();
      throw new Error("WITHDRAWAL_FAILED: Amount must be a number");
    }

    const accountService = new Account(this.storeId, this?.store.owner);

    const { email = "" } = await accountService.getUser();

    await accountService.verifyOTP({ email, token: otp });

    const userHasPendingWithdrawal = await WithdrawalQueueModel.exists({
      status: "pending",
      storeId: this.storeId,
    });

    if (!!userHasPendingWithdrawal) {
      await this.cancelSession();
      throw new Error(
        "WITHDRAWAL_FAILED: You have a pending withdrawal request. Please wait for it to be processed."
      );
    }

    const { owner } = this.store;

    const user = await UserModel.findById(owner);

    //Get the account the user wants to withdraw to
    const account = await StoreBankAccountModel.findById(accountId);

    if (!account) {
      await this.cancelSession();
      throw new Error("WITHDRAWAL_FAILED: Unable to find your bank account.");
    }

    const { accountName, accountNumber, bankCode, bankName } = account;

    this.transaction = {
      ...this.transaction,
      identifier: user._id.toString(),
      paymentChannel: "balance",
      txRef: this.ref,
      type: "Transfer",
      paymentMethod: "store-build-service",
      storeId: this.store._id,
      amount,
    };

    await this.createTransaction();

    const withdrawQueue: IWithdrawalQueue = {
      amount,
      bankDetails: {
        accountName,
        accountNumber,
        bankCode,
        bankName,
      },
      status: "pending",
      storeId: this.storeId,
      userId: user._id.toString(),
      validationPassed: true,
      transactionReference: this.transaction.txRef,
      processingDate: now,
      notes: "User is requesting to withdraw from their store balance",
    };

    const withdrawalQueue = new WithdrawalQueueModel(withdrawQueue);

    await withdrawalQueue.save({
      session: this.session,
      validateBeforeSave: true,
    });

    // Send withdrawal request notification email to store owner
    sendEmail(
      [user.email],
      `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Withdrawal Request Notification</h2>
      <p>Hello ${user.fullName},</p>
      <p>A withdrawal request has been initiated from your store account with the following details:</p>
      <ul>
        <li>Amount: ${formatAmountToNaira(amount)}</li>
        <li>Date: ${new Date().toLocaleString()}</li>
        <li>Status: Pending</li>
      </ul>
      <p>You will receive another notification once the withdrawal has been processed.</p>
      <p>If you did not initiate this withdrawal, please contact support immediately.</p>
      <p>Best regards,<br/>StoreBuild Team</p>
    </div>
  `,
      undefined,
      "Withdrawal Request Notification"
    );

    //await this.creditStoreOwner(this.storeId, -amount);

    //Check the user transaction history to check if there is a fraudlet activity and also check if the user is able to withdraw or in coolOff

    await this.commitSession();

    return this;
  }

  public async getInternalTransactions(payload: {
    size?: number;
    skip?: number;
  }) {
    try {
      await this.startSession();

      const transactions = await TransactionModel.find({
        storeId: this.storeId,
        $or: [{ type: "Funding" }, { type: "Transfer" }],
      })
        .sort({ createdAt: -1 })
        .skip(payload?.skip || 0)
        .limit(payload?.size || 5)
        .lean()
        .session(this.session);

      const totalTransactions = await TransactionModel.countDocuments({
        storeId: this.storeId,
        $or: [{ type: "Funding" }, { type: "Transfer" }],
      });

      await this.commitSession();

      return { transactions, totalTransactions };
    } catch (err) {
      await this.cancelSession();
      throw err;
    }
  }
}

export class Account {
  public storeId: string;
  public userId: string;
  public store: IStore;
  public session: mongoose.ClientSession | null = null;

  constructor(storeId?: string, userId?: string) {
    this.storeId = storeId;
    this.userId = userId;
  }

  public async startSession() {
    this.session = await mongoose.startSession();
    this.session.startTransaction();
    return this;
  }

  public async cancelSession() {
    if (!this.session) {
      throw new Error("No active session to cancel");
    }

    await this.session.abortTransaction();
    await this.session.endSession();
    return this;
  }

  public async commitSession() {
    if (!this.session) {
      throw new Error("No active session to commit");
    }

    await this.session.commitTransaction();
    await this.session.endSession();
    return this;
  }

  async getUser(userId?: string) {
    const user = await UserModel.findById(this.userId || userId);

    return user;
  }

  async connectBank(
    accountNumber: string,
    bankCode: string,
    nin: string,
    bankName: string
  ) {
    if (!(accountNumber && bankCode && nin)) {
      throw new Error(
        "MISSING_REQUIRED_PARAMETER: Please provide your account number, bank Code and Nin"
      );
    }

    const user = await UserModel.findById(this.userId);

    const paymentProvider = new PaymentService(this.storeId);

    const { account_name } = await paymentProvider.verifyBank(
      accountNumber,
      bankCode
    );

    //TODO: Later implement this logic to verify the user identity.
    //const { verified, verificationMessage } = await this.verifyIdentity(
    //  bankCode,
    //  accountNumber,
    //  account_name,
    //  nin
    //);

    user.fullName = account_name.toUpperCase();

    const doesDefaultExist = await StoreBankAccountModel.exists({
      storeId: this.storeId,
      user: this.userId,
      isDefault: true,
    });

    const storeAccount = new StoreBankAccountModel({
      accountName: account_name.toUpperCase(),
      accountNumber: accountNumber,
      bankCode,
      bankName,
      isDefault: !doesDefaultExist,
      nin,
      storeId: this.storeId,
      userId: this.userId,
    });

    await user.save({ validateModifiedOnly: true });
    await storeAccount.save();

    if (
      !user?.fullName ||
      user.fullName.toUpperCase() !== account_name.toUpperCase()
    ) {
      //Send an email telling the user that their name has been updated to the new name on thier bank

      const emailTemplate = generateNameMismatchEmail(
        user.fullName,
        account_name
      );

      await sendEmail(
        [user.email],
        emailTemplate,
        undefined,
        "ACCOUNT VERIFICATION FAILED"
      );
    }
  }

  public async verifyIdentity(
    bankCode: string,
    accountNumber: string,
    accountName: string,
    nin: string,
    countryCode = "NG"
  ) {
    const res = await axios.post<{
      status: boolean;
      message: string;
      data: {
        verified: boolean;
        verificationMessage: string;
      };
    }>(
      `"https://api.paystack.co/bank/validate/`,
      {
        bank_code: bankCode,
        country_code: countryCode,
        account_number: accountNumber,
        account_name: accountName,
        account_type: "personal",
        document_type: "identityNumber",
        document_number: nin,
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` } }
    );

    return res.data.data;
  }

  public get generateRef() {
    const ref = new mongoose.Types.ObjectId();
    return ref.toString();
  }

  public async generateAccountForStore() {
    const MAX_RETRY = 5;
    let RETRY = 0;
    const RETRY_DELAY_MS = 1000;
    const account: IDedicatedAccount = {
      accountDetails: {
        accountName: "",
        accountNumber: "",
        bankName: "",
      },
      accountRef: "",
      ref: "",
      storeId: this.storeId,
    };
    //List of available account to create for the user
    const AVAILABLE_ACCOUNT: IBillStackReservedBankTypes[] = [
      "PALMPAY",
      "9PSB",
      "BANKLY",
      "PROVIDUS",
      "SAFEHAVEN",
    ];

    const userAccount = await DedicatedAccountModel.exists({
      storeId: this.storeId,
    });

    //Check if the store already has an account, if YES, do not try to create a new account
    if (userAccount) {
      throw new Error(
        "ACCOUNT_CREATION_FAILED: unable to create account, user already has a dedicated account."
      );
    }

    const user = await this.getUser(); //get the current user

    if (!user.phoneNumber) {
      throw new Error(
        "ACCOUNT_CREATION_FAILED: Unable to create a dedicated account for user, user has not add their phone number."
      );
    }

    const [displayName, ...rest] = user.email.split("@"); //This will be use as a default name incase the user full name does not exist

    const [firstName = displayName, lastName = ""] = user?.fullName?.split(
      " "
    ) || [displayName, ""]; //Get the user first name and last name

    const ref = this.generateRef; //Generate a unique reference to be use

    const requestAccountPayload = {
      email: user.email,
      reference: ref,
      firstName,
      lastName,
      phone: user.phoneNumber,
      bank: AVAILABLE_ACCOUNT[RETRY],
    };

    //Enter the loop to create account to see if the account create fail, if YES start another creation
    while (RETRY <= MAX_RETRY) {
      try {
        const res = await axios.post<IBillStackDedicatedAccountResponse>(
          `https://api.billstack.co/v2/thirdparty/generateVirtualAccount/`,
          requestAccountPayload,
          {
            headers: {
              Authorization: "Bearer " + process.env.BILLSTACK_API_KEY,
            },
          }
        );

        const { data } = res.data;

        //Assigning the account details
        account.accountDetails = {
          ...account.accountDetails,
          accountName: data?.account[0]?.account_name,
          accountNumber: data?.account[0]?.account_number,
          bankName: data?.account[0]?.bank_name,
        };

        account.ref = ref; // --> This is the platform ref
        account.accountRef = data.reference; // --> The account ref

        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, RETRY))
        );

        break; //If the account creation is successful stop execution.
      } catch (error) {
        if (MAX_RETRY === RETRY) {
          throw new Error(
            `ACCOUNT_CREATION_FAILED: Unable to assign a dedicated account to you after ${MAX_RETRY} attempt, please contact support`
          );
        }
        RETRY++;
      }
    }

    const dedicatedAccount = new DedicatedAccountModel({ ...account }); //Instantiate the model

    await dedicatedAccount.save({ validateBeforeSave: true });
    //After this is successfull, send an email to the user that their account is ready

    const emailTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your StoreBuild Account is Ready!</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              padding: 20px;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              padding: 20px 0;
              background: #6b46c1;
              color: white;
              border-radius: 8px 8px 0 0;
            }
            .content {
              padding: 20px;
              color: #333;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #6b46c1;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              padding: 20px;
              color: #666;
              font-size: 12px;
            }
            .highlight {
              background: #f8f4ff;
              padding: 15px;
              border-radius: 4px;
              margin: 15px 0;
              border-left: 4px solid #6b46c1;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to StoreBuild!</h1>
            </div>
            <div class="content">
              <h2>Your Account is Ready! 🎉</h2>
              <p>Hello,</p>
              <p>Great news! Your StoreBuild account has been successfully created and is ready to use. You can now start building your online store and reaching customers worldwide.</p>
              
              <div class="highlight">
                <p><strong>Your Account Details:</strong></p>
                <p>Account Number: ${account.accountDetails.accountNumber}</p>
                <p>Bank Name: ${account.accountDetails.bankName}</p>
              </div>

              <p>With this account, you can:</p>
              <ul>
                <li>Receive payments from customers</li>
                <li>Track your transactions</li>
                <li>Manage your store finances</li>
                <li>Withdraw funds easily</li>
              </ul>

              <center>
                <a href="${
                  config.CLIENT_DOMAIN
                }/dashboard" class="button">Go to Dashboard</a>
              </center>

              <p>If you have any questions or need assistance, our support team is always here to help.</p>
              
              <p>Best regards,<br>The StoreBuild Team</p>
            </div>
            
            <div class="footer">
              <p>This is an automated message, please do not reply directly to this email.</p>
              <p>© ${new Date().getFullYear()} StoreBuild. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    //Send an email to the user that their account is ready
    await sendEmail(
      [user.email],
      emailTemplate,
      undefined,
      `YOUR ${config.APP_NAME.toUpperCase()} ACCOUNT NUMBER IS READY`
    );
  }

  public async createAccount(props: { email: string; fullName: string }) {
    const userPayload: IUser = {
      discoveredUsBy: "other",
      email: props.email,
      firstTimeUser: true,
      fullName: props.fullName,
      isEmailVerified: false,
      paymentOnHold: false,
      plan: {
        type: "free",
        amountPaid: 0,
        autoRenew: false,
        subscribedAt: "",
        expiredAt: "",
      },
      referralCode: "",
    };

    const user = new UserModel(userPayload);

    await user.save({ validateBeforeSave: true, session: this.session });

    return user;
  }

  public async verifyOTP(props: { email: string; token: string }) {
    await this.startSession();

    const user = await UserModel.findOne({ email: props.email }).session(
      this.session
    );

    // Find and delete OTP in one query
    const otp = await OTPModel.findOne({
      token: props.token,
      user: user.id,
    }).session(this.session);

    if (!otp) {
      await this.cancelSession();
      throw new Error("Invalid OTP or OTP has already been used.");
    }

    //const store = new Store(otp)

    // Check if OTP is expired
    if (Date.now() > otp.expiredAt) {
      await this.cancelSession();
      throw new Error("OTP has expired.");
    }

    if (otp.tokenFor === "verify-email" && user.isEmailVerified) {
      await this.cancelSession();
      throw new Error("Your email has already been verified, Thank you");
    }

    // Handle different OTP actions based on `tokenFor`
    if (otp.tokenFor === "login") {
      const store = await StoreModel.findOne({
        owner: user.id,
        status: "active",
      }).session(this.session);

      if (!store) {
        await this.cancelSession();
        throw new Error("Store not found or not active");
      }

      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
      }

      if (user.firstTimeUser) {
        user.firstTimeUser = false;
      }

      await otp.deleteOne({ session: this.session });
      await user.save({ validateBeforeSave: true, session: this.session });

      await this.commitSession();
      // Generate and return token for login
      return generateToken(user.id, user.email, store.id);
    }

    if (otp.tokenFor === "verify-email") {
      user.isEmailVerified = true;
      await user.save({ validateBeforeSave: true, session: this.session });
      await otp.deleteOne({ session: this.session });
      await this.commitSession();
    }
  }

  public async sendOTP({
    storeName = "Your Store",
    ...props
  }: {
    email: string;
    tokenFor: IOTPFor;
    storeName?: string;
  }) {
    const availableTokenFor = new Set(["login", "verify-email", "withdraw"]);

    if (!availableTokenFor.has(props.tokenFor)) {
      throw new Error("Invalid tokenFor value.");
    }

    let token = generateOTP();

    await this.startSession();

    // Ensure unique OTP
    while (await OTPModel.exists({ token }).session(this.session)) {
      token = generateOTP();
    }

    const email = { $regex: props.email, $options: "i" };

    // Retrieve user and their email
    const user = await UserModel.findOne({ email }).session(this.session);

    if (!user) {
      await this.cancelSession();
      throw new Error("User not found.");
    }

    if (props.tokenFor == "verify-email" && user.isEmailVerified) {
      await this.cancelSession();
      throw new Error("Your email has already been verified, Thank you");
    }

    // Retrieve or create OTP entry for the user
    let otp = await OTPModel.findOne({ user: user.id }).session(this.session);
    if (!otp) {
      otp = new OTPModel({ user: user.id });
    }

    // Update OTP data
    otp.token = token;
    otp.tokenFor = props.tokenFor;
    otp.expiredAt = Date.now() + 10 * 60 * 1000;

    // Send the OTP email
    await sendEmail(
      user.email,
      otpEmailTemplate(token, storeName || "Store"),
      undefined,
      "Verify OTP"
    );

    // Save OTP to the database
    await otp.save({ session: this.session });
    await this.commitSession();
  }

  public async updateUser(userData: Partial<IUser>) {
    const allowKeysToUpdate = new Set([
      "fullName",
      "email",
      "phoneNumber",
      "tutorialVideoWatch",
    ]);

    const updateKeys = Object.keys(userData);

    //Check if there is a property that is not suppose to be updated
    for (let i = 0; i < updateKeys.length; i++) {
      if (!allowKeysToUpdate.has(updateKeys[i])) {
        await this.cancelSession();
        throw new Error(
          `UPDATE_FAILED: ${updateKeys[i]} is not allow to be updated`
        );
      }
    }

    const user = await this.getUser(this.userId);

    await user
      .updateOne({ $set: { ...userData }, validate: true })
      .session(this.session);
  }

  public async getStoreAccounts(
    size = 5,
    storeCode?: string,
    getDefault = false
  ) {
    let _id;
    if (storeCode) {
      const store = await findStore({ storeCode }, true, { _id: 1 });
      _id = store._id;
    }

    const bankAccounts = await StoreBankAccountModel.find({
      storeId: _id,
      ...(getDefault ? { isDefault: getDefault } : undefined),
    }).limit(size);

    // Mask account numbers before returning
    const maskedAccounts = bankAccounts.map((account) => {
      const accountObj = account.toObject();
      if (accountObj.accountNumber) {
        accountObj.accountNumber =
          "*".repeat(accountObj.accountNumber.length - 4) +
          accountObj.accountNumber.slice(-4);
      }
      return accountObj;
    });

    return maskedAccounts;
  }

  public async writeReviewOnProduct(payload: IRating) {
    await findStore(this.storeId);

    await findProduct(payload.productId);

    const userCanWriteReview = await OrderModel.exists({
      "customerDetails.email": payload.userEmail,
      products: { $elemMatch: { _id: payload.productId } },
      $or: [{ orderStatus: "Completed" }, { orderStatus: "Shipped" }],
    });

    if (!userCanWriteReview) {
      throw new Error(
        "UNABLE_TO_WRITE_REVIEW: You have not purchased this product, you can only write a review if you have purchased this product."
      );
    }

    const newReview = new RatingModel(payload);

    await newReview.save();

    return newReview;
  }
}

export class Product extends Account {
  product: Partial<IProduct>;

  //Membership Access
  public async canUserAddMoreProducts() {
    const user = await this.getUser();

    const MAX_PRODUCTS_FOR_FREEMIUM =
      Number(config.FREE_USER_PRODUCTS) || (20 as const);

    const products = await ProductModel.countDocuments({
      storeId: this.storeId,
    });

    if (user.plan.type === "free" && products >= MAX_PRODUCTS_FOR_FREEMIUM) {
      throw new Error(
        "UNABLE_TO_ADD_PRODUCT: You have used up your free products, please subscribe to add unlimited products."
      );
    }
  }

  public set setProduct(product: Partial<IProduct>) {
    this.product = { ...product, storeId: this.storeId };
  }

  public async addProduct() {
    const product = new ProductModel({ ...this.product });

    await product.save({ validateBeforeSave: true });
  }

  public async editProduct() {
    await ProductModel.findByIdAndUpdate(this.product._id, this.product);
  }

  public async validateProduct() {
    //This will be user to validate products before saving

    if (!this.product.productName) {
      throw new Error("MISSING_REQUIRED_PARAMETER: Product name is missing");
    }

    if (this.product.price.default <= 0) {
      throw new Error(
        "CREATION_FAILED: Product must have a positive value as price"
      );
    }

    if (this.product.media.length <= 0) {
      throw new Error(
        "CREATION_FAILED: Product must contain atleast one image"
      );
    }

    if (this.product.stockQuantity <= 0) {
      throw new Error(
        "CREATION_FAILED: Stock quantity must be greater than zero"
      );
    }

    if (this.product.isDigital) {
      throw new Error(
        "CREATION_FAILED: Digital product creation not allow at this time, please contact support."
      );
    }

    if (this.product.availableColors.length > 0) {
      const colors = this.product.availableColors.every((color) => {
        return Boolean(color.colorCode && color.name);
      });

      if (!colors) {
        throw new Error(
          "CREATION_FAILED: All colors must contain their color code and the color name"
        );
      }
    }

    if (this.product.shippingDetails.isFreeShipping) {
      this.setProduct = {
        ...this.product,
        shippingDetails: { ...this.product.shippingDetails, shippingCost: 0 },
      };
    }

    if (this.product.gender.length <= 0) {
      this.setProduct = { ...this.product, gender: ["U"] };
    }

    if (this.product.price.sizes.length > 0) {
      for (const size in this.product.price.sizes) {
        if (!Object.keys(size)[0]) {
          throw new Error(
            `Amount is required for size ${Object.keys(size)[0]}`
          );
        }
      }
    }

    const categories = (
      await CategoryModel.find({ storeId: this.storeId }, { slot: 1 })
    ).map((category) => category.slot);

    const categoryExist = categories.includes(this.product.category);

    if (!categoryExist) {
      throw new Error(
        "CREATION_FAILED: The category you selected does not exist on your categories field"
      );
    }
  }

  public async getProducts(filters: getProductFilters, isAdmin = true) {
    const {
      q,
      category,
      colors,
      size = 0,
      gender,
      rating,
      minPrice,
      maxPrice,
      productsToShow,
      sort,
      sizes,
    } = filters;

    let matchStage: any = {
      storeId: this.storeId,
      ...(isAdmin ? {} : { isActive: true }),
    };

    // Text search filter
    if (q) {
      matchStage.$or = [
        { productName: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
      ];
    }

    // Basic filters
    if (category) matchStage.category = category;

    // Color filter
    if (colors && colors.length > 0) {
      matchStage["availableColors.name"] = {
        $in: Array.isArray(colors) ? colors : [colors],
      };
    }

    // Size filter
    if (Array.isArray(sizes) && sizes.length > 0) {
      matchStage.availableSizes = { $in: sizes };
    }

    // Gender filter
    if (Array.isArray(gender) && gender.length > 0) {
      matchStage.gender = { $in: gender };
    }

    // Rating filter
    if (rating) {
      matchStage["ratings.average"] = { $gte: Number(rating) };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      matchStage["price.default"] = {};
      if (minPrice) matchStage["price.default"].$gte = parseFloat(minPrice);
      if (maxPrice) matchStage["price.default"].$lte = parseFloat(maxPrice);
    }

    const limit = Math.max(1, Number(size) || 10);
    const pipeline: any[] = [{ $match: matchStage }];

    // Sorting logic
    if (productsToShow) {
      switch (productsToShow) {
        case "random":
          pipeline.push({ $sample: { size: limit } });
          break;
        case "best-sellers":
          pipeline.push({ $match: { stockQuantity: { $gt: 0 } } });
          pipeline.push({ $sort: { stockQuantity: -1 } });
          break;
        case "expensive":
          pipeline.push({ $sort: { "price.default": -1 } });
          break;
        case "discounted":
          pipeline.push({ $match: { discount: { $gt: 0 } } });
          break;
        default:
          break;
      }
    } else {
      let sortOrder: any = {};
      switch (sort) {
        case "stock-level":
          sortOrder.stockQuantity = -1;
          break;
        case "low-to-high":
          sortOrder["price.default"] = 1;
          break;
        case "high-to-low":
          sortOrder["price.default"] = -1;
          break;
        default:
          sortOrder.createdAt = -1;
      }
      pipeline.push({ $sort: sortOrder });
    }

    pipeline.push({ $limit: limit });

    // Execute main query
    const products = await ProductModel.aggregate(pipeline);

    // Aggregations for filters and metrics
    const [
      totalProducts,
      allColors,
      allSizes,
      priceStats,
      ratingsDistribution,
    ] = await Promise.all([
      ProductModel.countDocuments({ storeId: this.storeId }),
      ProductModel.aggregate([
        { $match: { storeId: this.storeId } },
        { $unwind: "$availableColors" },
        {
          $group: {
            _id: null,
            colors: { $addToSet: "$availableColors" },
          },
        },
      ]),
      ProductModel.aggregate([
        { $match: { storeId: this.storeId } },
        { $unwind: "$availableSizes" },
        {
          $group: {
            _id: null,
            sizes: { $addToSet: "$availableSizes" },
          },
        },
      ]),
      ProductModel.aggregate([
        { $match: { storeId: this.storeId } },
        {
          $group: {
            _id: null,
            minPrice: { $min: "$price.default" },
            maxPrice: { $max: "$price.default" },
          },
        },
      ]),
      ProductModel.aggregate([
        { $match: { storeId: this.storeId } },
        {
          $group: {
            _id: { $floor: "$ratings.average" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
      ]),
    ]);

    // Metrics for authenticated users
    let productsMetricsResponse;
    if (this.storeId) {
      const [digitalProducts, lowStockProducts, outOfStockProducts] =
        await Promise.all([
          ProductModel.countDocuments({
            storeId: this.storeId,
            isDigital: true,
          }),
          ProductModel.countDocuments({
            storeId: this.storeId,
            stockQuantity: { $gt: 0, $lt: 10 },
          }),
          ProductModel.countDocuments({
            storeId: this.storeId,
            stockQuantity: 0,
          }),
        ]);
      productsMetricsResponse = {
        digitalProducts,
        lowStockProducts,
        outOfStockProducts,
      };
    }

    const { minPrice: storeMinPrice, maxPrice: storeMaxPrice } =
      priceStats[0] || { minPrice: 0, maxPrice: 0 };

    return {
      totalProducts,
      products,
      filters: {
        priceRange: { min: storeMinPrice, max: storeMaxPrice },
        allColors: allColors[0]?.colors || [],
        allSizes: allSizes[0]?.sizes || [],
        ratingsDistribution: ratingsDistribution.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
      },
      ...productsMetricsResponse,
    };
  }

  public async getProduct(productId: string) {
    const product = await ProductModel.findById(productId);

    if (!product) {
      throw new Error(`Product ${productId} does not exist in our database.`);
    }

    this.setProduct = product.toObject();

    return this;
  }

  public async getProductsDraft() {
    const products = await ProductModel.find({
      storeId: this.storeId,
      isActive: false,
    });

    return products;
  }

  public async deleteProduct(productId: string) {
    await ProductModel.findByIdAndDelete(productId);
  }

  public async getProductsWithStoreCode(storeCode: string) {
    const { _id: storeId } = await findStore({ storeCode }, true, { _id: 1 });

    const products = await ProductModel.find({ storeId });

    return products;
  }
}

export class Store extends Account {
  async createStore(props: {
    owner: string;
    productType: string;
    storeName: string;
    templateId?: string;
  }) {
    const payload: IStore = {
      aboutStore: "",
      customizations: {
        banner: {
          btnAction: "goToPage",
          buttonLabel: "",
          description: "",
          header: "",
          image: "",
          product: "",
          type: "discount",
        },
        category: {
          header: "Our Categories",
          icon: "",
          image: "",
          showImage: false,
        },
        features: {
          features: [
            {
              description: "This will show products that are tailored for you.",
              header: "FOR YOU!",
              image: "",
              style: "one",
            },
          ],
          showFeatures: true,
          style: "two",
        },
        footer: {
          style: "one",
          showNewsLetter: false,
        },
        logoUrl: "",
        productPage: {
          showReviews: true,
          showSimilarProducts: false,
          style: "two",
        },
        productsPages: {
          canFilter: true,
          canSearch: true,
          havePagination: false,
          sort: ["price"],
        },
        theme: themes[0],
      },
      isActive: false,
      owner: props.owner,
      productType: props.productType,
      sections: [
        {
          display: "grid",
          header: "FOR YOU!",
          products: "random",
        },
      ],
      status: "active",
      storeCode: generateRandomString(6),
      storeName: props.storeName,
      templateId: generateRandomString(18),
      balance: 0,
      lockedBalance: 0,
      pendingBalance: 0,
    };

    const store = new StoreModel(payload);

    await store.save({ validateBeforeSave: true, session: this.session });

    this.store = store.toObject();

    return this;
  }

  async isStoreActive(throwError = true) {
    const isStoreActive = await StoreModel.exists({
      _id: this.storeId,
      isActive: true,
    });

    if (throwError && !isStoreActive) {
      throw new Error(
        "STORE_NOT_ACTIVE: it looks like this store is not yet active, if you believe this is an error, please contact support."
      );
    }

    return Boolean(isStoreActive);
  }

  async getIntegrations() {}

  async getStore() {
    const store = await StoreModel.findById(this.storeId);

    this.store = store.toObject();

    return store;
  }

  public async canStoreGoPublic() {
    /**
     * For store to go public we have to consider the following
     * 1. Store Must have atleast one product,
     * 2. Store Must have a payment option
     * 3. Store Must have a theme and
     */

    this.doesStoreHavePaymentOption();

    const product = await ProductModel.exists({
      storeId: this.storeId,
      isActive: true,
    });

    if (!Boolean(product)) {
      throw new Error("Store must have atleast one product before going live");
    }

    const storeOwner = await this.getUser();

    if (!(storeOwner.isEmailVerified && storeOwner.phoneNumber)) {
      throw new Error(
        "Store owner must have their email verified and have phone number available before store can be live"
      );
    }

    const store = await StoreModel.findById(this.storeId);

    if (!store?.customizations?.theme) {
      const theme = themes[0];

      //Add a new theme if the store does not have a theme already
      await store.updateOne({
        customizations: {
          $set: { theme },
        },
      });
    }
  }

  public async doesStoreHavePaymentOption() {
    const INTEGRATION_NAME = "flutterwave" as const;

    const flutterwaveIntegration = await IntegrationModel.exists({
      "integration.name": INTEGRATION_NAME,
      "integration.isConnected": true,
    });

    //Check if the integration does not exist default to the store account number
    if (!flutterwaveIntegration) {
      const storeAccountNumber = await StoreBankAccountModel.exists({
        isDefault: true,
        storeId: this.storeId,
        userId: this.userId,
      });

      //If the store has an account number
      if (!storeAccountNumber) {
        throw new Error(
          "ADD_A_PAYMENT_OPTION: Your store does not have a payment option, please add one before proceeding."
        );
      }
    }
  }

  public async previewStore(storeCode?: string) {
    //This is use to preview the store for the admin only.

    //Getting the store with the store code or the store id
    const store = await StoreModel.findOne({ storeCode });

    if (!store) {
      return { action: "not-found" };
    }

    //This means that the admin wants to preview their store
    if (!!this.userId) {
      const now = new Date();
      const previewMinute = new Date(store?.previewFor);

      if (!store.previewFor || now > previewMinute) {
        return { action: "expired" };
      }

      return { store };
    }

    if (!store.isActive) {
      return { action: "not-active" };
    }

    return { store, action: "preview" };
  }

  public async editStore(updates: Partial<IStore>, partial = true) {
    //await this.isStoreActive(true);

    if (updates?.customizations?.category?.showImage) {
      const categories = await CategoryModel.find({
        storeId: this.storeId,
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
      { _id: this.storeId, owner: this.userId },
      partial ? { $set: updates } : updates,
      { runValidators: true, new: true }
    ).lean();
  }
}

export class Order extends Store {
  order: IOrder;

  constructor(storeId?: string, userId?: string) {
    super(storeId, userId);
  }

  async validateOrder(props: Partial<IOrder> & { couponCode?: string }) {
    if (props.products.length <= 0) {
      await this.cancelSession();
      throw new Error(
        "ORDER_CREATION_FAILED: Please select atleast one product to create an order"
      );
    }

    if (!props.storeId) {
      await this.cancelSession();
      throw new Error(
        "ORDER_CREATION_FAILED: store Id is required to create an order for customer"
      );
    }

    if (!(props.customerDetails.email && props.customerDetails.phoneNumber)) {
      await this.cancelSession();
      throw new Error(
        "ORDER_CREATION_FAILED: Customer details are required to create an order, email and phone number are required"
      );
    }

    const { city, state, country, ...address } =
      props.customerDetails.shippingAddress;

    if (!(state && country && address && city)) {
      throw new Error(
        "ORDER_CREATION_FAILED: Shipping address is required to create an order, city, state, country and address are required"
      );
    }
  }

  async createOrder(props: Partial<IOrder>) {
    this.startSession();

    await this.isStoreActive(); //Check if the store is active or not;

    const { owner, _id } = await this.getStore();

    const { email: storeOwnerEmail } = await this.getUser(owner);

    const ref = this.generateRef; //Generate a reference number
    const now = new Date();

    await this.validateOrder(props); //Validate the order

    props = {
      ...props,
      amountLeftToPay: 0,
      amountPaid: 0,
      totalAmount: 0,
      paymentDetails: {
        ...props.paymentDetails,
        paymentDate: now.toISOString(),
        paymentStatus: "pending",
        transactionId: ref,
        tx_ref: ref,
      },
      orderStatus: "Pending",
      storeId: _id,
    };

    //Restructuring the product payload to avoid illegal data manipulation
    const products = props.products.map((product) => ({
      size: product.size,
      productId: product._id,
      color: product.color,
    }));

    console.log({ products });

    const { totalAmount } = await this.calculateOrderAmount(
      products,
      props.coupon
    );

    props.amountLeftToPay = totalAmount;
    props.totalAmount = totalAmount;

    const payment = new PaymentService(props.storeId!);

    if (!(await payment.isPaymentIntegrationConnected())) {
      //Check if store has an account number
      if (!(await payment.doesStoreHasBankAccountAvailable())) {
        await this.cancelSession();
        throw new Error(
          "ORDER_CREATION_FAILED: store does not have a payment option connected, please contact the store owner with this message or contact support."
        );
      }
    }

    //If the customer wants to use the sendbox carrier, then we find the integration;
    if (props.deliveryType === "sendbox") {
      const sendBox = new SendBox(this.storeId, true, true); //Assert is set to true because if the store owner does not connect the sendBox integration, it show true an error;

      //  Calculate the delivery fee for the customer products
      const { rates } = await sendBox.calculateShippingCost(
        {
          ...props.customerDetails,
          shippingDetails: { ...props.customerDetails.shippingAddress },
        },
        props.totalAmount,
        props.products
      );

      props.amountLeftToPay = props.amountLeftToPay + rates[0].fee;
      props.totalAmount = props.amountLeftToPay + rates[0].fee;
      props.shippingDetails.shippingCost = rates[0].fee;
    }
    const order = new OrderModel(props);

    const newOrder = await order.save({
      validateBeforeSave: true,
      session: this.session,
    });

    await this.commitSession();

    const customerEmailTemplate = `
      <div style="background-color: #f3f4f6; padding: 20px; font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6b46c1; margin: 0;">Order Received Successfully!</h1>
          </div>
          <p style="color: #374151; font-size: 16px; line-height: 24px;">
            Dear ${props.customerDetails.name},
          </p>
          <p style="color: #374151; font-size: 16px; line-height: 24px;">
            Thank you for your order. We're excited to confirm that your order has been received and is being processed.
          </p>
          <div style="margin: 30px 0; padding: 20px; background-color: #f3f4f6; border-radius: 4px;">
            <p style="color: #374151; margin: 0;">Order Total: ${formatAmountToNaira(
              props.totalAmount
            )}</p>
          </div>
          <p style="color: #374151; font-size: 16px; line-height: 24px;">
            We'll notify you once your order has been shipped.
          </p>
          <div style="text-align: center; margin-top: 30px;">
            <a href="${config.CLIENT_DOMAIN}/orders/${newOrder._id}" 
               style="background-color: #6b46c1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-bottom: 20px;">
              View Order Details
            </a>
            <p style="color: #6b46c1; font-size: 14px;">Thank you for shopping with us!</p>
          </div>
        </div>
      </div>
    `;

    const storeEmailTemplate = `
      <div style="background-color: #f3f4f6; padding: 20px; font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6b46c1; margin: 0;">New Order Received!</h1>
          </div>
          <p style="color: #374151; font-size: 16px; line-height: 24px;">
            You have received a new order from ${props.customerDetails.name}.
          </p>
          <div style="margin: 30px 0; padding: 20px; background-color: #f3f4f6; border-radius: 4px;">
            <p style="color: #374151; margin: 0;">Order Total: ${formatAmountToNaira(
              props.totalAmount
            )}</p>
            <p style="color: #374151; margin: 10px 0 0 0;">Customer Email: ${
              props.customerDetails.email
            }</p>
          </div>
          <p style="color: #374151; font-size: 16px; line-height: 24px;">
            Please process this order as soon as possible.
          </p>
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #6b46c1; font-size: 14px;">Thank you for using our platform!</p>
          </div>
        </div>
      </div>
    `;

    await sendEmail(
      props.customerDetails.email,
      customerEmailTemplate,
      undefined,
      "Order Received Successfully!"
    )
      .then(async () => {
        await sendEmail(
          storeOwnerEmail,
          storeEmailTemplate,
          undefined,
          "New Order Received!"
        );
      })
      .catch(async () => await this.cancelSession());

    return newOrder.toObject();
  }

  async calculateOrderAmount(
    items: { productId: string; color?: string; size?: string }[],
    couponCode?: string
  ) {
    // Fetch individual products based on cart items
    const productPromises = items.map((item) =>
      ProductModel.findById(item.productId)
    );
    const products = await Promise.all(productPromises);

    // Validate if all products exist
    const productMap: Record<string, IProduct> = {};
    products.forEach((product, index) => {
      if (!product) {
        throw new Error(`Product with ID ${items[index].productId} not found.`);
      }
      productMap[items[index].productId] = product;
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

    let amount = 0;
    let totalDiscount = 0;

    for (const item of items) {
      const { productId, size } = item;
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
      amount += finalPrice;
      totalDiscount += productDiscount;
    }

    // Apply shopping cart-wide coupon if applicable
    if (coupon && coupon.appliedTo === "shoppingCart") {
      let cartDiscount = 0;
      if (coupon.type === "percentageCoupon") {
        cartDiscount = (amount * coupon.discountValue) / 100;
      } else if (coupon.type === "nairaCoupon") {
        cartDiscount = coupon.discountValue;
      }

      amount = Math.max(0, amount - cartDiscount);
      totalDiscount += cartDiscount;
    }

    const originalTotal = amount + totalDiscount;
    const discountPercentage = originalTotal
      ? (totalDiscount / originalTotal) * 100
      : 0;

    return {
      totalAmount: amount,
      discountedAmount: totalDiscount,
      discountPercentage: parseFloat(discountPercentage.toFixed(2)), // Limit to 2 decimal places
    };
  }

  async getOrder(orderId: string, phoneNumber?: string) {
    await this.startSession();

    const order = await OrderModel.findOne({
      _id: orderId,
      "customerDetails.phoneNumber": phoneNumber,
    }).session(this.session);

    if (!order) {
      await this.cancelSession();
      throw new Error("ORDER_QUERY_FAILED: unable to locate your order");
    }

    this.order = order;
    this.storeId = order.storeId;

    await this.commitSession();

    return order;
  }

  async editOrder(
    orderId: string,
    phoneNumber: string,
    updates: Partial<IOrder>,
    isAdmin = false
  ) {
    const query = isAdmin
      ? { _id: orderId, storeId: this.storeId }
      : { _id: orderId, "customerDetails.phoneNumber": phoneNumber };

    const restrictedKeys = new Set([
      "orderStatus",
      "paymentDetails",
      "paymentStatus",
      "createdAt",
      "updatedAt",
      "shippingDetails",
      "totalAmount",
      "storeId",
      "amountLeftToPay",
      "amountPaid",
      "coupon",
    ]);

    const updateKeys = Object.keys(updates);

    for (const updateKey of updateKeys) {
      if (!isAdmin && restrictedKeys.has(updateKey)) {
        throw new Error(
          "UNAUTHORIZE_ACTION: You are not allow to modify/configure this properties"
        );
      }
    }

    const order = await OrderModel.findOne(query).session(this.session);

    if (isAdmin && order.storeId !== this.storeId) {
      await this.cancelSession();
      throw new Error(
        "UNAUTHORIZED_ACTION: You are not allow to perform this action."
      );
    }

    if (!order) {
      await this.cancelSession();
      throw new Error("ORDER_QUERY_FAILED: unable to locate your order");
    }

    Object.assign(order, updates);

    await order.save({ validateBeforeSave: true, session: this.session });

    return order;
  }

  isOperationAllowed() {
    if (this.order?.orderStatus === "Completed") {
      throw new Error("ORDER_UPDATE_FAILED: Order has been completed");
    }

    if (this.order?.orderStatus === "Cancelled") {
      throw new Error("ORDER_UPDATE_FAILED: Order has been cancelled");
    }

    if (this.order.orderStatus === "Shipped") {
      throw new Error("ORDER_UPDATE_FAILED: Order has been shipped");
    }

    if (this.order.orderStatus === "Refunded") {
      throw new Error("ORDER_UPDATE_FAILED: Order has been refunded");
    }
  }

  async requestCancellation(
    orderId: string,
    phoneNumber: string,
    cancellationReason?: string
  ) {
    await this.getOrder(orderId, phoneNumber);

    this.isOperationAllowed();

    await this.getStore();

    const { email } = await this.getUser(this.store.owner);

    await sendEmail(
      email,
      `
        <div>
          <h2>Order Cancellation Request</h2>
          <p>Dear Store Owner,</p>
          <p>A customer has requested to cancel their order. Please review the details below:</p>
          <p>Order ID: ${orderId}</p>
          <p>You can review and process this cancellation request by clicking the button below:</p>
          <p>Reason: ${cancellationReason}</p>
          <a href="${config.CLIENT_DOMAIN}/dashboard-orders/${orderId}" style="
            background-color: #4CAF50;
            border: none;
            color: white;
            padding: 15px 32px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 16px;
            margin: 4px 2px;
            cursor: pointer;
            border-radius: 4px;
          ">
            View Order Details
          </a>
          <p>Please handle this request as soon as possible to ensure customer satisfaction.</p>
          <p>Best regards,<br>StoreBuild Team</p>
        </div>
      `,
      undefined,
      "Order Cancellation Request"
    );
  }
}
