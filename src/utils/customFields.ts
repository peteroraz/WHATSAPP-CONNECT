import type { Contact } from '../types/index.ts';

/**
 * List of forbidden/reserved JavaScript object property keys.
 */
const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'isprototypeof',
  'propertyisenumerable',
  'tolocalestring',
  'tostring',
  'valueof',
  'hasownproperty',
]);

/**
 * List of standard Contact root properties that must never be overwritten by a custom field.
 */
const RESERVED_CONTACT_ROOT_FIELDS = new Set([
  'id',
  'organizationid',
  'clientid',
  'firstname',
  'lastname',
  'phone',
  'normalizedphone',
  'email',
  'company',
  'tags',
  'groups',
  'whatsappoptin',
  'marketingoptin',
  'transactionaloptin',
  'optindate',
  'optinsource',
  'consentnotes',
  'optout',
  'optoutdate',
  'optoutsource',
  'status',
  'customfields',
  'createdat',
  'updatedat',
  'isdemo',
]);

/**
 * Generates a stable machine key from a source column header.
 * Examples:
 *  "Policy Number"   → "policy_number"
 *  "Amount Due"      → "amount_due"
 *  "Account Manager" → "account_manager"
 *  "Date of Birth"   → "date_of_birth"
 * 
 * Safely sanitizes punctuation and spaces into underscores.
 * If the resulting key collides with prototype properties or root Contact fields,
 * safely prefixes it with "cf_" to prevent collisions.
 */
export function generateSafeCustomFieldKey(header: string): string {
  if (!header || typeof header !== 'string') {
    return 'custom_field';
  }

  // 1. Trim and normalize characters to lowercase
  let key = header
    .trim()
    .toLowerCase()
    // Replace non-alphanumeric characters (including punctuation, hyphens, spaces) with underscore
    .replace(/[^a-z0-9]+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '');

  if (!key) {
    key = 'custom_field';
  }

  // 2. Reject/safely rename forbidden prototype keys or root Contact properties
  if (FORBIDDEN_KEYS.has(key) || RESERVED_CONTACT_ROOT_FIELDS.has(key)) {
    key = `cf_${key}`;
  }

  return key;
}

/**
 * Central Field Resolver
 * Resolves values for both standard fields and custom fields.
 * 
 * Behavior:
 *  "firstName"            → contact.firstName
 *  "lastName"             → contact.lastName
 *  "company"              → contact.company
 *  "phone"                → contact.phone
 *  "email"                → contact.email
 *  "custom:policy_number" → contact.customFields?.policy_number
 * 
 * Returns string representation or empty string if undefined/null.
 */
export function resolveContactField(
  contact: Contact | null | undefined,
  fieldMapping: string
): string {
  if (!contact || !fieldMapping) return '';

  const trimmed = fieldMapping.trim();

  // Custom field prefix check
  if (trimmed.startsWith('custom:')) {
    const customKey = trimmed.slice(7);
    const val = contact.customFields?.[customKey];
    if (val === undefined || val === null) return '';
    return String(val);
  }

  // Standard root contact fields
  switch (trimmed) {
    case 'firstName':
      return contact.firstName || '';
    case 'lastName':
      return contact.lastName || '';
    case 'fullName':
      return `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    case 'company':
      return contact.company || '';
    case 'phone':
      return contact.phone || '';
    case 'email':
      return contact.email || '';
    default: {
      // Check direct property or direct customFields key fallback
      const direct = (contact as any)[trimmed];
      if (direct !== undefined && direct !== null) {
        return String(direct);
      }
      const customFallback = contact.customFields?.[trimmed];
      if (customFallback !== undefined && customFallback !== null) {
        return String(customFallback);
      }
      return '';
    }
  }
}
