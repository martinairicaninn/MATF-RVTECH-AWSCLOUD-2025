const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const OCM_API_KEY = process.env.OCM_API_KEY;
const OCM_URL = process.env.OCM_URL || "https://api.openchargemap.io/v3/poi";
const TABLE_NAME = process.env.CHARGERS_TABLE || "Chargers";

const BATCH_SIZE = 25;

const DYNAMODB_ENDPOINT = process.env.LOCALSTACK_HOSTNAME
  ? `http://${process.env.LOCALSTACK_HOSTNAME}:4566`
  : "http://localhost:4566";

const client = new DynamoDBClient({
  endpoint: DYNAMODB_ENDPOINT,
  region: "us-east-1",
});
const docClient = DynamoDBDocumentClient.from(client);

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN ||
  "http://punjaci-website.s3-website.localhost.localstack.cloud:4566";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function normalizeTown(town, postcode) {
  const t = (town || "").trim();

  
  if (["Belgrad", "Belgrade", "Beograd"].includes(t)) return "Beograd";
  if (postcode && String(postcode).startsWith("11")) return "Beograd";

  
  if (["Nis", "Niš"].includes(t)) return "Niš";

  
  return t || "Unknown";
}


async function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

exports.handler = async (event) => {
 
  if (event?.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    if (!OCM_API_KEY || OCM_API_KEY === "GET_YOUR_OWN_KEY") {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "OCM_API_KEY nije podešen (ili je placeholder). Proveri serverless.yml.",
        }),
      };
    }

    if (!TABLE_NAME) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "CHARGERS_TABLE nije podešen." }),
      };
    }

    const MAX_RESULTS = 1000;
    const params = new URLSearchParams({
      key: OCM_API_KEY,
      countrycode: "RS",
      maxresults: String(MAX_RESULTS),
      compact: "true",
      verbose: "false",
    });

    const url = `${OCM_URL}?${params.toString()}`;

    const response = await fetchWithTimeout(url, 20000);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OCM fetch failed: ${response.status} ${response.statusText} ${text}`.trim());
    }

    const chargers = await response.json();

    // ( TTL – radi samo ako ukljucimo TTL na tabeli u serverless.yml
    const ttl = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60;

    const items = (Array.isArray(chargers) ? chargers : []).map((c) => ({
      chargerId: String(c.ID),
      uuid: c.UUID,
      town: normalizeTown(c.AddressInfo?.Town, c.AddressInfo?.Postcode),
      townRaw: c.AddressInfo?.Town || "Unknown",
      title: c.AddressInfo?.Title,
      addressLine1: c.AddressInfo?.AddressLine1,
      addressLine2: c.AddressInfo?.AddressLine2,
      postcode: c.AddressInfo?.Postcode,
      latitude: c.AddressInfo?.Latitude,
      longitude: c.AddressInfo?.Longitude,
      isRecentlyVerified: c.IsRecentlyVerified,
      dateCreated: c.DateCreated,
      dateLastVerified: c.DateLastVerified,
      dateLastStatusUpdate: c.DateLastStatusUpdate,
      numberOfPoints: c.NumberOfPoints,
      ttl,
    }));

    // Upis u batch-evima
    let written = 0;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      // preskoci prazno
      if (batch.length === 0) continue;

      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch.map((Item) => ({ PutRequest: { Item } })),
          },
        })
      );

      written += batch.length;
    }

   

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "OCM data synced to DynamoDB",
        count: items.length,
        written,
      }),
    };
  } catch (err) {
    console.error("SYNC ERROR:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: err?.message || "Internal Server Error",
      }),
    };
  }
};
