import express from "express";
import crypto from "crypto";
import { Resend } from "resend";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";

const app = express();

// Razorpay sends raw body for signature verification
app.use(bodyParser.raw({ type: "*/*" }));

const resend = new Resend(process.env.RESEND_API_KEY);

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// Map subject to PDF file
const pdfMap = {
  financial_accounting: "Financial_Accounting_Premium_LastMinutePDF.pdf",
  business_mathematics: "Business_Mathematics.pdf",
  business_statistics: "Business_Statistics.pdf",
  principles_of_management: "Principles_of_Management.pdf",
  business_economics: "Business_Economics.pdf",
  marketing_management: "Marketing_Management.pdf",
  human_resource_management: "Human_Resource_Management.pdf",
  cost_accounting: "Cost_Accounting.pdf"
};

app.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];

    const expectedSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(req.body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString());

    if (payload.event === "payment.captured") {
      const payment = payload.payload.payment.entity;

      const email = payment.email;
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
            content: fileBuffer
          }
        ]
      });

      console.log("Email sent to:", email);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error");
  }
});

app.get("/", (req, res) => {
  res.send("Backend Running");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
