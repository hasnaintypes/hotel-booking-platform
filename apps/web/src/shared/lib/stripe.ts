import { loadStripe } from "@stripe/stripe-js";

const STRIPE_PUB_KEY = import.meta.env.VITE_STRIPE_PUB_KEY || "";

export const stripePromise = loadStripe(STRIPE_PUB_KEY);
