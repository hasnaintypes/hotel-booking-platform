import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from "class-validator";

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt ignores everything after 72 bytes, so a longer password would not be fully used. */
export const PASSWORD_MAX_LENGTH = 72;

// The commonest passwords that are long enough to pass the length rule. Compared in lower case.
const COMMON_PASSWORDS = new Set([
  "1234567890",
  "0987654321",
  "12345678910",
  "123456789012",
  "1q2w3e4r5t",
  "1q2w3e4r5t6y",
  "1qaz2wsx3edc",
  "qwertyuiop",
  "qwertyuiop1",
  "qwerty1234",
  "qwerty12345",
  "qwerty123456",
  "qwertyuiopasdfghjkl",
  "asdfghjkl1",
  "asdfghjkl123",
  "zxcvbnm123",
  "password12",
  "password123",
  "password1234",
  "password12345",
  "password123456",
  "passw0rd123",
  "p@ssword123",
  "p@ssw0rd123",
  "pa$$word123",
  "password!23",
  "password@123",
  "password#123",
  "mypassword1",
  "mypassword123",
  "iloveyou123",
  "iloveyou1234",
  "iloveyou12345",
  "letmein1234",
  "letmein12345",
  "welcome123",
  "welcome1234",
  "welcome12345",
  "welcome@123",
  "admin12345",
  "admin123456",
  "administrator",
  "administrator1",
  "changeme123",
  "changeme1234",
  "trustno1234",
  "superman123",
  "batman12345",
  "football123",
  "baseball123",
  "basketball1",
  "monkey12345",
  "dragon12345",
  "master12345",
  "shadow12345",
  "sunshine123",
  "princess123",
  "charlie1234",
  "michael1234",
  "jennifer123",
  "abcdefghij",
  "abcdefghijk",
  "abcd123456",
  "abc1234567",
  "abcdef1234",
  "aaaaaaaaaa",
  "1111111111",
  "0000000000",
  "1234512345",
  "123123123123",
  "123456123456",
  "11111111111",
  "holidayhotel",
  "holidayhotel1",
  "holidayhotel123",
  "hotelbooking",
  "hotelbooking1",
  "hotelbooking123",
]);

const isRepeatedCharacter = (value: string) => new Set(value).size === 1;

/** True for a run such as 1234567890 or abcdefghij, counting up or down. */
const isSequence = (value: string) => {
  if (value.length < 6) return false;
  let step: number | undefined;
  for (let i = 1; i < value.length; i += 1) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (Math.abs(diff) !== 1) return false;
    if (step === undefined) step = diff;
    else if (diff !== step) return false;
  }
  return true;
};

/**
 * Whether a password is too easy to guess: a well-known password, one character repeated, a plain
 * run of letters or digits, or the account's own email name.
 */
export function isCommonPassword(password: string, email?: string): boolean {
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || isRepeatedCharacter(lower) || isSequence(lower)) return true;

  const emailName = (email ?? "").split("@")[0]?.toLowerCase();
  return Boolean(emailName && emailName.length >= 4 && lower === emailName);
}

@ValidatorConstraint({ name: "notCommonPassword", async: false })
export class NotCommonPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== "string") return false;
    const email = (args.object as { email?: unknown }).email;
    return !isCommonPassword(value, typeof email === "string" ? email : undefined);
  }

  defaultMessage(): string {
    return "Password is too easy to guess; choose a less common one";
  }
}
