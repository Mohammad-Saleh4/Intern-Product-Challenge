# Product Drop

A concurrency-safe limited-release commerce demo. Customers can view live
inventory, reserve an item for 15 minutes, and complete checkout before the
reservation expires. Expired reservations automatically return their item to
inventory.

The repository uses two TypeScript applications:

- `backend/` — NestJS REST API, Prisma ORM, PostgreSQL, Jest
- `frontend/` — React single-page application built with Vite

## Features

- Live product dashboard that refreshes inventory every five seconds
- Atomic reservations that cannot oversell a product
- 15-minute checkout countdown based on the server timestamp
- Automatic expiry processing every minute
- Idempotent inventory restoration for expired reservations
- Checkout ownership, status, and expiry validation
- Jest unit and PostgreSQL-backed concurrency tests
- Responsive frontend with loading, empty, error, and success states

## Architecture

The browser communicates with a NestJS REST API. NestJS validates requests and
coordinates business rules through feature services. Prisma provides the typed
database client, while PostgreSQL remains the source of truth for products,
reservations, orders, and inventory.

The main data flow is:

1. React polls `GET /products` every five seconds.
2. A customer submits `POST /reservations`.
3. NestJS opens a Prisma interactive transaction and locks the product row.
4. The transaction decrements inventory and creates a 15-minute reservation.
5. `POST /checkout` validates and completes that reservation atomically.
6. A scheduled NestJS task expires abandoned reservations and restores stock.

### Key architectural decisions

#### PostgreSQL

PostgreSQL was selected because inventory is transactional state. Its ACID
guarantees ensure that inventory changes and reservation creation either commit
together or roll back together. PostgreSQL also supports `SELECT ... FOR
UPDATE`, which is central to preventing overselling under concurrent load.

#### Prisma

Prisma provides generated TypeScript types for models and database operations,
reducing mismatches between application code and the schema. Interactive
transactions allow reservation and checkout workflows to remain atomic. A
small raw SQL query is intentionally used for row-level locking because Prisma
does not expose `FOR UPDATE` through its standard model query API.

#### NestJS

NestJS provides clear module, controller, and service boundaries. Dependency
injection keeps database access testable, global validation protects API
boundaries, and `@nestjs/schedule` integrates the reservation expiry task into
the application lifecycle.

#### React and Vite

React is used for the stateful dashboard, reservation flow, countdown, and
feedback states. Vite provides a small, fast TypeScript development and build
setup without adding unnecessary framework infrastructure for this challenge.

## Concurrency strategy

Reservation creation runs inside a Prisma interactive transaction. It executes
the following PostgreSQL query before reading or changing inventory:

```sql
SELECT id, available_quantity
FROM products
WHERE id = $1::uuid
FOR UPDATE;
```

`FOR UPDATE` gives the transaction an exclusive lock on that product row.
Concurrent requests for the same product wait for the current transaction to
finish. Each waiting transaction then sees the latest committed
`available_quantity`, rather than the value that existed when all requests
started.

If inventory is zero, the API returns `400 Bad Request` with `Sold out`.
Otherwise, it decrements inventory and creates the reservation in the same
transaction. This prevents the classic read-check-write race that could allow
multiple customers to claim the last item.

Checkout uses a conditional status update inside a transaction so only one
request can move a pending, unexpired reservation to `COMPLETED`. The expiry
task similarly changes only records that are still `PENDING`; inventory is
restored only when that conditional update succeeds. This makes expiry safe
when multiple application instances or overlapping jobs inspect the same
reservation.

## Data model

- **Product** — name, price, total quantity, and currently available quantity
- **Reservation** — product, user ID, status, creation time, and expiry time
- **Order** — a one-to-one record created from a completed reservation
- **ReservationStatus** — `PENDING`, `COMPLETED`, or `EXPIRED`

## API

The API defaults to `http://localhost:3000`.

- `GET /products` — returns products with available inventory
- `POST /products` — creates a product for administration/testing
- `POST /reservations` — reserves one unit for 15 minutes
- `GET /reservations` — lists reservations
- `GET /reservations/:id` — returns one reservation
- `POST /checkout` — completes an owned, pending reservation
- `GET /orders` — lists completed orders

Create a reservation:

```json
{
  "productId": "PRODUCT_UUID",
  "userId": "USER_UUID"
}
```

Complete checkout:

```json
{
  "reservationId": "RESERVATION_UUID",
  "userId": "USER_UUID"
}
```

## Assumptions

- Authentication is outside this challenge's scope. The frontend generates a
  UUID and persists it in the browser; `userId` is sent in reservation and
  checkout request bodies. This identifies a test user but is not secure
  authentication.
- Each reservation claims exactly one unit of one product.
- Prices are stored as PostgreSQL decimals and displayed as USD by the demo UI.
- Payment processing, taxes, shipping, refunds, and order fulfillment are out
  of scope. "Complete Purchase" records an order but does not charge a card.
