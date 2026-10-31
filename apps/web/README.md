# Hotel Booking Management System Frontend - React, TypeScript MERN Project

A modern, responsive frontend application for the Hotel Booking Management System. Built with React 19, TypeScript, Vite 8, and Tailwind CSS 4, featuring advanced search, booking management, and seamless user experience across all devices.

[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248)](https://www.mongodb.com/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC)](https://tailwindcss.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF)](https://stripe.com/)

---

## 🎯 Frontend Overview

### **What This Frontend Provides**

This frontend serves as the **user interface** for a comprehensive hotel booking platform. It delivers an intuitive, responsive experience for travelers to discover, book, and manage hotel accommodations, while providing powerful tools for hotel owners to manage their properties.

### **Core User Experiences**

- **🔍 Hotel Discovery**: Advanced search with multiple filters and real-time results
- **📅 Booking Management**: Seamless booking process with secure payment integration
- **👤 User Management**: Registration, authentication, and profile management
- **🏢 Hotel Management**: Complete CRUD operations for hotel owners
- **📊 Analytics Dashboard**: Business insights and performance metrics
- **📱 Mobile-First**: Responsive design optimized for all devices

### **Architecture Highlights**

```bash
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │    │  React Query    │    │  Tailwind CSS   │
│   (TypeScript)  │◄──►│  (State Mgmt)   │◄──►│   (Styling)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  React Router   │    │   Shadcn UI     │    │   Vite Build    │
│  (Navigation)   │    │  (Components)   │    │   (Dev Server)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 🚀 Quick Start

### **Prerequisites**

- Node.js (v18 or higher)
- Git
- Backend API running (local or deployed)

### **Installation**

```bash
# Clone the repository
git clone https://github.com/<your-org>/hotel-booking-platform.git
cd hotel-booking-platform

# Install workspace dependencies
pnpm install

# Create environment file
cd apps/web
cp .env.example .env

# Configure environment variables (see below)
# Start development server
pnpm dev
```

### **Environment Configuration**

Create a `.env` file in the root directory:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:5001

# Separate admin SPA
VITE_ADMIN_URL=http://localhost:5175

# Payment Processing
VITE_STRIPE_PUB_KEY=pk_test_your-stripe-publishable-key
```

---

## 📁 Project Structure

```bash
apps/web/
├── src/
│   ├── main.tsx                  # Entry point + providers
│   ├── vite-env.d.ts
│   ├── app/
│   │   └── App.tsx               # Router + route composition
│   ├── config/
│   │   └── hotel-options.ts      # Hotel types/facilities config
│   ├── features/                 # Feature-sliced modules
│   │   ├── auth/
│   │   │   ├── api.ts            # Auth endpoints
│   │   │   ├── types.ts          # Register/SignIn DTOs
│   │   │   ├── context/AuthContext.tsx
│   │   │   ├── hooks/useAuth.ts
│   │   │   ├── components/       # UsernameMenu, SignOutButton
│   │   │   └── pages/            # SignInPage, RegisterPage, AuthCallbackPage
│   │   ├── hotels/
│   │   │   ├── api.ts
│   │   │   ├── context/SearchContext.tsx
│   │   │   ├── hooks/            # useHotelPlaces, useSearchContext
│   │   │   ├── lib/              # select-option-maps
│   │   │   ├── components/       # Hero, SearchBar, filters, cards
│   │   │   └── pages/            # HomePage, SearchPage, HotelDetailPage
│   │   ├── hotel-management/
│   │   │   ├── api.ts
│   │   │   ├── components/       # ManageHotelForm, BookingLogModal
│   │   │   └── pages/            # MyHotelsPage, AddHotelPage, EditHotelPage
│   │   ├── bookings/
│   │   │   ├── api.ts
│   │   │   ├── types.ts          # BookingFormData
│   │   │   ├── lib/booking-utils.ts
│   │   │   ├── components/       # BookingForm, GuestInfoForm, summary, cancel
│   │   │   └── pages/            # BookingPage, MyBookingsPage
│   │   ├── reviews/
│   │   │   ├── api.ts
│   │   │   └── components/WriteReviewForm.tsx
│   │   ├── analytics/
│   │   │   ├── api.ts
│   │   │   ├── types.ts
│   │   │   ├── lib/prefetch.ts
│   │   │   ├── components/       # insight cards
│   │   │   └── pages/AnalyticsDashboardPage.tsx
│   │   └── status/
│   │       └── pages/            # ApiStatusPage, ApiDocsPage
│   ├── shared/                   # Cross-feature building blocks
│   │   ├── api/                  # web-only AI endpoint
│   │   ├── components/layout/    # Header, Footer, nav, layouts
│   │   ├── context/AppContext.tsx
│   │   ├── hooks/                # useAppContext, useLoadingHooks
│   │   └── lib/                  # utils, query invalidation, caches
│   └── styles/
│       └── index.css             # Tailwind 4 entry + config link
├── components.json               # shadcn generator config
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### Architecture conventions

- **Feature-first**: each domain owns its API, types, hooks, components, and pages.
- **Layering**: `features/*` may import `shared/*`; `shared/*` never imports a feature.
- **Naming**: kebab-case folders, `PascalCase.tsx` components, `useCamelCase.ts` hooks, `*Page.tsx` routes.
- **Imports**: cross-module imports use the `@/` alias; intra-feature imports stay relative.

---

## 🔧 Technology Stack

### **Core Technologies**

- **React 19.3.1**: Modern UI library with hooks and concurrent features
- **TypeScript 6.0.3**: Type-safe JavaScript development
- **Vite 8.3.5**: Fast build tool and development server
- **React Router DOM**: Client-side routing and navigation

### **Styling & UI**

- **Tailwind CSS 4.3.3**: Utility-first CSS framework
- **Shared design system**: `@hotel-booking/ui` (shadcn-style primitives)
- **Lucide React**: Beautiful, customizable icons
- **PostCSS**: CSS processing and optimization

### **State Management & Data**

- **TanStack Query 5**: Server state management and caching (`@hotel-booking/api-client`)
- **TanStack Table 9**: Headless table rendering
- **React Context**: Global UI/auth state
- **React Hook Form**: Form handling and validation

### **Payment & Media**

- **Stripe React**: Payment processing integration
- **Cloudinary**: Image management (via backend)

### **Development Tools**

- **ESLint**: Code linting and quality
- **Prettier**: Code formatting

---

## 🎨 Key Components

### **AdvancedSearch Component**

A comprehensive search component with multiple filters and real-time suggestions.

```typescript
// Usage Example
<AdvancedSearch
  onSearch={(searchData) => {
    // Handle search with advanced filters
    console.log(searchData);
  }}
  isExpanded={false}
/>
```

**Features:**

- Destination autocomplete with API suggestions
- Date range selection with calendar picker
- Guest count management (adults/children)
- Advanced filters (price, rating, facilities, hotel types)
- Quick search for popular destinations
- Responsive design for all screen sizes

### **Hero Component**

Landing page hero section with gradient background and search integration.

```typescript
// Usage Example
<Hero
  onSearch={(searchData) => {
    // Handle search from hero section
  }}
/>
```

**Features:**

- Full-width gradient background
- Integrated search component
- Feature highlights and call-to-action
- Responsive design with mobile optimization

### **AnalyticsDashboard Component**

Comprehensive analytics dashboard with charts and metrics.

```typescript
// Usage Example
<AnalyticsDashboard />
```

**Features:**

- Revenue charts and trends visualization
- Booking analytics and performance metrics
- Forecasting data and business insights
- Interactive charts using Recharts 3
- Real-time data updates

### **BookingLogModal Component**

Modal for viewing detailed booking information.

```typescript
// Usage Example
<BookingLogModal
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  hotelId="hotel-id"
  hotelName="Hotel Name"
/>
```

**Features:**

- Detailed booking information display
- Status management and updates
- Payment details and transaction history
- Guest information and special requests

---

## 📱 Pages & Routes

### **Public Pages**

| Route              | Component      | Description                       |
| ------------------ | -------------- | --------------------------------- |
| `/`                | `Home.tsx`     | Landing page with hero and search |
| `/search`          | `Search.tsx`   | Hotel search results with filters |
| `/detail/:hotelId` | `Detail.tsx`   | Hotel details and booking form    |
| `/register`        | `Register.tsx` | User registration form            |
| `/sign-in`         | `SignIn.tsx`   | User authentication form          |

### **Protected Pages**

| Route                  | Component                | Description                      | Auth Required |
| ---------------------- | ------------------------ | -------------------------------- | ------------- |
| `/booking/:hotelId`    | `Booking.tsx`            | Booking confirmation and payment | ✅            |
| `/my-bookings`         | `MyBookings.tsx`         | User's booking history           | ✅            |
| `/my-hotels`           | `MyHotels.tsx`           | Hotel management for owners      | ✅            |
| `/add-hotel`           | `AddHotel.tsx`           | Add new hotel listing            | ✅            |
| `/edit-hotel/:hotelId` | `EditHotel.tsx`          | Edit existing hotel              | ✅            |
| `/business-insights`   | `AnalyticsDashboard.tsx` | Business insights dashboard      | ✅            |

### **Utility Pages**

| Route         | Component       | Description                   |
| ------------- | --------------- | ----------------------------- |
| `/api-status` | `ApiStatus.tsx` | Backend API health monitoring |
| `/api-docs`   | `ApiDocs.tsx`   | API documentation viewer      |

---

## 🔐 Authentication & State Management

### **Dual Authentication System**

The frontend implements a **dual authentication system** to support both modern browsers and privacy-focused browsers:

```typescript
// API Client with dual authentication
const getRequestOptions = (method: string = "GET", body?: any) => {
  const options: RequestInit = {
    method,
    credentials: "include", // Try cookies first
    headers: getAuthHeaders(),
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return options;
};

const getAuthHeaders = () => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // If we have a stored token, use Authorization header
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  return headers;
};
```

### **Context Management**

```typescript
// App Context for global state
const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider = ({ children }: { children: ReactNode }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<UserType | null>(null);

  return (
    <AppContext.Provider value={{ isLoggedIn, setIsLoggedIn, user, setUser }}>
      {children}
    </AppContext.Provider>
  );
};
```

---

## 🎨 Styling & Design System

### **Tailwind CSS Configuration**

```javascript
// tailwind.config.js
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
```

### **Shadcn UI Components**

The project uses Shadcn UI for consistent, accessible components:

```typescript
// Example: Button component usage
import { Button } from "@/shared/components/ui/button";

<Button variant="default" size="lg">
  Book Now
</Button>

<Button variant="outline" size="sm">
  Cancel
</Button>
```

### **Responsive Design**

```typescript
// Responsive design patterns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Responsive grid layout */}
</div>

