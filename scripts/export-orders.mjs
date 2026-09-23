import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const APP_STATE_ID = "singleton";
const APP_STATE_TABLE = "app_state";

function loadDotEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function getArgument(name) {
  const prefix = `${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length) || null;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString();
}

async function promptCredentials() {
  const readline = createInterface({ input, output });
  const email = process.env.SUPABASE_EMAIL || (await readline.question("Supabase email: "));
  let password = process.env.SUPABASE_PASSWORD;
  if (!password) {
    output.write("Supabase password: ");
    input.setRawMode?.(true);
    password = await new Promise((resolve) => {
      let value = "";
      const onData = (chunk) => {
        const text = chunk.toString();
        if (text === "\u0003") process.exit(130);
        if (text === "\r" || text === "\n") {
          input.setRawMode?.(false);
          input.off("data", onData);
          output.write("\n");
          resolve(value);
        } else if (text === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += text;
        }
      };
      input.on("data", onData);
    });
  }
  readline.close();
  return { email: email.trim(), password };
}

async function supabaseRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = body;
  }
  if (!response.ok) {
    const message = typeof data === "object" && data !== null ? data.msg || data.message || data.error_description : data;
    throw new Error(`${response.status} ${message || response.statusText}`);
  }
  return data;
}

async function main() {
  loadDotEnv();
  const baseUrl = (process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!baseUrl || !publishableKey) {
    throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in .env or the environment.");
  }

  const { email, password } = await promptCredentials();
  if (!email || !password) throw new Error("A Supabase email and password are required.");

  const session = await supabaseRequest(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const rows = await supabaseRequest(
    `${baseUrl}/rest/v1/${APP_STATE_TABLE}?id=eq.${APP_STATE_ID}&select=data`,
    { headers: { apikey: publishableKey, Authorization: `Bearer ${session.access_token}` } },
  );
  const store = rows[0]?.data;
  if (!store || !Array.isArray(store.orders)) throw new Error("The Supabase app state has no orders array.");

  const header = [
    "order_id", "order_number", "order_date", "customer_name", "customer_phone",
    "perfume_brand", "perfume_name", "size_ml", "quantity_ml", "unit_price",
  ];
  const lines = [header.join(",")];
  const orders = [...store.orders].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const order of orders) {
    const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [null];
    for (const item of items) {
      lines.push([
        order.id, order.seq ?? "", formatDate(order.date), order.customerName ?? "", order.customerPhone ?? "",
        item?.brand ?? "", item?.perfumeName ?? "", item?.size ?? "", item?.mlSold ?? "", item?.unitPrice ?? "",
      ].map(csvCell).join(","));
    }
  }

  const outputPath = getArgument("--output") || `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Exported ${orders.length} order(s) to ${outputPath}`);
  console.log(`Created ${lines.length - 1} perfume line(s).`);
}

main().catch((error) => {
  console.error(`Order export failed: ${error.message}`);
  process.exitCode = 1;
});