- PostgreSQL is available externally or installed locally. This repository does
  not include Docker configuration.
- Application and database clocks are sufficiently synchronized. The server's
  `expiresAt` value, not the browser clock at reservation creation, is the
  authoritative deadline.

## Trade-offs considered

### Polling versus WebSockets

The frontend polls inventory every five seconds. Polling is simple, resilient,
and sufficient for the scope and time constraints of this project. It requires
no persistent connections or event-broadcasting infrastructure.

The trade-off is delayed updates and repeated requests even when inventory has
not changed. At larger scale, WebSockets or Server-Sent Events would provide
lower-latency inventory changes and reduce redundant reads. Database changes
would publish inventory events to connected clients through a shared message
layer.

### Database consistency versus maximum throughput

Row locks deliberately serialize reservations for the same product. This
prioritizes correctness and is appropriate for scarce inventory. Extremely hot
drops could create lock contention, so larger deployments may introduce an
admission queue while keeping PostgreSQL as the final consistency boundary.

### Scheduled expiry versus delayed jobs

A one-minute cron task is straightforward and makes expiration eventually
consistent within one minute. It scans and processes expired records in
individual transactions. A delayed-job system would be more efficient at high
volume but adds operational complexity.

## Local development

### Prerequisites

- Node.js 24 and npm
- A running PostgreSQL database

If using Supabase from an IPv4-only network, use its **Session pooler** URL on
port `5432`. Prisma migrations should not use the transaction pooler on port
`6543`, because transaction pooling conflicts with migration prepared
statements.

### 1. Install dependencies

From the repository root:

```powershell
cd backend
npm install
cd ../frontend
npm install
cd ..
```

### 2. Configure the backend

Create the environment file:

```powershell
Copy-Item backend/.env.example backend/.env
```

Update `backend/.env` with valid PostgreSQL connection strings:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/product_drop?schema=public"
TEST_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/product_drop_test?schema=public"
PORT=3000
```

`TEST_DATABASE_URL` is recommended so integration tests never share the
development database. If it is omitted, the tests fall back to `DATABASE_URL`
and clean up only the uniquely created test records.

Apply the schema and generate the Prisma client:

```powershell
cd backend
npm run prisma:migrate -- --name init
npm run prisma:generate
```

Apply the same migrations to the test database before its first use. One
PowerShell approach is:

```powershell
$env:DATABASE_URL="YOUR_TEST_DATABASE_URL"
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
```

### 3. Configure the frontend

The frontend defaults to `http://localhost:3000`, so this step is optional for
local development:

```powershell
Copy-Item frontend/.env.example frontend/.env
```

To use a different API, update:

```env
VITE_API_URL=http://localhost:3000
```

### 4. Run both applications

Backend terminal:

```powershell
cd backend
npm run start:dev
```

Frontend terminal:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:3000`.

## Testing

Run Jest unit tests:

```powershell
cd backend
npm test
```

Run the PostgreSQL-backed integration tests:

```powershell
npm run test:e2e
```

Run unit tests with coverage:

```powershell
npm run test:cov
```

The concurrency integration test creates a product with five units and fires
ten simultaneous `POST /reservations` requests. It asserts that exactly five
requests return `201`, five return the `Sold out` error, and final inventory is
zero. Its temporary product and reservations are removed after the test.

Additional quality checks:

```powershell
npm run lint
npm run build
cd ../frontend
npm run lint
npm run build
```

## What to improve with more time

- **Redis caching** — cache product catalog reads and short-lived availability
  views while carefully invalidating or publishing updates after commits.
  PostgreSQL would remain authoritative for the final inventory check.
- **Queueing for traffic spikes** — place reservation attempts behind
  RabbitMQ, Kafka, or another durable queue to smooth massive drop traffic,
  enforce admission limits, and provide retries and backpressure.
- **WebSockets or Server-Sent Events** — push committed inventory and
  reservation updates to browsers instead of polling every five seconds.
- **Dedicated delayed jobs** — schedule one expiration job per reservation
  using BullMQ or a similar worker system rather than scanning every minute.
- **Real authentication and authorization** — validate signed sessions or JWTs
  and derive the user ID server-side instead of trusting request bodies.
- **Payments and idempotency keys** — integrate a payment provider and make
  checkout safe across network retries and provider callbacks.
- **Observability** — add structured logs, tracing, metrics, lock-wait
  monitoring, queue depth alerts, and dashboards for reservation conversion.
- **Load and failure testing** — test thousands of concurrent requests,
  transaction retries, database failover, worker crashes, and multi-instance
  expiry execution.
- **API hardening** — add rate limits, pagination, OpenAPI documentation,
  stricter product administration permissions, and standardized error codes.
