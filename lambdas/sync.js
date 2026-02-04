const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const OCM_API_KEY = process.env.OCM_API_KEY;
const OCM_URL = process.env.OCM_URL;
const TABLE_NAME = process.env.CHARGERS_TABLE;

const BATCH_SIZE = 25;

const DYNAMODB_ENDPOINT = process.env.LOCALSTACK_HOSTNAME
  ? `http://${process.env.LOCALSTACK_HOSTNAME}:4566`
  : "http://localhost:4566";

const client = new DynamoDBClient({
  endpoint: DYNAMODB_ENDPOINT,
  region: "us-east-1",
});
const docClient = DynamoDBDocumentClient.from(client);

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function normalizeTown(town, postcode) {
  if (["Belgrad", "Belgrade", "Beograd"].includes(town)) return "Belgrade";
  if (postcode && String(postcode).startsWith("11")) return "Belgrade";
  return town || "Unknown";
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
          error: "OCM_API_KEY nije podešen. Upisi pravi key u serverless.yml.",
        }),
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
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OCM fetch failed: ${response.status} ${response.statusText}`);
    }
    const chargers = await response.json();

    const ttl = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60;

    const items = chargers.map((c) => ({
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

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch.map((Item) => ({ PutRequest: { Item } })),
          },
        })
      );
    }

    const currentIds = new Set(items.map((it) => it.chargerId));
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: "chargerId",
      })
    );

    const staleIds = (scanResult.Items || [])
      .map((x) => x.chargerId)
      .filter((id) => !currentIds.has(id));

    let deletedCount = 0;
    for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
      const batch = staleIds.slice(i, i + BATCH_SIZE);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch.map((id) => ({
              DeleteRequest: { Key: { chargerId: id } },
            })),
          },
        })
      );
      deletedCount += batch.length;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "OCM data synced to DynamoDB",
        count: items.length,
        deleted: deletedCount,
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || "Internal Server Error" }),
    };
  }
};