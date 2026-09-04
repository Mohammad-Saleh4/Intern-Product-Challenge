# Product Drop

Two-folder TypeScript application:

- `backend`: NestJS API with Prisma and PostgreSQL
- `frontend`: React application built with Vite

## Local setup

1. Ensure PostgreSQL is running and create a `product_drop` database.
2. Copy `backend/.env.example` to `backend/.env` and update its connection URL.
3. Prepare and run the API:

   ```sh
   cd backend
   npm run prisma:migrate -- --name init
   npm run start:dev
   ```

4. In another terminal, run the frontend:

   ```sh
   cd frontend
   npm run dev
   ```

The API defaults to `http://localhost:3000`. Reservations decrement inventory
atomically and receive an expiry exactly 15 minutes after they are created.
