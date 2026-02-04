const { execSync } = require("child_process");
const fs = require("fs");

const REGION = process.env.AWS_REGION || "us-east-1";
const ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";
const API_NAME = "dev-ev-punjaci-martina";
const INDEX_PATH = "web/index.html";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" });
}

try {
  const out = sh(`aws --endpoint-url=${ENDPOINT} apigateway get-rest-apis --region ${REGION}`);
  const data = JSON.parse(out);

  const api = (data.items || []).find((x) => x.name === API_NAME);
  if (!api?.id) {
    console.error(`Nisam našao API sa imenom "${API_NAME}".`);
    process.exit(1);
  }

  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const replaced = html.replace(
    /const API_ID\s*=\s*"[a-z0-9]+"/i,
    `const API_ID = "${api.id}"`
  );

  if (replaced === html) {
    console.error(`Nisam uspeo da zamenim API_ID u ${INDEX_PATH}. Proveri da ima liniju: const API_ID = "..."`);
    process.exit(1);
  }

  fs.writeFileSync(INDEX_PATH, replaced, "utf8");
  console.log(`API_ID ažuriran na: ${api.id}`);
} catch (e) {
  console.error("Greška:", e.message);
  process.exit(1);
}
