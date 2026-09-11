/**
 * Reusable Phone Normalization and Validation Utility
 * Supports E.164 standard formatting with dedicated support for Nigerian and international numbers.
 */

import { ConsentStatus, Contact } from '../types/index.ts';

export interface CountryOption {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'US', name: 'United States / Canada', dialCode: '+1', flag: '🇺🇸' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
];

export interface PhoneNormalizationResult {
  raw: string;
  normalized: string;
  isValid: boolean;
  countryCode?: string;
  error?: string;
}

/**
 * Normalizes phone numbers to standard E.164 format where safely determinable.
 *
 * Rules:
 *  - If user inputs an international number with '+' (e.g. +447700900123), it is preserved as an international number.
 *  - If user inputs a local number (e.g. 08012345678) while a country (e.g. Nigeria +234) is selected, normalizes to +2348012345678.
 *  - Does NOT guess a country code if it cannot be safely determined.
 *  - E.164 format requires a leading '+' followed by 7 to 15 digits without spaces/symbols.
 */
export function normalizePhoneNumber(
  rawPhone: string,
  selectedCountryDialCode: string = '+234'
): PhoneNormalizationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      raw: '',
      normalized: '',
      isValid: false,
      error: 'Phone number is required',
    };
  }

  const raw = rawPhone.trim();
  // Strip spaces, dashes, parentheses, dots, commas
  let stripped = raw.replace(/[\s\-\(\)\.,]/g, '');

  if (!stripped) {
    return {
      raw,
      normalized: '',
      isValid: false,
      error: 'Phone number is empty',
    };
  }

  let normalized = '';
  const cleanDialCode = (selectedCountryDialCode || '+234').replace(/[^\d+]/g, '');
  const dialDigits = cleanDialCode.replace(/\D/g, '');

  // Case 1: Explicit leading '+' -> preserve as international number
  if (stripped.startsWith('+')) {
    const digitsOnly = stripped.substring(1).replace(/\D/g, '');
    normalized = `+${digitsOnly}`;
  }
  // Case 2: International dialing prefix '00'
  else if (stripped.startsWith('00')) {
    const digitsOnly = stripped.substring(2).replace(/\D/g, '');
    normalized = `+${digitsOnly}`;
  }
  // Case 3: Starts with the selected dial code digits without '+' (e.g. 2348012345678)
  else if (dialDigits && stripped.startsWith(dialDigits) && stripped.length > dialDigits.length + 5 && /^\d+$/.test(stripped)) {
    normalized = `+${stripped}`;
  }
  // Case 4: Starts with Nigerian '234' without '+' and 13 digits
  else if (stripped.startsWith('234') && stripped.length === 13 && /^\d+$/.test(stripped)) {
    normalized = `+${stripped}`;
  }
  // Case 5: Local format starting with '0' (e.g. 08012345678 for Nigeria, 07700900123 for UK)
  else if (stripped.startsWith('0') && /^\d+$/.test(stripped)) {
    const digitsWithoutZero = stripped.substring(1);
    normalized = `+${dialDigits}${digitsWithoutZero}`;
  }
  // Case 6: Local format without leading 0 for countries with fixed length (e.g. 8012345678 with +234 or 10 digits US with +1)
  else if (dialDigits && /^\d+$/.test(stripped) && stripped.length >= 7 && stripped.length <= 11) {
    normalized = `+${dialDigits}${stripped}`;
  }
  // Case 7: Cannot be safely determined without guessing country
  else {
    return {
      raw,
      normalized: stripped,
      isValid: false,
      error: 'Country code cannot be safely determined. Please include international code (e.g. +...) or select region.',
    };
  }

  // Final E.164 Validation: + followed by 7-15 digits, first digit after + cannot be 0
  const isE164Valid = /^\+[1-9]\d{6,14}$/.test(normalized);

  if (!isE164Valid) {
    return {
      raw,
      normalized,
      isValid: false,
      error: 'Invalid phone length or characters for international E.164 standard (7-15 digits)',
    };
  }

  return {
    raw,
    normalized,
    isValid: true,
  };
}

/**
 * Derives the single clear Consent Status from a contact.
 */
