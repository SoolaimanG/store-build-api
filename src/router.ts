import express from "express";
import { body } from "express-validator";
import { validateRequest } from "./helper";
import {
  _calculateDeliveryCost,
  sendOTP,
  _sendQuickEmail,
  addBankAccount,
  addOrEditStoreAddress,
  addSendBoxApiKey,
  aiStoreAssistant,
  calculateProductPrice,
  completeOrderPayment,
  connectAndDisconnectIntegration,
  createCategory,
  createCoupon,
  createDedicatedAccount,
  createDeliveryPickupForOrder,
  createOrder,
  createOrEditProduct,
  customerAiChat,
  deleteCategory,
  deleteCoupon,
  deleteProduct,
  deleteSendBoxApiKey,
  deleteStoreAddress,
  doesEmailOrStoreExist,
  editCategory,
  editDeliveryAddress,
  editOrder,
  editOrderForCustomer,
  editStore,
  exportCustomerData,
  getAiConversation,
  getBanks,
  getCategories,
  getCoupon,
  getCoupons,
  getCustomer,
  getCustomers,
  getCustomerStats,
  getDashboardContent,
  getDedicatedAcocunt,
  getIntegration,
  getIntegrations,
  getInvoice,
  getOnBoardingFlows,
  getOrder,
  getOrderMetrics,
  getOrders,
  getProduct,
  getProductAnalytics,
  getProductDraft,
  getProductReview,
  getProducts,
  getProductTypes,
  getProductWithIds,
  getQuickEmails,
  getReferrals,
  getSalesChartData,
  getStore,
  getStoreAddresses,
  getStoreBank,
  getThemes,
  getTutorial,
  getUser,
  hasFinishedTutorialVideo,
  joinNewsLetter,
  makePayment,
  manageIntegration,
  markTutorialAsCompleted,
  requestCancelOrder,
  requestConfirmationOnOrder,
  signUp,
  updateUser,
  validateFlutterwavePayment,
  verifyAccountNumber,
  verifyToken,
  watchTutorial,
  welcomeHome,
  writeReviewOnProdcut,
  subscribeForStoreBuildAI,
} from "./controllers";
import {
  checkIfUserIsAuthenticated,
  passUserIfAuthenticated,
} from "./middle-ware";

const router = express.Router();

router.post(
  "/join-newsletter/",
  [body("email").isEmail().withMessage("Please provide a valid email address")],
  //  @ts-ignore
  validateRequest,
  joinNewsLetter
);

router.get("/product-types/", getProductTypes);

router.post(
  "/sign-up/",
  [
    body("email").isEmail().withMessage("Please provide a valid email address"),
    body("storeName")
      .isEmpty()
      .withMessage("Please provide a name for your store"),
  ],
  // @ts-ignore
  signUp
);

router.get("/does-email-or-store-exist/", doesEmailOrStoreExist);

router.post("/send-otp/", [body("tokenFor").isEmpty()], sendOTP);

router.post(
  "/verify-token/",
  [body("otp").isEmpty().withMessage("OTP is required")],
  passUserIfAuthenticated,
  verifyToken
);

router.get("/user/", checkIfUserIsAuthenticated, getUser);

router.get("/get-categories/:storeId/", getCategories);

router.get(
  "/verify-account-number/",
  checkIfUserIsAuthenticated,
  verifyAccountNumber
);

router.get(
  "/get-dashboard-content/",
  checkIfUserIsAuthenticated,
  getDashboardContent
);

router.get("/get-products/", passUserIfAuthenticated, getProducts);

router.get("/get-orders/", checkIfUserIsAuthenticated, getOrders);

router.post(
  "/create-or-edit-product/",
  checkIfUserIsAuthenticated,
  createOrEditProduct
);

router.get(
  "/get-product-analytics/:productId/",
  checkIfUserIsAuthenticated,
  getProductAnalytics
);

router.delete(
  "/delete-products/:productId/",
  checkIfUserIsAuthenticated,
  deleteProduct
);

const categoryValidation = [
  body("icon").isEmpty().withMessage("Please select an Icon"),
  body("name").isEmpty().withMessage("Please give a name to this category"),
  body("slot").isEmpty().withMessage("Please give your category a slot name"),
];

router.post(
  "/create-category/",
  checkIfUserIsAuthenticated,
  categoryValidation,
  createCategory
);

router.post(
  "/connect-and-disconnect-integration/",
  checkIfUserIsAuthenticated,
  connectAndDisconnectIntegration
);

router.patch(
  "/manage-integration/",
  checkIfUserIsAuthenticated,
  manageIntegration
);

router.get("/get-integrations/", checkIfUserIsAuthenticated, getIntegrations);

router.get(
  "/get-integrations/:integration/",
  checkIfUserIsAuthenticated,
  getIntegration
);

router.get("/get-products/:productId/", getProduct);

router.get("/get-quick-emails/", checkIfUserIsAuthenticated, getQuickEmails);

router.post(
  "/send-quick-email/:emailId/",
  checkIfUserIsAuthenticated,
  _sendQuickEmail
);

router.post("/create-order/", passUserIfAuthenticated, createOrder);

router.post("/calculate-products-price/", calculateProductPrice);

