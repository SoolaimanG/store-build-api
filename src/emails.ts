import dotenv from "dotenv";
import {
  ICustomerAddress,
  IOrder,
  IOrderProduct,
  IOrderStatus,
  IPaymentDetails,
  IProduct,
  PATHS,
} from "./types";
import { formatAmountToNaira } from "./helper";
import { format } from "date-fns";
import { config } from "./constant";

dotenv.config();

export const footer = () => {
  return `
     <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${
    process.env.APP_NAME
  }. All rights reserved.<br>
            123 Your Street, Your City, ST 12345</p>
        </div>
    `;
};

interface Theme {
  primary: string;
  secondary: string;
  background: string;
  text: string;
}

export const otpEmailTemplate = (otp: string, storeName: string) => {
  return `
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your OTP for Account Verification</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            background-color: #f9fafb;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #ffffff;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
        }
        .logo {
            max-width: 100px;
            height: auto;
        }
        h1 {
            color: #333333;
            font-size: 24px;
            margin-bottom: 20px;
        }
        .otp-container {
            background-color: #8b5cf6;
            color: #ffffff;
            font-size: 32px;
            font-weight: bold;
            text-align: center;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href=${config.CLIENT_DOMAIN} class="logo">Visit ${
    config.APP_NAME
  }</a>
        </div>
        <h1>Verify Your Account</h1>
        <p>Hello ${storeName},</p>
        <p>Your One-Time Password (OTP) for account verification is:</p>
        <div class="otp-container">
           ${otp}
        </div>
        <p>This OTP will expire in 10 minutes. Please do not share this code with anyone.</p>
        <p>If you didn't request this OTP, please ignore this email or contact our support team if you have any concerns.</p>
    ${footer()}
    </div>
</body>
</html>
    `;
};

