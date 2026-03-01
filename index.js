import express from "express";
import crypto from "crypto";
import { Resend } from "resend";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import cors from "cors";
import Razorpay from "razorpay";

const app = express();

// ======================
// CORS
// ======================
app.use(cors());

// ======================
// JSON parser ONLY for non-webhook routes
// ======================
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// ======================
// INIT SERVICES
// ======================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const resend = new Resend(process.env.RESEND_API_KEY);

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// ======================
// SUBJECT → PDF MAP
// ======================
const pdfMap = {
  business_economics: "business-economics-lastminutepdf-premium-rapid-revision-guide.pdf",
  business_mathematics: "business-mathematics-lastminutepdf-premium-rapid-revision-guide.pdf",
  business_statistics: "business-statistics-premium-rapid-revision-guide.pdf",
  cost_accounting: "cost-accounting-lastminutepdf-premium-rapid-revision-guide.pdf",
  human_resource_management: "hrm-lastminutepdf-premium-rapid-revision-guide.pdf",
  marketing_management: "marketing-management-lastminutepdf-premium-rapid-revision-guide.pdf",
  principles_of_management: "principles-of-management-lastminutepdf-premium-rapid-revision-guide.pdf",
  financial_accounting: "financial-accounting-premium-rapid-revision-guide.pdf",
};

// ======================
// CREATE PAYMENT LINK
// ======================
app.post("/create-payment-link", async (req, res) => {
  try {
    const { subject, email } = req.body;

    if (!pdfMap[subject]) {
      return res.status(400).json({ error: "Invalid subject" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const paymentLink = await razorpay.paymentLink.create({
      amount: 2900, // ₹29 in paise
      currency: "INR",
      description: `LastMinutePDF - ${subject}`,
      customer: { email },
      notify: { email: true },
      notes: { subject, email }
    });

    res.json({ url: paymentLink.short_url });

  } catch (error) {
    console.error("Payment link error:", error);
    res.status(500).json({ error: "Failed to create payment link" });
  }
});

// ======================
// WEBHOOK (RAW BODY)
// ======================
app.post(
  "/webhook",
  bodyParser.raw({ type: "*/*" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-razorpay-signature"];

      const expectedSignature = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(req.body) // RAW BUFFER
        .digest("hex");

      if (signature !== expectedSignature) {
        console.log("Invalid signature");
        return res.status(400).send("Invalid signature");
      }

      const payload = JSON.parse(req.body.toString());

      if (payload.event === "payment.captured") {
        const payment = payload.payload.payment.entity;

        const email =
          payment.email ||
          payment.customer_details?.email ||
          null;

        console.log("Extracted email:", email);

        if (!email) {
          return res.status(400).send("Email not found");
        }

        const subjectKey = payment.notes?.subject;
        const pdfFile = pdfMap[subjectKey];

        if (!pdfFile) {
          return res.status(400).send("Invalid subject");
        }

        const filePath = path.join("./pdfs", pdfFile);
        const fileBuffer = fs.readFileSync(filePath);

        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: email,
          subject: "Your LastMinutePDF Notes",
          text: "Thank you for your purchase. Please find your notes attached.",
          attachments: [
            {
              filename: pdfFile,
              content: fileBuffer,
            },
          ],
        });

        console.log("Email sent to:", email);
      }

      res.status(200).send("OK");

    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).send("Error");
    }
  }
);

// ======================
// HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

// ======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
