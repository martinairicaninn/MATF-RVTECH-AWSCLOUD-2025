# EV Punjaci – Srbija  
(Open Charge Map + AWS LocalStack)

Ovaj projekat prikazuje **elektricne punjace u Srbiji na interaktivnoj mapi**, koristeci podatke sa **Open Charge Map API-ja**.

Podaci se:
- preuzimaju sa Open Charge Map API-ja
- cuvaju u **DynamoDB**
- citaju preko **AWS Lambda + API Gateway**
- prikazuju u **web frontend-u (Leaflet mapa)**

Projekat je realizovan lokalno koriscenjem **AWS LocalStack-a**.

---

## Funkcionalnosti

-  Preuzimanje podataka sa Open Charge Map API-ja
-  Cuvanje punjaca u DynamoDB
-  Endpoint za sinhronizaciju podataka (`/sync`)
-  Endpoint za pretragu punjaca po gradu (`/chargers/{town}`)
-  Prikaz punjaca na mapi (Leaflet + OpenStreetMap)
-  AWS servisi emulirani pomocu LocalStack-a

---

## Koriscene tehnologije

- Node.js (AWS Lambda)
igger
- AWS Lambda  
- API Gateway  
- DynamoDB  
- S3 Static Website  
- LocalStack  
- Serverless Framework  
- Leaflet + OpenStreetMap  

---

## Pokretanje projekta

### 1. Zaustavi postojece kontejnere

```bash
docker compose down
```

### 2. Pokreni LocalStack i servise
```bash
docker compose up -d
```


Sacekati nekoliko sekundi da se LocalStack podigne.

### 3. Deploy serverless infrastrukture
```bash
npx sls deploy
```


 Nakon ove komande:

u terminalu ce se pojaviti API Gateway ID

taj ID **rucno** ubaciti u web/index.html

Primer:

const API_ID = "XXXXXXXX";

### 4. Deploy web frontenda
```bash
npm run deploy-frontend-fixed-bucket
```

### 5. Otvori aplikaciju u browseru

http://punjaci-website.s3-website.localhost.localstack.cloud:4566/

### 6. Lista svih gradova
```bash
aws --endpoint-url=http://localhost:4566 dynamodb scan \
  --table-name Chargers \
  --projection-expression "town" \
  --region us-east-1 \
  --output text | awk '{print $2}' | sort | uniq
```