export const subscriptionSuccessful = (
  amount: string,
  paymentDate: string,
  nextBillingDate: string,
  storeName: string
) => {
  // Generate the feature list dynamically
  const featureList = [
    "Unlimited products",
    "Advanced analytics",
    "Priority support",
    "Dynamic styling and template customization",
    "Marketing tools",
  ]
    .map((feature) => `<li style="margin-bottom: 10px;">${feature}</li>`)
    .join("");

  return `
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f8; margin: 0; padding: 0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 30px; text-align: center; background-color: #a855f7; border-radius: 8px 8px 0 0;">
                            <h1 style="color: #ffffff; font-size: 28px; margin: 0;">Subscription Confirmed!</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px 0; font-size: 16px;">Dear ${storeName},</p>
                            <p style="margin: 0 0 20px 0; font-size: 16px;">Thank you for subscribing to our premium service. Your payment has been successfully processed, and your subscription is now active.</p>
                            <h2 style="color: #a855f7; font-size: 20px; margin: 30px 0 20px 0;">Subscription Details:</h2>
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #eeeeee;"><strong>Plan:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #eeeeee;">Premium</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #eeeeee;"><strong>Amount Paid:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #eeeeee;">${amount}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #eeeeee;"><strong>Payment Date:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #eeeeee;">${paymentDate}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #eeeeee;"><strong>Next Billing Date:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #eeeeee;">${nextBillingDate}</td>
                                </tr>
                            </table>
                            <p style="margin: 0 0 20px 0; font-size: 16px;">You now have access to all our premium features, including:</p>
                            <ul style="margin: 0 0 20px 0; padding-left: 20px;">
                                ${featureList}
                            </ul>
                            <p style="margin: 0 0 20px 0; font-size: 16px;">If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                            <p style="margin: 0; font-size: 16px;">Thank you for choosing our service!</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                     ${footer()}
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
};

export const paymentDetailsAddedEmail = (
  accountName: string,
  accountNumber: string,
  bankName: string
) => {
  return `
    
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Details Added Successfully</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 0;">
                <table role="presentation" style="width: 600px; margin: auto; background-color: #ffffff; border-collapse: collapse;">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="padding: 40px 0; background-color: #6200ea;">
                            <img src="https://example.com/logo.png" alt="Company Logo" width="200" style="display: block;">
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h1 style="color: #333333; font-size: 24px; margin-bottom: 20px;">Payment Details Added Successfully</h1>
                            <p style="color: #666666; font-size: 16px; line-height: 1.5;">Dear [User's Name],</p>
                            <p style="color: #666666; font-size: 16px; line-height: 1.5;">We're pleased to inform you that your payment details have been successfully added to your account. Here's a summary of the information we've recorded:</p>
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px;">
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #dddddd; font-weight: bold;">Bank Name:</td>
                                    <td style="padding: 10px; border: 1px solid #dddddd;">${bankName}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #dddddd; font-weight: bold;">Account Name:</td>
                                    <td style="padding: 10px; border: 1px solid #dddddd;">${accountName}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #dddddd; font-weight: bold;">Account Number:</td>
                                    <td style="padding: 10px; border: 1px solid #dddddd;">XXXX XXXX ${accountNumber.slice(
                                      -4
                                    )}</td>
                                </tr>
                            </table>
                            <p style="color: #666666; font-size: 16px; line-height: 1.5;">This information will be used for future payouts and transactions on your account. If you notice any discrepancies or if you didn't authorize this change, please contact our support team immediately.</p>
                            <a href="https://example.com/account" style="display: inline-block; padding: 12px 20px; margin-top: 20px; background-color: #6200ea; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">View Your Account</a>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    ${footer()}
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    
    `;
};

export const customerTemplate = (
  order: IOrder,
  orderLink: string,
  formattedDate: string,
  formatAmountToNaira: (amount: number) => string,
  shippingAddressHtml: string,
  theme: Theme
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Complete Your Order Payment</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: ${
  theme.background
}; color: ${theme.text}; line-height: 1.6;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${
      theme.background
    };">
        <tr>
            <td style="padding: 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h1 style="color: ${
                              theme.primary
                            }; font-size: 24px; margin-bottom: 20px; text-align: center;">Complete Your Order Payment</h1>
                            
                            <p style="margin-bottom: 20px;">Dear ${
                              order.customerDetails.name
                            },</p>
                            
                            <p style="margin-bottom: 20px;">Thank you for placing your order with us. To complete your purchase, please proceed with the payment using the button below:</p>
                            
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                                <tr>
                                    <td align="center">
                                        <a href="${
                                          order.paymentDetails.paymentLink
                                        }" style="display: inline-block; padding: 14px 30px; background-color: ${
  theme.primary
}; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold; text-align: center; font-size: 16px;">Complete Payment</a>
                                    </td>
                                </tr>
                            </table>
                            
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px; border: 1px solid #e0e0e0; border-radius: 4px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <h2 style="color: ${
                                          theme.primary
                                        }; font-size: 18px; margin-top: 0; margin-bottom: 15px;">Order Summary</h2>
                                        <p style="margin: 5px 0;"><strong>Order Number:</strong> ${
                                          order._id
                                        }</p>
                                        <p style="margin: 5px 0;"><strong>Order Date:</strong> ${formattedDate}</p>
                                        <p style="margin: 5px 0;"><strong>Total Amount:</strong> ${formatAmountToNaira(
                                          order.totalAmount
                                        )}</p>
                                        
                                        ${shippingAddressHtml}
                                        
                                        <h3 style="color: ${
                                          theme.primary
                                        }; font-size: 16px; margin-top: 20px; margin-bottom: 10px;">Shipping Details</h3>
                                        ${
                                          order?.shippingDetails?.shippingMethod
                                            ? `<p style="margin: 5px 0;"><strong>Shipping Method:</strong> ${order.shippingDetails.shippingMethod}</p>`
                                            : ""
                                        }
                                        <p style="margin: 5px 0;"><strong>Estimated Delivery:</strong> ${
                                          order?.shippingDetails
                                            ?.estimatedDeliveryDate
                                        }</p>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin-bottom: 20px;">You can view your order details anytime by clicking the button below:</p>
                            
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                                <tr>
                                    <td align="center">
                                        <a href="${orderLink}" style="display: inline-block; padding: 12px 25px; background-color: ${
  theme.secondary
}; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold; text-align: center; font-size: 14px;">View Order Details</a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin-top: 30px; font-style: italic; color: #666666;">If you have any questions about your order, please don't hesitate to contact our customer support team.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="margin: 0; color: #888888; font-size: 12px;">© ${new Date().getFullYear()} Your Company Name. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

export const adminTemplate = (
  order: IOrder,
  orderLink: string,
  formattedDate: string,
  formatAmountToNaira: (amount: number) => string,
  shippingAddressHtml: string,
  theme: Theme
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Order Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: ${
  theme.background
}; color: ${theme.text}; line-height: 1.6;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${
      theme.background
    };">
        <tr>
            <td style="padding: 20px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h1 style="color: ${
                              theme.primary
                            }; font-size: 24px; margin-bottom: 20px; text-align: center;">New Order Received</h1>
                            
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px; border-bottom: 1px solid #e0e0e0; padding-bottom: 20px;">
                                <tr>
                                    <td>
                                        <h2 style="color: ${
                                          theme.primary
                                        }; font-size: 18px; margin-bottom: 10px;">Order Details</h2>
                                        <p style="margin: 5px 0;"><strong>Order Number:</strong> ${
                                          order._id
                                        }</p>
                                        <p style="margin: 5px 0;"><strong>Order Date:</strong> ${formattedDate}</p>
                                        <p style="margin: 5px 0;"><strong>Payment Status:</strong> <span style="color: #ff6b6b; font-weight: bold;">Pending</span></p>
                                        <p style="margin: 5px 0;"><strong>Total Amount:</strong> ${formatAmountToNaira(
                                          order.totalAmount
                                        )}</p>
                                    </td>
                                </tr>
                            </table>

                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px; border-bottom: 1px solid #e0e0e0; padding-bottom: 20px;">
                                <tr>
                                    <td>
                                        <h2 style="color: ${
                                          theme.primary
                                        }; font-size: 18px; margin-bottom: 10px;">Customer Information</h2>
                                        <p style="margin: 5px 0;"><strong>Name:</strong> ${
                                          order.customerDetails.name
                                        }</p>
                                        <p style="margin: 5px 0;"><strong>Email:</strong> ${
                                          order.customerDetails.email
                                        }</p>
                                        <p style="margin: 5px 0;"><strong>Phone:</strong> ${
                                          order.customerDetails.phoneNumber
                                        }</p>
                                    </td>
                                </tr>
                            </table>

                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                                <tr>
                                    <td>
                                        <h2 style="color: ${
                                          theme.primary
                                        }; font-size: 18px; margin-bottom: 10px;">Shipping Details</h2>
                                        ${shippingAddressHtml}
                                        ${
                                          order.shippingDetails?.shippingMethod
                                            ? `<p style="margin: 5px 0;"><strong>Shipping Method:</strong> ${order.shippingDetails.shippingMethod}</p>`
                                            : ""
                                        }
                                        <p style="margin: 5px 0;"><strong>Estimated Delivery:</strong> ${
                                          order?.shippingDetails
                                            ?.estimatedDeliveryDate ||
                                          "In 5 days"
                                        }</p>
                                    </td>
                                </tr>
                            </table>

                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <a href="${orderLink}" style="display: inline-block; padding: 14px 30px; background-color: ${
  theme.primary
}; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold; text-align: center; font-size: 16px;">View Order in Dashboard</a>
                                    </td>
                                </tr>
                            </table>

                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 40px;">
                                <tr>
                                    <td style="text-align: center; color: #888888; font-size: 12px;">
                                        <p>This is an automated notification. Please check the admin dashboard for more details.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

export function generateOrderEmail(
  order: IOrder,
  orderLink: string,
  theme: Theme
) {
  const formattedDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formatAmountToNaira = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(amount);
  };

  const shippingAddressHtml = order.customerDetails.shippingAddress
    ? `
    <h3 style="color: ${
      theme.primary
    }; font-size: 16px; margin-top: 20px; margin-bottom: 10px;">Shipping Address</h3>
    <p style="margin: 5px 0;">${
      order.customerDetails.shippingAddress.addressLine1
    }</p>
    <p style="margin: 5px 0;">${
      order.customerDetails.shippingAddress.addressLine2 || ""
    }</p>
    <p style="margin: 5px 0;">${order.customerDetails.shippingAddress.city}, ${
        order.customerDetails.shippingAddress.state
      } ${order.customerDetails.shippingAddress.postalCode}</p>
    <p style="margin: 5px 0;">${
      order.customerDetails.shippingAddress.country
    }</p>
  `
    : "";

  return {
    customerEmail: customerTemplate(
      order,
      orderLink,
      formattedDate,
      formatAmountToNaira,
      shippingAddressHtml,
      theme
    ),
    adminEmail: adminTemplate(
      order,
      orderLink,
      formattedDate,
      formatAmountToNaira,
      shippingAddressHtml,
      theme
    ),
  };
}

// Reusable button style
const buttonStyle = `
  background-color: #3498db;
  color: white;
  padding: 12px 25px;
  text-decoration: none;
  border-radius: 5px;
  display: inline-block;
  margin: 10px 5px;
  font-weight: bold;
`;

const secondaryButtonStyle = `
  background-color: #95a5a6;
  color: white;
  padding: 12px 25px;
  text-decoration: none;
  border-radius: 5px;
  display: inline-block;
  margin: 10px 5px;
  font-weight: bold;
`;

export const getQuickEmailsTemplate = (
  templateId: string,
  data: IOrder
): string => {
  const templates = {
    "order-reminder": (data: IOrder) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Reminder</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Order Reminder</h2>
        <p>Dear ${data.customerDetails.name},</p>
        <p>We noticed that your order #${data._id} placed on ${format(
      data.createdAt,
      "d MMM yyyy h:mm aaa"
    )} is still pending. We wanted to check if you need any assistance with completing your purchase.</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 0;"><strong>Order Details:</strong></p>
            <p style="margin: 5px 0;">Order Number: ${data._id}</p>
            <p style="margin: 5px 0;">Order Date: ${data.createdAt}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="${
              data.paymentDetails.paymentLink
            }" style="${buttonStyle}">Complete Your Order</a>
            <a href="#support" style="${secondaryButtonStyle}">Contact Support</a>
        </div>
        <p>If you have any questions or concerns, please don't hesitate to reach out to our customer support team.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,

    "under-pay": (data: IOrder) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Payment Discrepancy Notice</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Payment Discrepancy Notice</h2>
        <p>Dear ${data.customerDetails.name},</p>
        <p>We hope this email finds you well. We noticed a payment discrepancy for order #${
          data._id
        }.</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 5px 0;">Outstanding Amount: ${formatAmountToNaira(
              data.amountLeftToPay
            )}</p>
            <p style="margin: 5px 0;">Order Number: ${data._id}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="${
              data.paymentDetails.paymentLink
            }" style="${buttonStyle}">Complete Payment</a>
            <a href="#review-order" style="${secondaryButtonStyle}">Review Order Details</a>
            <a href="#support" style="${secondaryButtonStyle}">Contact Support</a>
        </div>
        <p>Please complete the remaining payment at your earliest convenience to avoid any delays in processing your order.</p>
        <p>If you believe this is an error or need any clarification, please contact our support team.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,

    "delivery-delay": (data: IOrder) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Delivery Delay Notification</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Delivery Delay Notification</h2>
        <p>Dear ${data.customerDetails.name},</p>
        <p>We are writing to inform you about a slight delay in the delivery of your order #${data._id}.</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 5px 0;">New Expected Delivery Date: ${data.shippingDetails.estimatedDeliveryDate}</p>
            <p style="margin: 5px 0;">Order Number: ${data._id}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="${data.shippingDetails.trackingNumber}" style="${buttonStyle}">Track Your Order</a>
            <a href="#update-preferences" style="${secondaryButtonStyle}">Update Delivery Preferences</a>
            <a href="#support" style="${secondaryButtonStyle}">Contact Support</a>
        </div>
        <p>We sincerely apologize for any inconvenience this may cause. We are working diligently to get your order to you as soon as possible.</p>
        <p>If you have any questions, please don't hesitate to contact our customer service team.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,

    "order-feedback": (data: IOrder) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Feedback Request</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">How Was Your Order?</h2>
        <p>Dear ${data.customerDetails.name},</p>
        <p>Thank you for shopping with us! We hope you're enjoying your recent purchase (Order #${data._id}).</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 5px 0;">Order Number: ${data._id}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="#reorder" style="${secondaryButtonStyle}">Order Again</a>
            <a href="#support" style="${secondaryButtonStyle}">Need Help?</a>
        </div>
        <p>Your feedback helps us improve our products and services for all customers.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,
  };

  return templates[templateId as keyof typeof templates](data);
};

interface EmailData {
  customerName: string;
  orderNumber: string;
  productName?: string;
  trackingNumber?: string;
  trackingLink?: string;
  expectedDeliveryDate?: string;
  estimatedShipDate?: string;
  cancellationReason?: string;
  orderTotal?: number;
}

export const getOrderStatusChangedEmailTemplate = (
  templateId: IOrderStatus,
  data: EmailData
): string => {
  const buttonStyle = `
  background-color: #3498db;
  color: white;
  padding: 12px 25px;
  text-decoration: none;
  border-radius: 5px;
  display: inline-block;
  margin: 10px 5px;
  font-weight: bold;
`;

  const secondaryButtonStyle = `
  background-color: #95a5a6;
  color: white;
  padding: 12px 25px;
  text-decoration: none;
  border-radius: 5px;
  display: inline-block;
  margin: 10px 5px;
  font-weight: bold;
`;

  const templates: Record<IOrderStatus, any> = {
    Pending: (data: EmailData) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Order Confirmed!</h2>
        <p>Dear ${data.customerName},</p>
        <p>Thank you for your order. We're excited to confirm that your order has been received and is being processed.</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 5px 0;"><strong>Order Details:</strong></p>
            <p style="margin: 5px 0;">Order Number: ${data.orderNumber}</p>
            <p style="margin: 5px 0;">Product: ${data.productName}</p>
            <p style="margin: 5px 0;">Total: $${data.orderTotal?.toFixed(2)}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="${
              data.trackingLink
            }" style="${buttonStyle}">View Order Details</a>
            <a href="#support" style="${secondaryButtonStyle}">Contact Support</a>
        </div>
        <p>We'll send you another email when your order ships.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,

    Processing: (data: EmailData) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Processing</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Your Order is Being Processed</h2>
        <p>Dear ${data.customerName},</p>
        <p>Great news! We're currently processing your order #${data.orderNumber}.</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 5px 0;">Estimated Ship Date: ${data.estimatedShipDate}</p>
            <p style="margin: 5px 0;">Product: ${data.productName}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="${data.trackingLink}" style="${buttonStyle}">Track Order</a>
            <a href="#support" style="${secondaryButtonStyle}">Need Help?</a>
        </div>
        <p>We'll notify you as soon as your order ships.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,

    Shipped: (data: EmailData) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Shipped</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Your Order is On Its Way!</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your order #${data.orderNumber} has been shipped and is on its way to you!</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 5px 0;">Tracking Number: ${data.trackingNumber}</p>
            <p style="margin: 5px 0;">Expected Delivery: ${data.expectedDeliveryDate}</p>
            <p style="margin: 5px 0;">Product: ${data.productName}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="${data.trackingLink}" style="${buttonStyle}">Track Package</a>
            <a href="#delivery-preferences" style="${secondaryButtonStyle}">Delivery Preferences</a>
        </div>
        <p>We'll send you another update when your package is delivered.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,

    Cancelled: (data: EmailData) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Cancelled</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Order Cancellation Confirmation</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your order #${data.orderNumber} has been cancelled.</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 5px 0;">Reason: ${
              data.cancellationReason || "Customer request"
            }</p>
            <p style="margin: 5px 0;">Product: ${data.productName}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="#shop" style="${buttonStyle}">Continue Shopping</a>
            <a href="#support" style="${secondaryButtonStyle}">Contact Support</a>
        </div>
        <p>If you didn't request this cancellation or have any questions, please contact our support team immediately.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,

    Completed: (data: EmailData) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Delivered - Share Your Feedback</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">How Did We Do?</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your order #${data.orderNumber} has been delivered! We hope you're enjoying your purchase.</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 5px 0;">Product: ${data.productName}</p>
            <p style="margin: 5px 0;">Delivery Date: ${data.expectedDeliveryDate}</p>
        </div>
        <div style="margin: 30px 0; text-align: center;">
            <a href="#review" style="${buttonStyle}">Write a Review</a>
            <a href="#shop" style="${secondaryButtonStyle}">Shop Again</a>
            <a href="#support" style="${secondaryButtonStyle}">Need Help?</a>
        </div>
        <p>Your feedback helps us improve and helps other customers make informed decisions.</p>
        <p>Best regards,<br>Your Store Team</p>
    </div>
</body>
</html>`,
    Refunded: (data: EmailData) => "",
  };

  return templates[templateId](data);
};