<div className="text-sm sm:text-base lg:text-lg">
  {/* Responsive typography */}
</div>
```

---

## 🔄 Data Flow & API Integration

### **React Query Implementation**

```typescript
// Data fetching with React Query
import { useQuery, useMutation } from "@tanstack/react-query";

// Fetch hotels with caching
const {
  data: hotels,
  isLoading,
  error,
} = useQuery({
  queryKey: ["hotels", searchParams],
  queryFn: () => searchHotels(searchParams),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

// Mutate booking data
const bookingMutation = useMutation({
  mutationFn: createRoomBooking,
  onSuccess: () => {
    toast.success("Booking confirmed!");
    navigate("/my-bookings");
  },
  onError: (error) => {
    toast.error("Booking failed. Please try again.");
  },
});
```

### **API Client Structure**

```typescript
// Centralized API client
export const searchHotels = async (
  searchParams: SearchParams,
): Promise<HotelSearchResponse> => {
  const queryParams = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) queryParams.append(key, value.toString());
  });

  const response = await fetch(
    `${API_BASE_URL}/api/hotels/search?${queryParams}`,
  );

  if (!response.ok) {
    throw new Error("Error fetching hotels");
  }

  return response.json();
};
```

---

## 💳 Payment Integration

### **Stripe Payment Flow**

```typescript
// Stripe payment integration
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Payment form component
const PaymentForm = ({ clientSecret }: { clientSecret: string }) => {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm />
    </Elements>
  );
};
```

### **Payment Processing**

```typescript
// Payment intent creation
const createPaymentIntent = async (hotelId: string, numberOfNights: string) => {
  const response = await fetch(
    `${API_BASE_URL}/api/hotels/${hotelId}/bookings/payment-intent`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numberOfNights }),
    },
  );

  if (!response.ok) {
    throw new Error("Error creating payment intent");
  }

  return response.json();
};
```

---

## 🎯 User Experience Features

### **Search & Filtering**

- **Advanced Search**: Multi-criteria hotel search
- **Real-time Filters**: Price, rating, facilities, hotel types
- **Smart Suggestions**: Destination autocomplete
- **Pagination**: Efficient data loading for large datasets
- **Sorting Options**: Price, rating, distance, relevance

### **Booking Experience**

- **Seamless Flow**: From search to booking confirmation
- **Guest Management**: Adult and child count tracking
- **Date Selection**: Calendar picker with availability check
- **Payment Security**: Stripe integration with PCI compliance
- **Confirmation**: Email notifications and booking history

### **Hotel Management**

- **CRUD Operations**: Complete hotel listing management
- **Image Upload**: Cloudinary integration for hotel photos
- **Analytics Dashboard**: Business insights and performance metrics
- **Booking Management**: Real-time booking tracking

### **Responsive Design**

- **Mobile-First**: Optimized for all screen sizes
- **Touch-Friendly**: Intuitive mobile interactions
- **Progressive Enhancement**: Works without JavaScript
- **Accessibility**: WCAG 2.1 AA compliance

---

## 🚀 Deployment

### **Netlify Deployment**

1. **Connect Repository**
   - Link your GitHub repository to Netlify
   - Enable automatic deployments

2. **Build Configuration**

   ```bash
   Build Command: pnpm build
   Publish Directory: dist
   ```

3. **Environment Variables**
   - Set `VITE_API_BASE_URL` to your production backend URL
   - Configure `VITE_STRIPE_PUBLISHABLE_KEY` for payments

4. **SPA Configuration**

   ```toml
   # netlify.toml
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