export function getContactConsentStatus(contact: Partial<Contact>): ConsentStatus {
  if (contact.optOut) return 'Opted Out';
  if (contact.marketingOptIn) return 'Marketing Consented';
  if (contact.transactionalOptIn) return 'Transactional Only';
  return 'Not Consented';
}

/**
 * Checks if two phone numbers represent the same recipient.
 */
export function arePhoneNumbersEqual(phoneA: string, phoneB: string): boolean {
  if (!phoneA || !phoneB) return false;
  const resA = normalizePhoneNumber(phoneA);
  const resB = normalizePhoneNumber(phoneB);

  if (resA.isValid && resB.isValid) {
    return resA.normalized === resB.normalized;
  }

  // Fallback to stripping non-digits
  const digitsA = phoneA.replace(/\D/g, '');
  const digitsB = phoneB.replace(/\D/g, '');
  return Boolean(digitsA && digitsA === digitsB);
}

/**
 * Computes display contact name strictly from firstName and lastName.
 * Never appends phone, email, company, or unmapped CSV values.
 */
export function getContactDisplayName(contact: { firstName?: string; lastName?: string }): string {
  const first = (contact.firstName || '').trim();
  const last = (contact.lastName || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return 'Unnamed Contact';
}

/**
 * Sanitizes contact records to ensure fields are separated and clean.
 * Fixes historical malformed demo or imported strings like:
 * "KELLY WHITE (234)7098933 KATTY KELLY WHITE"
 */
export function sanitizeContactRecord<T extends Record<string, any>>(contact: T): T {
  let firstName = typeof contact.firstName === 'string' ? contact.firstName.trim() : '';
  let lastName = typeof contact.lastName === 'string' ? contact.lastName.trim() : '';
  let phone = typeof contact.phone === 'string' ? contact.phone.trim() : '';
  let email = typeof contact.email === 'string' ? contact.email.trim() : '';
  let company = typeof contact.company === 'string' ? contact.company.trim() : '';

  // 1. Detect if phone number or parenthetical expression is accidentally embedded in firstName
  const phoneInFirstMatch = firstName.match(/^(.*?)(?:\s*[\(\[]?\s*)(\+?234[\d\s-]{7,}|0\d{10}|\(?234\)?[\s-]?\d{7,10})(?:\s*[\)\]]?\s*)(.*)$/i);
  if (phoneInFirstMatch) {
    const preName = phoneInFirstMatch[1].trim();
    const extractedPhone = phoneInFirstMatch[2].trim();
    const postText = phoneInFirstMatch[3].trim();

    if (preName) {
      const parts = preName.split(/\s+/).filter(Boolean);
      firstName = parts[0] || '';
      if (!lastName && parts.length > 1) {
        lastName = parts.slice(1).join(' ');
      }
    }

    if (!phone || phone === '+' || phone.length < 6) {
      phone = extractedPhone;
    }

    if (postText && !company) {
      // Remove repeated name tokens from postText to find genuine company
      const strippedPost = postText
        .replace(new RegExp(firstName, 'gi'), '')
        .replace(new RegExp(lastName, 'gi'), '')
        .trim();
      if (strippedPost) {
        company = strippedPost;
      }
    }
  }

  // 2. Detect if phone number is embedded in lastName
  const phoneInLastMatch = lastName.match(/^(.*?)(?:\s*[\(\[]?\s*)(\+?234[\d\s-]{7,}|0\d{10}|\(?234\)?[\s-]?\d{7,10})(?:\s*[\)\]]?\s*)(.*)$/i);
  if (phoneInLastMatch) {
    lastName = phoneInLastMatch[1].trim();
  }

  // 3. Strip any residual phone patterns or emails from names
  firstName = firstName
    .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .trim();

  lastName = lastName
    .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .trim();

  // 4. Strip phone or email from company
  company = company
    .replace(/\(?\+?\d[\d\s()-]{6,}\d\)?/g, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .trim();

  // 5. Clean and normalize phone
  if (phone) {
    const norm = normalizePhoneNumber(phone);
    if (norm.isValid) {
      phone = norm.normalized;
    }
  }

  // 6. Clean email
  email = email.trim();

  return {
    ...contact,
    firstName,
    lastName,
    phone,
    email,
    company,
  };
}