// Enum for email types
enum EmailType {
  ORDER_CANCELLATION_REQUEST = "ORDER_CANCELLATION_REQUEST",
  ORDER_CONFIRMATION_REQUEST = "ORDER_CONFIRMATION_REQUEST",
  ADDRESS_CHANGE_NOTIFICATION = "ADDRESS_CHANGE_NOTIFICATION",
}

// Interface for user information
interface UserInfo {
  name: string;
  email: string;
}

// Interface for address change
interface AddressChange {
  oldAddress: ICustomerAddress;
  newAddress: ICustomerAddress;
}

// Interface for email content
interface EmailContent {
  subject: string;
  body: string;
}

// Interface for color scheme
interface ColorScheme {
  primary: string;
  secondary: string;
}

function generateEmail(
  type: EmailType,
  userInfo: UserInfo,
  colors: ColorScheme,
  orderDetails?: IOrder,
  addressChange?: AddressChange,
  storeName?: string
): EmailContent {
  const styleTag = `
    <style>
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { -ms-interpolation-mode: bicubic; }
      img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      table { border-collapse: collapse !important; }
      body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
      div[style*="margin: 16px 0;"] { margin: 0 !important; }
      @media only screen and (max-width: 620px) {
        table.body h1 { font-size: 28px !important; margin-bottom: 10px !important; }
        table.body p,
        table.body ul,
        table.body ol,
        table.body td,
        table.body span { font-size: 16px !important; }
        table.body .container { padding: 0 !important; width: 100% !important; }
        table.body .main { border-left-width: 0 !important; border-radius: 0 !important; border-right-width: 0 !important; }
        table.body .btn table { width: 100% !important; }
        table.body .btn a { width: 100% !important; }
      }
    </style>
  `;

  const emailTemplate = (content: string) => `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <title>${type}</title>
        ${styleTag}
      </head>
      <body style="background-color: #f6f6f6; font-family: sans-serif; -webkit-font-smoothing: antialiased; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="body" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #f6f6f6; width: 100%;" width="100%" bgcolor="#f6f6f6">
          <tr>
            <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">&nbsp;</td>
            <td class="container" style="font-family: sans-serif; font-size: 14px; vertical-align: top; display: block; max-width: 580px; padding: 10px; width: 580px; margin: 0 auto;" width="580" valign="top">
              <div class="header" style="padding: 20px 0;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                  <tr>
                    <td class="align-center" style="font-family: sans-serif; font-size: 14px; vertical-align: top; text-align: center;" valign="top" align="center">
                      <a href="https://www.example.com" style="color: ${
                        colors.primary
                      }; font-size: 32px; font-weight: bold; text-decoration: none; text-transform: capitalize;">${storeName.toUpperCase()}</a>
                    </td>
                  </tr>
                </table>
              </div>
              <div class="content" style="box-sizing: border-box; display: block; margin: 0 auto; max-width: 580px; padding: 10px;">
                <table role="presentation" class="main" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background: #ffffff; border-radius: 3px; width: 100%;" width="100%">
                  <tr>
                    <td class="wrapper" style="font-family: sans-serif; font-size: 14px; vertical-align: top; box-sizing: border-box; padding: 20px;" valign="top">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                        <tr>
                          <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">
                            ${content}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
              <div class="footer" style="clear: both; margin-top: 10px; text-align: center; width: 100%;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
                  <tr>
                    <td class="content-block" style="font-family: sans-serif; vertical-align: top; padding-bottom: 10px; padding-top: 10px; color: #999999; font-size: 12px; text-align: center;" valign="top" align="center">
                      <span class="apple-link" style="color: #999999; font-size: 12px; text-align: center;">Your Company Inc, 3 Abbey Road, San Francisco CA 94102</span>
                      <br> Don't like these emails? <a href="http://i.imgur.com/CScmqnj.gif" style="text-decoration: underline; color: #999999; font-size: 12px; text-align: center;">Unsubscribe</a>.
                    </td>
                  </tr>
                  <tr>
                    <td class="content-block powered-by" style="font-family: sans-serif; vertical-align: top; padding-bottom: 10px; padding-top: 10px; color: #999999; font-size: 12px; text-align: center;" valign="top" align="center">
                      Powered by <a href="http://htmlemail.io" style="color: #999999; font-size: 12px; text-align: center; text-decoration: none;">HTMLemail</a>.
                    </td>
                  </tr>
                </table>
              </div>
            </td>
            <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">&nbsp;</td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatAddress = (address: ICustomerAddress) => {
    return `${address.country}, ${address.state}, ${address.city} ${address.addressLine1}, ${address.postalCode}`;
  };

  switch (type) {
    case EmailType.ORDER_CANCELLATION_REQUEST:
      if (!orderDetails)
        throw new Error("Order details are required for cancellation request");
      return {
        subject: `Request to Cancel Order #${orderDetails._id}`,
        body: emailTemplate(`
          <h2 style="color: ${
            colors.primary
          }; font-family: sans-serif; font-weight: 300; line-height: 1.4; margin: 0; margin-bottom: 30px;">Order Cancellation Request</h2>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">${
            orderDetails.customerDetails.name
          } has requested to cancel their order #${
          orderDetails._id
        } placed on ${new Date(
          orderDetails.createdAt
        ).toLocaleDateString()}.</p>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="btn btn-primary" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; box-sizing: border-box; width: 100%;" width="100%">
            <tbody>
              <tr>
                <td align="left" style="font-family: sans-serif; font-size: 14px; vertical-align: top; padding-bottom: 15px;" valign="top">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: auto;">
                    <tbody>
                      <tr>
                        <td style="font-family: sans-serif; font-size: 14px; vertical-align: top; border-radius: 5px; text-align: center; background-color: ${
                          colors.primary
                        };" valign="top" align="center" bgcolor="${
          colors.primary
        }">
                          <a href=${
                            process.env.COOKIE_DOMAIN +
                            PATHS.STORE_ORDERS +
                            orderDetails._id
                          } target="_blank" style="border: solid 1px ${
          colors.primary
        }; border-radius: 5px; box-sizing: border-box; cursor: pointer; display: inline-block; font-size: 14px; font-weight: bold; margin: 0; padding: 12px 25px; text-decoration: none; text-transform: capitalize; background-color: ${
          colors.primary
        }; border-color: ${colors.primary}; color: #ffffff;">View Order</a>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
          <h3 style="color: ${
            colors.secondary
          }; font-family: sans-serif; font-weight: 400; line-height: 1.4; margin: 0; margin-bottom: 30px;">Order Summary:</h3>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
            <strong>Order Status:</strong> ${orderDetails.orderStatus}<br>
            <strong>Total Amount:</strong> ${formatAmountToNaira(
              orderDetails.totalAmount
            )}<br>
            <strong>Payment Method:</strong> ${
              orderDetails.paymentDetails.paymentMethod
            }<br>
            <strong>Payment Status:</strong> ${
              orderDetails.paymentDetails.paymentStatus
            }<br>
            <strong>Delivery Type:</strong> ${orderDetails.deliveryType}
          </p>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">We are processing your cancellation request and will get back to you shortly with confirmation. If you have any questions or concerns, please don't hesitate to contact our customer support team.</p>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Thank you for your patience and understanding.</p>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Best regards,<br>Customer Support Team</p>
        `),
      };

    case EmailType.ORDER_CONFIRMATION_REQUEST:
      if (!orderDetails)
        throw new Error("Order details are required for confirmation request");
      return {
        subject: `New Order Received: #${orderDetails._id} - Action Required`,
        body: emailTemplate(`
          <h2 style="color: ${
            colors.primary
          }; font-family: sans-serif; font-weight: 300; line-height: 1.4; margin: 0; margin-bottom: 30px;">New Order Received - Action Required</h2>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Dear Admin,</p>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">A new order #${
            orderDetails._id
          } has been received on ${new Date(
          orderDetails.createdAt
        ).toLocaleDateString()}. Please review the order details and take appropriate action.</p>
          <h3 style="color: ${
            colors.secondary
          }; font-family: sans-serif; font-weight: 400; line-height: 1.4; margin: 0; margin-bottom: 15px;">Order Summary:</h3>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
            <strong>Customer Name:</strong> ${
              orderDetails.customerDetails.name
            } <br>
            <strong>Customer Email:</strong> ${
              orderDetails.customerDetails.email
            }<br>
            <strong>Total Amount:</strong> ${formatCurrency(
              orderDetails.totalAmount
            )}<br>
            <strong>Payment Method:</strong> ${
              orderDetails.paymentDetails.paymentMethod
            }<br>
            <strong>Payment Status:</strong> ${
              orderDetails.paymentDetails.paymentStatus
            }<br>
            <strong>Delivery Type:</strong> ${orderDetails.deliveryType}
          </p>
          <h3 style="color: ${
            colors.secondary
          }; font-family: sans-serif; font-weight: 400; line-height: 1.4; margin: 0; margin-bottom: 15px;">Products:</h3>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
            <thead>
              <tr>
                <th style="font-family: sans-serif; font-size: 14px; padding-bottom: 8px; padding-top: 8px; padding-right: 8px; padding-left: 8px;">Product</th>
                <th style="font-family: sans-serif; font-size: 14px; padding-bottom: 8px; padding-top: 8px; padding-right: 8px; padding-left: 8px;">Quantity</th>
                <th style="font-family: sans-serif; font-size: 14px; padding-bottom: 8px; padding-top: 8px; padding-right: 8px; padding-left: 8px;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${orderDetails.products
                .map(
                  (product) => `
                <tr>
                  <td style="font-family: sans-serif; font-size: 14px; padding-bottom: 8px; padding-top: 8px; padding-right: 8px; padding-left: 8px;">${
                    product.productName
                  }</td>
                  <td style="font-family: sans-serif; font-size: 14px; padding-bottom: 8px; padding-top: 8px; padding-right: 8px; padding-left: 8px;">${
                    product.quantity
                  }</td>
                  <td style="font-family: sans-serif; font-size: 14px; padding-bottom: 8px; padding-top: 8px; padding-right: 8px; padding-left: 8px;">${formatCurrency(
                    product.discount || product.price.default
                  )}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
          <h3 style="color: ${
            colors.secondary
          }; font-family: sans-serif; font-weight: 400; line-height: 1.4; margin: 0; margin-bottom: 15px; margin-top: 30px;">Shipping Address:</h3>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
            ${orderDetails.customerDetails.shippingAddress.country}<br>
            ${orderDetails.customerDetails.shippingAddress.state}, ${
          orderDetails.customerDetails.shippingAddress.city
        } ${orderDetails.customerDetails.shippingAddress.postalCode}<br>
            ${orderDetails.customerDetails.shippingAddress.addressLine1}
          </p>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="btn btn-primary" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; box-sizing: border-box; width: 100%;" width="100%">
            <tbody>
              <tr>
                <td align="left" style="font-family: sans-serif; font-size: 14px; vertical-align: top; padding-bottom: 15px;" valign="top">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: auto;">
                    <tbody>
                      <tr>
                        <td style="font-family: sans-serif; font-size: 14px; vertical-align: top; border-radius: 5px; text-align: center; background-color: ${
                          colors.primary
                        };" valign="top" align="center" bgcolor="${
          colors.primary
        }">
                          <a href="#" target="_blank" style="border: solid 1px ${
                            colors.primary
                          }; border-radius: 5px; box-sizing: border-box; cursor: pointer; display: inline-block; font-size: 14px; font-weight: bold; margin: 0; padding: 12px 25px; text-decoration: none; text-transform: capitalize; background-color: ${
          colors.primary
        }; border-color: ${colors.primary}; color: #ffffff;">Process Order</a>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Please process this order as soon as possible. If you have any questions or concerns, please contact the customer or the appropriate department.</p>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Thank you for your prompt attention to this matter.</p>
        `),
      };

    case EmailType.ADDRESS_CHANGE_NOTIFICATION:
      if (!addressChange)
        throw new Error("Address change details are required");
      return {
        subject: "Notification of Address Change",
        body: emailTemplate(`
          <h2 style="color: ${
            colors.primary
          }; font-family: sans-serif; font-weight: 300; line-height: 1.4; margin: 0; margin-bottom: 30px;">Address Change Notification</h2>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Dear ${
            userInfo.name
          },</p>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">We are writing to confirm that we have received and processed your request to change your address. Your address has been updated in our system as follows:</p>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%;" width="100%">
            <tr>
              <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">
                <h3 style="color: ${
                  colors.secondary
                }; font-family: sans-serif; font-weight: 400; line-height: 1.4; margin: 0; margin-bottom: 15px;">Old Address:</h3>
                <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">${formatAddress(
                  addressChange.oldAddress
                )}</p>
              </td>
            </tr>
            <tr>
              <td style="font-family: sans-serif; font-size: 14px; vertical-align: top;" valign="top">
                <h3 style="color: ${
                  colors.secondary
                }; font-family: sans-serif; font-weight: 400; line-height: 1.4; margin: 0; margin-bottom: 15px;">New Address:</h3>
                <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">${formatAddress(
                  addressChange.newAddress
                )}</p>
              </td>
            </tr>
          </table>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">If this change is correct, no further action is needed. If you did not request this change or if there are any errors, please contact our customer support team immediately.</p>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Thank you for keeping your information up to date.</p>
          <p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Best regards,<br>Customer Support Team</p>
        `),
      };

    default:
      throw new Error("Invalid email type");
  }
}

export const balanceUpdatedEmail = (username: string, newBalance: number) => {
  return `<html>
          <head>
            <style>
              .email-container {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
              }
              .button {
                background-color: #007bff;
                color: white;
                padding: 10px 20px;
                text-decoration: none;
                border-radius: 5px;
                display: inline-block;
              }
              .button:hover {
                background-color: #0056b3;
              }
            </style>
          </head>
          <body>
            <div class="email-container">
              <h1>Balance Updated</h1>
              <p>Dear ${username},</p>
              <p>We want to inform you that your account balance has been successfully updated on ${new Date().toLocaleString()}.</p>
              <p>Your new balance is: <strong>${newBalance}</strong></p>
              <p>If you have any questions or concerns, please don’t hesitate to contact our support team.</p>
              <p><a href=${
                process.env.CLIENT_DOMAIN + PATHS.DASHBOARD
              } class="button">View Dashboard</a></p>
              <p>Thank you for choosing storeBuild.</p>
              <p>Warm regards,<br>The storeBuild Team</p>
            </div>
          </body>
        </html>`;
};

export function generateWelcomeEmail({
  userName,
  platformName = "storeBuild",
  themeColor = "#6A0DAD",
}: {
  userName: string;
  platformName?: string;
  themeColor?: string;
}) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f9;
        margin: 0;
        padding: 0;
      }
      .email-container {
        max-width: 600px;
        margin: auto;
        background: #ffffff;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      }
      .header {
        background-color: ${themeColor};
        color: #ffffff;
        text-align: center;
        padding: 20px;
      }
      .header h1 {
        margin: 0;
        font-size: 24px;
      }
      .content {
        padding: 20px;
        color: #333333;
      }
      .content h2 {
        font-size: 20px;
        margin-bottom: 10px;
      }
      .content p {
        font-size: 16px;
        line-height: 1.5;
      }
      .cta {
        text-align: center;
        margin: 20px 0;
      }
      .cta a {
        background-color: ${themeColor};
        color: #ffffff;
        padding: 10px 20px;
        text-decoration: none;
        border-radius: 5px;
        font-size: 16px;
      }
      .footer {
        background-color: #f4f4f9;
        text-align: center;
        padding: 10px;
        font-size: 14px;
        color: #777777;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1>Welcome to ${platformName}!</h1>
      </div>
      <div class="content">
        <h2>Hello, ${userName}!</h2>
        <p>
          Thank you for signing up for <strong>${platformName}</strong>. We're excited to have you on board! Explore the tools and features we offer to make your ecommerce journey a success.
        </p>
        <p>
          If you have any questions, feel free to reach out to our support team. We're here to help!
        </p>
      </div>
      <div class="cta">
        <a href="#">Start Building Your Store</a>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} ${platformName}. All rights reserved.</p>
      </div>
    </div>
  </body>
  </html>
  `;
}