### **Production Checklist**

- [ ] Environment variables configured
- [ ] Backend API deployed and accessible
- [ ] Stripe keys configured for production
- [ ] CORS settings updated for production domain
- [ ] Performance optimization enabled
- [ ] Error monitoring configured

---

## 🧪 Testing

### **Component Testing**

```typescript
// Example: Component test
import { render, screen } from "@testing-library/react";
import { SearchBar } from "./SearchBar";

test("renders search bar", () => {
  render(<SearchBar />);
  expect(
    screen.getByPlaceholderText("Where are you going?")
  ).toBeInTheDocument();
});
```

---

## 🔧 Development Commands

```bash
# Development with hot reload
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Type checking
pnpm typecheck

# Lint code
pnpm lint

# Format code (repo root)
pnpm format
```

---

## 📈 Performance Optimization

### **Code Splitting**

```typescript
// Lazy loading for route components
import { lazy, Suspense } from "react";

const AnalyticsDashboard = lazy(() => import("@/features/analytics/pages/AnalyticsDashboardPage"));
const MyHotels = lazy(() => import("@/features/hotel-management/pages/MyHotelsPage"));

// Suspense wrapper
<Suspense fallback={<LoadingSpinner />}>
  <AnalyticsDashboard />
</Suspense>;
```

