import type { BoxType, Order } from "../types";
import { orderChargedTotal } from "./order";

const TAX_PERCENTAGE = 18;
const CATEGORY = "Beauty";
const PRODUCT_NAME = "Perfumes";
const HSN_CODE = "3303";
const PICKUP_LOCATION = "Scentverse pickup";

/** Exact column order required by the courier's Bulk_forward_shipment template. */
const HEADER = [
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

/** Which required courier fields (city / pincode / phone) are blank on this order. */
export function missingShippingFields(order: Order): string[] {
  const missing: string[] = [];
  if ((order.customerCity ?? "").trim() === "") missing.push("city");
  if ((order.customerPincode ?? "").trim() === "") missing.push("pincode");
  if ((order.customerPhone ?? "").trim() === "") missing.push("phone");
  return missing;
}

function esc(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build the full CSV text (header + one row per order) for the selected orders. */
export function buildShipmentCsv(orders: Order[], boxes: BoxType[]): string {
  const rows = orders.map((order) => {
    const box =
      boxes.find((b) => b.id === order.boxId) ?? boxes[0] ?? null;
    const num = shipmentNumber(order);
    const finalAmount = orderChargedTotal(order);
    const payment = order.paymentMode ?? "Prepaid";
    const cod = payment === "COD" ? finalAmount : 0;
    const weight = order.weightG ?? box?.weightG ?? "";

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
      PRODUCT_NAME, // product_name
      order.items.length, // quantity (decant count)
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

  return [HEADER.join(","), ...rows].join("\n");
}
