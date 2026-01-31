const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = "Chargers";

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:4566",
});

const docClient = DynamoDBDocumentClient.from(client);


const seedPath = path.join(__dirname, "../seed/ocm-seed.json");
const chargers = JSON.parse(fs.readFileSync(seedPath, "utf-8"));

async function seed() {
  for (const charger of chargers) {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: charger,
      })
    );
    console.log(`Inserted charger ${charger.chargerId}`);
  }
  console.log("Seeding finished");
}

seed().catch(console.error);