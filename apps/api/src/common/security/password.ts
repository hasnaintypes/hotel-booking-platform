import bcrypt from "bcryptjs";

/** bcrypt cost for new hashes. Raised from 8; existing hashes are upgraded when users sign in. */
export const DEFAULT_BCRYPT_COST = 12;

/**
 * The cost to use. BCRYPT_COST lowers it for tests only: config validation refuses anything below
 * the default when NODE_ENV=production.
 */
export const bcryptCost = (): number => {
  const configured = Number(process.env.BCRYPT_COST);
  return Number.isInteger(configured) && configured >= 4 && configured <= 15
    ? configured
    : DEFAULT_BCRYPT_COST;
};

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, bcryptCost());

/** True when a stored hash was made with a lower cost than is now used. */
export const needsRehash = (hash: string): boolean => {
  try {
    return bcrypt.getRounds(hash) < bcryptCost();
  } catch {
    return false;
  }
};
