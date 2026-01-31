const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// DynamoDB tabela (iz serverless.yml -> provider.environment)
const TABLE_NAME = process.env.CHARGERS_TABLE || "Chargers";

// LocalStack endpoint: kad Lambda radi unutar LocalStack-a, LOCALSTACK_HOSTNAME je setovan.
// Kad testiramo lokalno, endpoint je localhost.
const DYNAMODB_ENDPOINT = process.env.LOCALSTACK_HOSTNAME
  ? `http://${process.env.LOCALSTACK_HOSTNAME}:4566`
  : "http://localhost:4566";

const client = new DynamoDBClient({
  endpoint: DYNAMODB_ENDPOINT,
  region: "us-east-1",
});

const docClient = DynamoDBDocumentClient.from(client);

const ALLOWED_ORIGIN =
  "http://punjaci-website.s3-website.localhost.localstack.cloud:4566";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));


  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  const townRaw = event.pathParameters?.town;

  if (!townRaw) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Town parametar je obavezan" }),
    };
  }

  // town u URL-u može biti enkodovan (Novi%20Sad, %C4%8Ca%C4%8Dak...)
  const town = decodeURIComponent(townRaw);

  try {
    // Query preko GSI TownIndex: town = :town
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "TownIndex",
        KeyConditionExpression: "town = :town",
        ExpressionAttributeValues: {
          ":town": town,
        },
      })
    );

    const chargers = result.Items || [];

    console.log(`Found ${chargers.length} chargers for town=${town}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        town,
        count: chargers.length,
        chargers,
      }),
    };
  } catch (err) {
    console.error("DynamoDB query error:", err);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || "Internal Server Error" }),
    };
  }
};