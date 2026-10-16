import type { BoxType, Order } from "../types";
import { orderChargedTotal } from "./order";

export type ShipmentCsvFormat = "bulk-forward-shipment" | "forward-bulk-order";

const TAX_PERCENTAGE = 18;
const CATEGORY = "Beauty";
const HSN_CODE = "3303";
const PICKUP_LOCATION = "Scentverse pickup";
const SHIPMOZO_PICKUP_LOCATION_ID = "153711";

/** Exact column order required by the courier's Bulk_forward_shipment template. */
const BULK_FORWARD_SHIPMENT_HEADER = [
  "order_number",
  "customer_name",
  "city",
  "state",
  "country",
  "customer_address",
  "pincode",
  "customer_number",
  "customer_alternate_number",
  "customer_email",
  "weight",
  "length",
  "height",
  "width",
  "invoice_number",
  "invoice_date",
  "ewaybill_number",
  "total_amount",
  "tax_percentage",
  "cod_amount",
  "payment_mode",
  "category_of_goods",
  "product_name",
  "quantity",
  "hsn_code",
  "pickup_location_name",
  "return_location_name",
  "seller_name",
  "seller_gst_tin",
  "service",
  "utm_campaign",
  "utm_source",
];

/** Exact column order supplied for the Forward Bulk Order template. */
const FORWARD_BULK_ORDER_HEADER = [
  "*Reference Id",
  "Order Date as dd/mm/yyyy (Default Today Date)",
  "company Name",
  "*Payment Method(COD/Prepaid)",
  "*Customer Name",
  "Email",
  "*Customer Mobile",
  "Customer Alternate Mobile",
  "*Shipping Address Line 1",
  "Shipping Address Line 2",
  "*Shipping Address Postcode",
  "Billing Address Line 1",
  "Billing Address Line 2",
  "Billing Name",
  "Billing Email",
  "Billing Phone Number",
  "Billing Alt Phone Number",
  "Billing Address Postcode",
  "*Product Name",
  "Sku Number",
  "*Product Quantity",
  "*Unit Price per item",
  "Hsn Code",
  "Discount",
  "Product category",
  "*Length",
  "*Breadth",
  "*Height",
  "*Weight Of Shipment(kg)",
  "E-way bill",
  "GST Number",
  "Added by User Email",
  "COD Amount",
  "Pickup Location Id",
];

function pad(n: number, width: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(width, "0");
}

/** YYMMDD + 3-digit running order # + 2-digit decant count, e.g. 26062201204. */
export function shipmentNumber(order: Order): string {
  const d = new Date(order.date);
  const yy = pad(d.getFullYear() % 100, 2);
  const mm = pad(d.getMonth() + 1, 2);
  const dd = pad(d.getDate(), 2);
  const seq = pad(order.seq ?? 0, 3);
  const decants = pad(order.items.length, 2);
  return `${yy}${mm}${dd}${seq}${decants}`;
}

function invoiceDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Formats items grouped by size: e.g. "Scentverse decant 3ml (3)\nScentverse decant 5ml (5)" */
function formatDecantBreakdown(items: Order["items"]): string {
  if (!items || items.length === 0) return "Perfumes";

  const sizeCounts = new Map<number, number>();
  for (const item of items) {
    const size = item.size ?? item.mlSold;
    sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
  }

  // Sort ascending by decant volume (e.g., 3ml, 5ml, 30ml)
  return Array.from(sizeCounts.entries())
    .sort(([sizeA], [sizeB]) => sizeA - sizeB)
    .map(([size, count]) => `Scentverse decant ${size}ml (${count})`)
    .join(", ");
}

/** Required shipping fields that are absent for the selected courier template. */
export function missingShippingFields(
  order: Order,
  format: ShipmentCsvFormat = "bulk-forward-shipment",
  boxes: BoxType[] = [],
): string[] {
  const missing: string[] = [];
  if (format === "bulk-forward-shipment") {
    if ((order.customerCity ?? "").trim() === "") missing.push("city");
    if ((order.customerPincode ?? "").trim() === "") missing.push("pincode");
    if ((order.customerPhone ?? "").trim() === "") missing.push("phone");
    return missing;
  }

  const box = boxes.find((candidate) => candidate.id === order.boxId) ?? boxes[0];
  if (order.customerName.trim() === "") missing.push("customer name");
  if ((order.customerPhone ?? "").trim() === "") missing.push("mobile");
  if (order.customerAddress.trim() === "") missing.push("shipping address");
  if ((order.customerPincode ?? "").trim() === "") missing.push("postcode");
  if (order.items.length === 0) missing.push("product");
  if (box === undefined || box.lengthCm <= 0) missing.push("length");
  if (box === undefined || box.widthCm <= 0) missing.push("breadth");
  if (box === undefined || box.heightCm <= 0) missing.push("height");
  if ((order.weightG ?? box?.weightG ?? 0) <= 0) missing.push("shipment weight");
  return missing;
}