function generateOrderEmailWithPaymentLink({
  items,
  totalAmount,
  paymentLink,
  viewOrderLink,
  userName,
  orderNumber,
}: {
  items: IOrderProduct[];
  totalAmount: number;
  paymentLink: string;
  viewOrderLink: string;
  userName: string;
  orderNumber: string;
}) {
  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td>${item.productName}</td>
          <td>${item.quantity}</td>
          <td>₦${item.discount || item.price.default}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                font-family: 'Space Grotesk', Arial, sans-serif;
                background-color: #f5f5f5;
                margin: 0;
                padding: 0;
            }
            .email-container {
                max-width: 600px;
                margin: 20px auto;
                background-color: #ffffff;
                border-radius: 10px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }
            .header {
                background-color: #6a0dad;
                color: #ffffff;
                text-align: center;
                padding: 20px;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
            }
            .content {
                padding: 20px;
                color: #333333;
                line-height: 1.6;
            }
            .content h2 {
                color: #6a0dad;
            }
            .order-items {
                margin-top: 20px;
                border-collapse: collapse;
                width: 100%;
            }
            .order-items th, .order-items td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
            }
            .order-items th {
                background-color: #f3e5f5;
                color: #6a0dad;
            }
            .order-items td {
                color: #333333;
            }
            .button-container {
                text-align: center;
                margin-top: 20px;
            }
            .button {
                display: inline-block;
                margin: 10px;
                padding: 10px 20px;
                background-color: #6a0dad;
                color: #ffffff;
                text-decoration: none;
                font-weight: bold;
                border-radius: 5px;
            }
            .button:hover {
                background-color: #540c9e;
            }
            .footer {
                background-color: #6a0dad;
                color: #ffffff;
                text-align: center;
                padding: 10px;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <h1>Order Received!</h1>
            </div>
            
            <!-- Content -->
            <div class="content">
                <h2>Hello ${userName},</h2>
                <p>Thank you for placing your order with us! We're excited to confirm that we've received it.</p>
                <p>Your order number is: <strong>#${orderNumber}</strong></p>
                
                <!-- Order Items -->
                <h3>Order Items:</h3>
                <table class="order-items">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Quantity</th>
                            <th>Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                        <tr>
                            <td><strong>Total</strong></td>
                            <td></td>
                            <td><strong>₦${totalAmount}</strong></td>
                        </tr>
                    </tbody>
                </table>

                <!-- Buttons -->
                <div class="button-container">
                    <a href="${paymentLink}" class="button">Make Payment</a>
                    <a href="${viewOrderLink}" class="button">View Order</a>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p>Thank you for shopping with us! If you have any questions, feel free to contact us.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

function generateManualPaymentEmail({
  items,
  totalAmount,
  paymentDetails,
  viewOrderLink,
  userName,
  orderNumber,
}: {
  items: IOrderProduct[];
  totalAmount: number;
  paymentDetails: IPaymentDetails;
  viewOrderLink: string;
  userName: string;
  orderNumber: string;
}) {
  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td>${item.productName}</td>
          <td>${item.quantity}</td>
          <td>₦${item.price}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                font-family: 'Space Grotesk', Arial, sans-serif;
                background-color: #f5f5f5;
                margin: 0;
                padding: 0;
            }
            .email-container {
                max-width: 600px;
                margin: 20px auto;
                background-color: #ffffff;
                border-radius: 10px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }
            .header {
                background-color: #6a0dad;
                color: #ffffff;
                text-align: center;
                padding: 20px;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
            }
            .content {
                padding: 20px;
                color: #333333;
                line-height: 1.6;
            }
            .content h2 {
                color: #6a0dad;
            }
            .order-items {
                margin-top: 20px;
                border-collapse: collapse;
                width: 100%;
            }
            .order-items th, .order-items td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
            }
            .order-items th {
                background-color: #f3e5f5;
                color: #6a0dad;
            }
            .order-items td {
                color: #333333;
            }
            .button-container {
                text-align: center;
                margin-top: 20px;
            }
            .button {
                display: inline-block;
                margin: 10px;
                padding: 10px 20px;
                background-color: #6a0dad;
                color: #ffffff;
                text-decoration: none;
                font-weight: bold;
                border-radius: 5px;
            }
            .button:hover {
                background-color: #540c9e;
            }
            .footer {
                background-color: #6a0dad;
                color: #ffffff;
                text-align: center;
                padding: 10px;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <h1>Order Received!</h1>
            </div>
            
            <!-- Content -->
            <div class="content">
                <h2>Hello ${userName},</h2>
                <p>Thank you for placing your order with us! We're excited to confirm that we've received it.</p>
                <p>Your order number is: <strong>#${orderNumber}</strong></p>
                
                <!-- Order Items -->
                <h3>Order Items:</h3>
                <table class="order-items">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Quantity</th>
                            <th>Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                        <tr>
                            <td><strong>Total</strong></td>
                            <td></td>
                            <td><strong>₦${totalAmount}</strong></td>
                        </tr>
                    </tbody>
                </table>

                <!-- Payment Details -->
                <h3>Payment Details:</h3>
                <p>Please make a manual payment using the following details:</p>
                <ul>
                    <li><strong>Account Name:</strong> ${paymentDetails.accountName}</li>
                    <li><strong>Account Number:</strong> ${paymentDetails.accountNumber}</li>
                    <li><strong>Bank Name:</strong> ${paymentDetails.bankName}</li>
                </ul>

                <!-- Buttons -->
                <div class="button-container">
                    <a href="${viewOrderLink}" class="button">View Order</a>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p>Thank you for shopping with us! If you have any questions, feel free to contact us.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

function generateAdminOrderNotificationEmail({
  adminName,
  customerName,
  orderNumber,
  totalAmount,
  items,
  viewOrderLink,
}: {
  adminName: string;
  customerName: string;
  orderNumber: string;
  totalAmount: number;
  items: IOrderProduct[];
  viewOrderLink: string;
}) {
  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 10px;">${item.productName}</td>
          <td style="padding: 8px 10px; text-align: right;">${
            item.quantity
          }</td>
          <td style="padding: 8px 10px; text-align: right;">₦${item.price.toLocaleString()}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #4a148c; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">New Order Received</h1>
      </div>
      <div style="padding: 20px;">
        <p>Hi ${adminName},</p>
        <p>You have received a new order from <strong>${customerName}</strong>.</p>
        <p><strong>Order Number:</strong> #${orderNumber}</p>
        <p><strong>Total Amount:</strong> ₦${totalAmount.toLocaleString()}</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #f4f4f4; text-align: left;">
              <th style="padding: 8px 10px;">Item</th>
              <th style="padding: 8px 10px; text-align: right;">Quantity</th>
              <th style="padding: 8px 10px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <p style="margin-top: 20px;">Click the button below to view the full order details:</p>
        <a href="${viewOrderLink}" style="display: inline-block; background-color: #4a148c; color: white; text-decoration: none; padding: 10px 20px; border-radius: 4px; margin-top: 10px;">
          View Order
        </a>
      </div>
      <div style="background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 14px; color: #666;">
        This is an automated email. Please do not reply.
      </div>
    </div>
  `;
}

export {
  EmailType,
  generateEmail,
  generateOrderEmailWithPaymentLink,
  generateManualPaymentEmail,
  generateAdminOrderNotificationEmail,
};
