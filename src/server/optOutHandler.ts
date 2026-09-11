/**
 * Opt-in and Opt-out evaluation
 * Strictly enforces compliance according to WhatsApp Business Messaging Policy.
 */

const OPT_OUT_COMMANDS = ['STOP', 'UNSUBSCRIBE', 'REMOVE', 'REMOVE ME', 'OPT OUT', 'OPTOUT', 'QUIT', 'CANCEL'];
const OPT_IN_COMMANDS = ['START', 'SUBSCRIBE', 'UNSTOP', 'YES'];

export interface OptStatusEvaluation {
  isOptOutCommand: boolean;
  isOptInCommand: boolean;
  normalizedCommand?: string;
  suggestedReply?: string;
}

export function evaluateMessageConsentCommands(rawBody: string): OptStatusEvaluation {
  if (!rawBody || typeof rawBody !== 'string') {
    return { isOptOutCommand: false, isOptInCommand: false };
  }

  const trimmed = rawBody.trim().toUpperCase();

  // Exact command match or match within short command format
  const isOptOut = OPT_OUT_COMMANDS.includes(trimmed);
  if (isOptOut) {
    return {
      isOptOutCommand: true,
      isOptInCommand: false,
      normalizedCommand: trimmed,
      suggestedReply: 'You have been unsubscribed from marketing messages. You can message START if you would like to subscribe again.',
    };
  }

  const isOptIn = OPT_IN_COMMANDS.includes(trimmed);
  if (isOptIn) {
    return {
      isOptOutCommand: false,
      isOptInCommand: true,
      normalizedCommand: trimmed,
      suggestedReply: 'Thank you! You have re-subscribed to updates from our team. Reply STOP at any time to opt out.',
    };
  }

  return {
    isOptOutCommand: false,
    isOptInCommand: false,
  };
}