router.get("/get-orders/:orderId/", getOrder);

router.patch("/edit-order/:orderId/", checkIfUserIsAuthenticated, editOrder);

router.get("/get-customers/", checkIfUserIsAuthenticated, getCustomers);

router.get("/get-customers/:email/", checkIfUserIsAuthenticated, getCustomer);

router.post("/edit-store/", checkIfUserIsAuthenticated, editStore);

router.get("/get-store/", passUserIfAuthenticated, getStore);

router.get("/get-themes/", getThemes);

router.get("/get-product-review/:storeId/:productId/", getProductReview);

router.patch("/edit-category/:id/", checkIfUserIsAuthenticated, editCategory);

router.post("/write-review-on-product/", writeReviewOnProdcut);

router.get("/get-products-with-ids/", getProductWithIds);

router.post("/create-coupon/", checkIfUserIsAuthenticated, createCoupon);

router.get("/get-coupons/", checkIfUserIsAuthenticated, getCoupons);

router.get("/get-coupons/:couponCode/", checkIfUserIsAuthenticated, getCoupon);

router.delete(
  "/delete-coupon/:couponId/",
  checkIfUserIsAuthenticated,
  deleteCoupon
);

router.post("/complete-payment/:orderId/", completeOrderPayment);

router.delete(
  "/delete-category/:id/",
  checkIfUserIsAuthenticated,
  deleteCategory
);

router.post("/calculate-delivery-cost/:storeId/", _calculateDeliveryCost);

router.get(
  "/get-store-addresses/",
  checkIfUserIsAuthenticated,
  getStoreAddresses
);

router.post(
  "/add-or-edit-store-address/",
  checkIfUserIsAuthenticated,
  addOrEditStoreAddress
);

router.delete(
  "/delete-store-address/:addressId/",
  checkIfUserIsAuthenticated,
  deleteStoreAddress
);

router.patch("/edit-delivery-address/:orderId/", editDeliveryAddress);

router.get("/request-confirmation-order/:orderId/", requestConfirmationOnOrder);

router.get(`/request-cancel-order/:orderId/`, requestCancelOrder);

router.get(
  "/get-sales-chart-data/",
  checkIfUserIsAuthenticated,
  getSalesChartData
);

router.get(
  "/get-customers-stats/",
  checkIfUserIsAuthenticated,
  getCustomerStats
);

router.get("/get-order-metrics/", checkIfUserIsAuthenticated, getOrderMetrics);

router.post(
  "/create-delivery-pickup/:orderId",
  checkIfUserIsAuthenticated,
  createDeliveryPickupForOrder
);

router.patch("/update-user/", checkIfUserIsAuthenticated, updateUser);

router.get(`/get-referrals/`, checkIfUserIsAuthenticated, getReferrals);

router.post(
  "/mark-tutorial-as-completed/",
  checkIfUserIsAuthenticated,
  markTutorialAsCompleted
);

router.get("/get-tutorial/:videoId/", checkIfUserIsAuthenticated, getTutorial);

router.post(`/watch-tutorial/`, checkIfUserIsAuthenticated, watchTutorial);

router.get(
  "/has-finished-tutorial-videos/",
  checkIfUserIsAuthenticated,
  hasFinishedTutorialVideo
);

router.post(
  "/export-customers-data/",
  checkIfUserIsAuthenticated,
  exportCustomerData
);

router.post("/customer-ai-chat/:storeId/", customerAiChat);

router.get("/get-ai-conversation/", passUserIfAuthenticated, getAiConversation);

router.post(
  "/ai-store-assistant/",
  checkIfUserIsAuthenticated,
  aiStoreAssistant
);

router.patch("/edit-order-for-customer/:orderId/", editOrderForCustomer);

router.get(
  `/get-onboarding-flow/`,
  checkIfUserIsAuthenticated,
  getOnBoardingFlows
);

router.get("/get-banks/", checkIfUserIsAuthenticated, getBanks);

router.get(`/get-store-bank/`, checkIfUserIsAuthenticated, getStoreBank);

router.get(`/get-invoice/:invoiceId/`, checkIfUserIsAuthenticated, getInvoice);

router.post(
  "/add-send-box-api-key/",
  checkIfUserIsAuthenticated,
  addSendBoxApiKey
);

router.delete(
  "/delete-send-box-api-keys/",
  checkIfUserIsAuthenticated,
  deleteSendBoxApiKey
);

router.post("/add-bank-account/", checkIfUserIsAuthenticated, addBankAccount);

router.get(
  "/get-products-drafts/",
  checkIfUserIsAuthenticated,
  getProductDraft
);

router.get(
  "/get-dedicated-account/",
  checkIfUserIsAuthenticated,
  getDedicatedAcocunt
);

router.post(
  "/create-dedicated-account/",
  checkIfUserIsAuthenticated,
  createDedicatedAccount
);

router.post("/create-charge/", passUserIfAuthenticated, makePayment);

router.get(`/validate-flutter-wave-payment/`, validateFlutterwavePayment);

router.post(
  "/subcribe-to-chat-bot/",
  checkIfUserIsAuthenticated,
  subscribeForStoreBuildAI
);

router.get("/", welcomeHome);

export default (): express.Router => {
  return router;
};