function esc(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build the existing Bulk_forward_shipment CSV, preserving its original mapping. */
function buildBulkForwardShipmentCsv(orders: Order[], boxes: BoxType[]): string {
  const rows = orders.map((order) => {
    const box =
      boxes.find((b) => b.id === order.boxId) ?? boxes[0] ?? null;
    const num = shipmentNumber(order);
    const finalAmount = orderChargedTotal(order);
    const payment = order.paymentMode ?? "Prepaid";
    const cod = payment === "COD" ? finalAmount : 0;
    const weight = order.weightG ?? box?.weightG ?? "";

    const productName = formatDecantBreakdown(order.items);
    const totalQuantity = order.items.length;

    const cells = [
      num, // order_number
      order.customerName ?? "", // customer_name
      order.customerCity ?? "", // city
      "", // state (left blank per spec)
      "", // country
      order.customerAddress ?? "", // customer_address
      order.customerPincode ?? "", // pincode
      order.customerPhone ?? "", // customer_number
      order.customerAltPhone ?? "", // customer_alternate_number
      order.customerEmail ?? "", // customer_email
      weight, // weight
      box?.lengthCm ?? "", // length
      box?.heightCm ?? "", // height
      box?.widthCm ?? "", // width
      num, // invoice_number (same as order_number)
      invoiceDate(order.date), // invoice_date
      "", // ewaybill_number
      finalAmount, // total_amount
      TAX_PERCENTAGE, // tax_percentage
      cod, // cod_amount
      payment, // payment_mode
      CATEGORY, // category_of_goods
      productName, // product_name (e.g. "Scentverse decant 3ml (3)\n...")
      totalQuantity, // quantity (total sum of all decants)
      HSN_CODE, // hsn_code
      PICKUP_LOCATION, // pickup_location_name
      PICKUP_LOCATION, // return_location_name
      "", // seller_name
      "", // seller_gst_tin
      "", // service
      "", // utm_campaign
      "", // utm_source
    ];
    return cells.map(esc).join(",");
  });

  return [BULK_FORWARD_SHIPMENT_HEADER.join(","), ...rows].join("\n");
}

/** Build one bundled product row per order for the Forward Bulk Order template. */
function buildForwardBulkOrderCsv(orders: Order[], boxes: BoxType[]): string {
  const rows = orders.map((order) => {
    const box = boxes.find((candidate) => candidate.id === order.boxId) ?? boxes[0] ?? null;
    const num = shipmentNumber(order);
    const finalAmount = orderChargedTotal(order);
    const payment = order.paymentMode ?? "Prepaid";
    const weightG = order.weightG ?? box?.weightG ?? "";
    const weightKg = typeof weightG === "number" ? weightG / 1000 : "";

    const cells = [
      num, // *Reference Id
      "", // Order Date (left blank per export preference)
      "Decantverse", // company Name
      payment, // *Payment Method
      order.customerName ?? "", // *Customer Name
      order.customerEmail ?? "", // Email
      order.customerPhone ?? "", // *Customer Mobile
      order.customerAltPhone ?? "", // Customer Alternate Mobile
      order.customerAddress ?? "", // *Shipping Address Line 1
      "", // Shipping Address Line 2
      order.customerPincode ?? "", // *Shipping Address Postcode
      order.customerAddress ?? "", // Billing Address Line 1 (same as shipping)
      "", // Billing Address Line 2
      order.customerName ?? "", // Billing Name
      order.customerEmail ?? "", // Billing Email
      order.customerPhone ?? "", // Billing Phone Number
      order.customerAltPhone ?? "", // Billing Alt Phone Number
      order.customerPincode ?? "", // Billing Address Postcode
      formatDecantBreakdown(order.items), // *Product Name
      "", // Sku Number
      1, // *Product Quantity (one mixed decant bundle per shipment)
      finalAmount, // *Unit Price per item (final charged amount for the bundle)
      HSN_CODE, // Hsn Code
      "", // Discount (already reflected in the final charged amount)
      CATEGORY, // Product category
      box?.lengthCm ?? "", // *Length
      box?.widthCm ?? "", // *Breadth
      box?.heightCm ?? "", // *Height
      weightKg, // *Weight Of Shipment (kg; app stores grams)
      "", // E-way bill
      "", // GST Number
      "", // Added by User Email
      payment === "COD" ? finalAmount : "", // COD Amount (blank for prepaid)
      SHIPMOZO_PICKUP_LOCATION_ID, // Pickup Location Id
    ];
    return cells.map(esc).join(",");
  });

  return [FORWARD_BULK_ORDER_HEADER.join(","), ...rows].join("\n");
}

/** Select a courier-specific CSV schema for the selected orders. */
export function buildShipmentCsv(
  orders: Order[],
  boxes: BoxType[],
  format: ShipmentCsvFormat,
): string {
  switch (format) {
    case "bulk-forward-shipment":
      return buildBulkForwardShipmentCsv(orders, boxes);
    case "forward-bulk-order":
      return buildForwardBulkOrderCsv(orders, boxes);
  }
}