### **Image Optimization**

```typescript
// Optimized image loading
<img
  src={hotel.imageUrls[0]}
  alt={hotel.name}
  loading="lazy"
  className="w-full h-48 object-cover"
/>
```

### **Caching Strategy**

```typescript
// React Query caching
const { data: hotels } = useQuery({
  queryKey: ["hotels"],
  queryFn: fetchHotels,
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 10 * 60 * 1000, // 10 minutes
});
```

---

## 🔗 Integration Examples

### **Backend Integration**

```typescript
// API client integration
const apiClient = {
  baseURL: import.meta.env.VITE_API_BASE_URL,

  async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  },
};
```

### **Third-Party Integrations**

```typescript
// Stripe integration
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Cloudinary image optimization
const optimizedImageUrl = (url: string, width: number) => {
  return url.replace("/upload/", `/upload/w_${width},c_fill/`);
};
```

---

## 🎯 Key Features Summary

### **✅ User-Centric Design**

- **Intuitive Interface**: Easy-to-use hotel search and booking
- **Responsive Design**: Optimized for all devices and screen sizes
- **Accessibility**: WCAG 2.1 AA compliance
- **Performance**: Fast loading and smooth interactions

### **✅ Developer-Friendly**

- **TypeScript**: Full type safety throughout
- **Modular Architecture**: Reusable components and hooks
- **Modern React**: Latest patterns and best practices
- **Comprehensive Documentation**: Clear examples and guides

### **✅ Production-Ready**

- **SEO Optimized**: Meta tags and structured data
- **Performance Optimized**: Code splitting and lazy loading
- **Security**: Secure authentication and data handling
- **Scalable**: Designed for growth and feature additions

---

## 🚀 Happy Coding! 🎉

This frontend is designed to be **user-friendly**, **developer-friendly**, and **production-ready**. Whether you're learning React development, building a startup, or extending an existing platform, this frontend provides an excellent foundation.

**Key Benefits:**

- 🎓 **Learning Resource**: Complete React + TypeScript implementation
- 👥 **User Experience**: Intuitive and responsive design
- 🔧 **Developer Experience**: Modern tools and best practices
- 📚 **Well Documented**: Comprehensive documentation and examples

**Get Started Today!** 🚀

This is an **open-source project** - feel free to use, enhance, and extend this project further!

**Enjoy building and learning!** 🚀

Thank you! 😊
