import express from "express";
import { body } from "express-validator";
import { validateRequest } from "./helper";
import {
  _calculateDeliveryCost,
  _getBanks,
  _sendOTP,
  _sendQuickEmail,
  addOrEditStoreAddress,
  calculateProductPrice,
  completeOrderPayment,
  connectAndDisconnectIntegration,
  createCategory,
  createCoupon,
  createDeliveryPickupForOrder,
  createOrder,
  createOrEditProduct,
  deleteCategory,
  deleteCoupon,
  deleteProduct,
  deleteStoreAddress,
  doesEmailOrStoreExist,
  editCategory,
  editDeliveryAddress,
  editOrder,
  editStore,
  getCategories,
  getCoupon,
  getCoupons,
  getCustomer,
  getCustomers,
  getCustomerStats,
  getDashboardContent,
  getIntegration,
  getIntegrations,
  getOrder,
  getOrderMetrics,
  getOrders,
  getProduct,
  getProductAnalytics,
  getProductReview,
  getProducts,
  getProductTypes,
  getProductWithIds,
  getQuickEmails,
  getSalesChartData,
  getStore,
  getStoreAddresses,
  getThemes,
  getUser,
  initiateChargeForSubscription,
  joinNewsLetter,
  manageIntegration,
  requestCancelOrder,
  requestConfirmationOnOrder,
  signUp,
  verifyAccountNumber,
  verifySubscription,
  verifyToken,
  welcomeHome,
  writeReviewOnProdcut,
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

router.post("/send-otp/", [body("tokenFor").isEmpty()], _sendOTP);

router.post(
  "/verify-token/",
  [body("otp").isEmpty().withMessage("OTP is required")],
  passUserIfAuthenticated,
  verifyToken
);

router.get("/user/", checkIfUserIsAuthenticated, getUser);

router.get(
  "/verify-subscription/",
  checkIfUserIsAuthenticated,
  verifySubscription
);

router.get("/get-banks/", _getBanks);

router.get("/get-categories/:storeId/", getCategories);

router.get("/verify-account-number/", verifyAccountNumber);

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

router.get("/get-orders/:orderId/", passUserIfAuthenticated, getOrder);

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

router.post(
  "/initialize-charge-for-subscription/",
  checkIfUserIsAuthenticated,
  initiateChargeForSubscription
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

router.get("/", welcomeHome);

export default (): express.Router => {
  return router;
};
