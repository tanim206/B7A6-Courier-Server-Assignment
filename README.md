# Courier & Logistics Management System - Backend

A full-featured RESTful API backend for managing courier and logistics operations, built with Express.js, TypeScript, Prisma ORM, and PostgreSQL.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Database Models](#database-models)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
  - [Authentication](#authentication)
  - [User](#user)
  - [Hub Management](#hub-management)
  - [Shipment](#shipment)
  - [Payment](#payment)
- [Roles & Permissions](#roles--permissions)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [License](#license)

## Overview

This backend powers a courier and logistics management platform that supports:

- Multi-role access control (Customer, Staff, Admin, Super Admin)
- Hub creation, management, and staff application workflows
- Parcel shipment lifecycle tracking (create → receive → deliver)
- bKash payment gateway integration with refund support
- Email notifications via SMTP (Nodemailer) with EJS templates
- Google OAuth & credential-based authentication
- Cloudinary-based file/image uploads
- Redis caching
- PDF generation for documents

## Tech Stack

| Technology         | Purpose                        |
|--------------------|--------------------------------|
| **Node.js**        | Runtime                        |
| **TypeScript**     | Type safety                    |
| **Express.js v5**  | Web framework                  |
| **Prisma ORM**     | Database access (PostgreSQL)   |
| **PostgreSQL**     | Relational database            |
| **Redis**          | Caching                        |
| **JWT**            | Authentication (access/refresh)|
| **Zod**            | Request validation             |
| **bKash**          | Payment gateway                |
| **Cloudinary**     | File/image uploads             |
| **Nodemailer**     | Email sending (SMTP)           |
| **EJS**            | Email templates                |
| **Multer**         | File upload handling           |
| **Biome**          | Linting & formatting           |
| **tsup**           | Build tool                     |
| **Vercel**         | Deployment                     |

## Features

### Authentication & Authorization
- Customer registration with email verification (OTP via email)
- Login via email/password or Google OAuth
- JWT access & refresh token rotation
- Password reset flow (forgot password → email → reset)
- Role-based middleware (CUSTOMER, STAFF, ADMIN, SUPER_ADMIN)

### User Management
- Profile image upload (Cloudinary)
- Admin-only soft-delete for users

### Hub Management
- Admin creates and updates courier hubs (with location details)
- Customers apply to become hub staff (with file/document uploads)
- OTP-based email verification for hub applications
- Admin review workflow (approve/reject with reason)

### Shipment Management
- Staff creates shipments with sender, receiver, parcel, and hub routing details
- Staff marks shipment as received at destination hub
- Staff marks shipment as delivered
- Payment callback handling for bKash

### Payment Management
- bKash tokenized payment gateway integration
- Customer views their own payments
- Super Admin views all payments
- Payment lookup by ID
- Refund tracking support

## Project Structure

```
server/
├── prisma/
│   ├── migrations/            # Database migration files
│   └── schema/
│       ├── schema.prisma      # Main Prisma config (datasource, generator)
│       ├── enums.prisma       # All enum definitions
│       ├── user.prisma        # User model
│       ├── hub.prisma         # Hub model
│       ├── hubApplication.prisma  # HubApplication model
│       ├── shipment.prisma    # Shipment model
│       └── payment.prisma     # Payment model
├── src/
│   ├── server.ts              # Entry point (DB, Redis, Email, Server startup)
│   ├── app.ts                 # Express app setup, middleware, routes
│   ├── app/
│   │   ├── config/            # Environment config
│   │   ├── interfaces/        # Shared TypeScript interfaces
│   │   ├── lib/               # External service clients
│   │   │   ├── prisma.ts      # Prisma client instance
│   │   │   ├── redis.ts       # Redis client
│   │   │   ├── nodemailer.ts  # Email transporter
│   │   │   ├── cloudinary.ts  # Cloudinary config
│   │   │   ├── bkash.ts       # bKash payment gateway client
│   │   │   ├── googleAuth.ts  # Google OAuth client
│   │   │   └── multer.ts      # Multer file upload config
│   │   ├── middleware/
│   │   │   ├── checkAuth.ts       # JWT auth + role verification
│   │   │   ├── globalErrorHandler.ts  # Centralized error handling
│   │   │   ├── notFound.ts        # 404 handler
│   │   │   └── validateRequest.ts # Zod validation middleware
│   │   ├── module/
│   │   │   ├── auth/          # Authentication (register, login, OTP, password reset)
│   │   │   ├── user/          # User profile management
│   │   │   ├── hub/           # Hub CRUD & application workflow
│   │   │   ├── shipment/      # Shipment lifecycle
│   │   │   └── payment/       # Payment views & bKash integration
│   │   ├── templates/         # EJS email templates
│   │   └── utils/
│   │       ├── AppError.ts    # Custom error class
│   │       ├── catchAsync.ts  # Async error wrapper
│   │       ├── jwt.ts         # JWT sign/verify helpers
│   │       ├── seed.ts        # Super Admin auto-seeding
│   │       └── sendResponse.ts # Standardized API response
│   └── generated/             # Auto-generated Prisma client
├── .env.example               # Environment variable template
├── biome.json                 # Biome linter/formatter config
├── package.json
├── tsconfig.json
├── tsup.config.ts             # Build config
└── vercel.json                # Vercel deployment config
```

## Database Models

### User
| Field           | Type         | Description                     |
|-----------------|--------------|---------------------------------|
| id              | UUID         | Primary key                     |
| name            | String       | Full name                       |
| email           | String       | Unique, indexed                 |
| phone           | String       | Unique, indexed                 |
| password        | String?      | Hashed (nullable for OAuth)     |
| googleId        | String?      | Google OAuth ID                 |
| imageUrl        | String       | Profile image URL               |
| authProvider    | Enum         | GOOGLE or CREDENTIAL            |
| role            | Enum         | CUSTOMER, STAFF, ADMIN, SUPER_ADMIN |
| status          | Enum         | ACTIVE, BLOCKED, DELETED        |
| emailVerified   | Boolean      | Email verification status       |
| hubId           | String?      | Staff assigned hub              |

### Hub
| Field       | Type     | Description                    |
|-------------|----------|--------------------------------|
| id          | UUID     | Primary key                    |
| hubCode     | String   | Unique hub identifier          |
| name        | String   | Hub name                       |
| address     | String   | Full address                   |
| city        | String   | City, indexed                  |
| district    | String   | District, indexed              |
| division    | String   | Division, indexed              |
| status      | Enum     | ACTIVE or INACTIVE             |
| createdById | UUID     | Admin who created it           |

### HubApplication
| Field           | Type         | Description                    |
|-----------------|--------------|--------------------------------|
| id              | UUID         | Primary key                   |
| userId          | UUID         | Applicant (Customer)          |
| hubId           | UUID         | Target hub                    |
| name, email, phone | String  | Applicant details             |
| city, district, division | String | Location                 |
| additionalFiles | JSON         | Uploaded documents            |
| status          | Enum         | DRAFT, PENDING, APPROVED, REJECTED |
| rejectionReason | String?      | If rejected                   |
| reviewedById    | UUID?        | Admin who reviewed            |

### Shipment
| Field              | Type     | Description                        |
|--------------------|----------|------------------------------------|
| id                 | UUID     | Primary key                        |
| status             | Enum     | PENDING → DELIVERED (11 states)    |
| senderId           | UUID     | Sender (Customer)                  |
| senderName/Email/Phone | String | Sender snapshot                   |
| receiverName/Email/Phone/Address/City/District/Division | String | Receiver details |
| parcelName         | String   | Parcel description                 |
| weight             | Float?   | Parcel weight                      |
| originHubId        | UUID     | Origin hub                         |
| destinationHubId   | UUID     | Destination hub                    |
| createdById        | UUID     | Staff who created                  |
| receivedById       | UUID?    | Staff who received at destination  |
| deliveryCharge     | Decimal  | Fixed charge                       |

### Payment
| Field                | Type     | Description                    |
|----------------------|----------|--------------------------------|
| id                   | UUID     | Primary key                   |
| status               | Enum     | PENDING, PAID, FAILED, CANCELLED, REFUNDED |
| amount               | Decimal  | Payment amount                |
| currency             | String   | Default: BDT                  |
| paymentGateway       | String   | Default: bkash                |
| merchantInvoiceNumber| String   | Unique invoice                |
| bkashPaymentId       | String?  | bKash transaction ID          |
| shipmentId           | UUID     | Associated shipment           |
| refundTrxId/Amount/Reason | ? | Refund details               |

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **PostgreSQL** database (e.g., Neon, Supabase, Railway)
- **Redis** instance
- **Cloudinary** account
- **bKash** sandbox/production credentials
- **SMTP** email service (e.g., Gmail, Mailgun)
- **Google OAuth** Client ID (for Google login)

### Installation

```bash
git clone <repository-url>
cd server
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

See [`.env.example`](.env.example) for the full list of required variables.

### Database Setup

```bash
# Run Prisma migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

> A **Super Admin** account is automatically seeded on server startup using values from `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` env vars.

### Running the Server

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

The server runs on `http://localhost:5000` by default.

## API Endpoints

### Authentication — `/api/v1/auth`

| Method | Endpoint            | Auth | Description                   |
|--------|---------------------|------|-------------------------------|
| POST   | `/register`         | No   | Register new customer         |
| POST   | `/verify-email`     | No   | Verify email with OTP         |
| POST   | `/login`            | No   | Login with credentials        |
| POST   | `/google`           | No   | Login with Google OAuth       |
| POST   | `/refresh-token`    | No   | Refresh access token          |
| POST   | `/forgot-password`  | No   | Request password reset email  |
| POST   | `/reset-password`   | No   | Reset password with token     |
| GET    | `/me`               | Yes  | Get current user profile      |

### User — `/api/v1/user`

| Method | Endpoint          | Auth | Description              |
|--------|-------------------|------|--------------------------|
| PATCH  | `/profile-image`  | Yes  | Upload profile image     |
| PATCH  | `/:userId`        | Admin | Soft-delete a user      |

### Hub — `/api/v1/hub`

| Method | Endpoint                          | Auth  | Description                     |
|--------|-----------------------------------|-------|---------------------------------|
| POST   | `/create-hub`                     | Admin | Create a new hub                |
| PATCH  | `/:hubId`                         | Admin | Update hub details              |
| POST   | `/application-form/:hubId`        | Customer | Apply for hub staff position |
| POST   | `/verify-hub-application`        | Customer | Verify application via OTP  |
| PATCH  | `/application/:applicationId/review` | Admin | Review (approve/reject) application |

### Shipment — `/api/v1/shipments`

| Method | Endpoint                  | Auth  | Description                    |
|--------|---------------------------|-------|--------------------------------|
| POST   | `/`                       | Staff | Create a new shipment          |
| GET    | `/payment/callback`       | No    | bKash payment callback         |
| PATCH  | `/:shipmentId/receive`    | Staff | Mark shipment received         |
| PATCH  | `/:shipmentId/deliver`    | Staff | Mark shipment delivered        |

### Payment — `/api/v1/payment`

| Method | Endpoint          | Auth                   | Description              |
|--------|-------------------|------------------------|--------------------------|
| GET    | `/my-payments`    | Customer               | Get customer's payments  |
| GET    | `/all`            | Super Admin            | Get all payments         |
| GET    | `/:paymentId`     | Customer/Admin/SuperAdmin | Get payment by ID      |

## Roles & Permissions

| Role          | Capabilities                                                  |
|---------------|---------------------------------------------------------------|
| **CUSTOMER**  | Register, login, manage profile, apply for hub positions, view own payments |
| **STAFF**     | Create shipments, receive & deliver shipments, manage profile |
| **ADMIN**     | Create/update hubs, review hub applications, soft-delete users |
| **SUPER_ADMIN**| View all payments, full system access                        |

## Scripts

| Command                | Description                          |
|------------------------|--------------------------------------|
| `npm run dev`          | Start dev server with hot reload     |
| `npm run build`        | Build for production                 |
| `npm start`            | Start production server              |
| `npm run format:check` | Check code formatting (Biome)        |
| `npm run format:fix`   | Auto-fix formatting                  |
| `npm run lint:check`   | Check linting (Biome)                |
| `npm run lint:fix`     | Auto-fix linting                     |

## Deployment

This project is configured for **Vercel** deployment. The `vercel.json` maps all routes to `dist/server.js`.

To deploy:

```bash
npm run build
vercel deploy
```

## License

ISC
