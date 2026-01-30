const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.CHARGERS_TABLE;

// LocalStack endpoint (kad Lambda radi u LocalStack-u ima LOCALSTACK_HOSTNAME)
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

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  const town = event.pathParameters?.town;
  if (!town) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Town parametar je obavezan" }),
    };
  }

  try {
    const decodedTown = decodeURIComponent(town);

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "TownIndex",
        KeyConditionExpression: "town = :town",
        ExpressionAttributeValues: {
          ":town": decodedTown,
        },
      })
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        town: decodedTown,
        count: result.Items?.length || 0,
        chargers: result.Items || [],
      }),
    };
  } catch (error) {
    console.error("DynamoDB query error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};