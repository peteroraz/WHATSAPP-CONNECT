import { AutomationRule, BusinessHours } from '../types/index.ts';

export interface EvaluationContext {
  messageBody: string;
  isFirstMessage: boolean;
  businessHours?: BusinessHours;
  currentDate?: Date;
}

export interface AutomationMatchResult {
  matchedRule: AutomationRule;
  responseBody?: string;
  templateId?: string;
  setConversationStatus?: 'Open' | 'Closed';
}

/**
 * Checks if current time is outside the defined business hours
 */
export function isOutsideBusinessHours(businessHours?: BusinessHours, date: Date = new Date()): boolean {
  if (!businessHours || !businessHours.enabled) {
    return false;
  }

  // Convert to target timezone if possible or use local time
  let dayOfWeek = date.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  // Map to 1 = Mon ... 7 = Sun
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

  if (!businessHours.days.includes(isoDay)) {
    return true; // Not a working day
  }

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const currentTimeStr = `${hours}:${minutes}`;

  if (currentTimeStr < businessHours.startTime || currentTimeStr > businessHours.endTime) {
    return true; // Outside shift
  }

  return false;
}

/**
 * Evaluate list of active automation rules against an incoming customer message.
 * Rules are sorted by priority (1 is highest). First match wins.
 */
export function evaluateAutomationRules(
  rules: AutomationRule[],
  context: EvaluationContext
): AutomationMatchResult | null {
  const activeRules = rules
    .filter((r) => r.status === 'active')
    .sort((a, b) => (a.priority || 5) - (b.priority || 5));

  const cleanBody = (context.messageBody || '').trim().toLowerCase();

  for (const rule of activeRules) {
    let matches = false;

    if (rule.trigger === 'outside_business_hours') {
      if (isOutsideBusinessHours(context.businessHours, context.currentDate)) {
        matches = true;
      }
    } else if (rule.trigger === 'welcome') {
      if (context.isFirstMessage) {
        matches = true;
      }
    } else if (rule.trigger === 'keyword' || rule.trigger === 'incoming_message') {
      const conditionVal = (rule.conditionValue || '').trim().toLowerCase();

      if (!conditionVal) {
        matches = true; // matches any incoming message
      } else if (rule.conditionType === 'equals') {
        matches = cleanBody === conditionVal;
      } else if (rule.conditionType === 'starts_with') {
        matches = cleanBody.startsWith(conditionVal);
      } else {
        // contains
        matches = cleanBody.includes(conditionVal);
      }
    }

    if (matches) {
      let responseBody: string | undefined;
      let templateId: string | undefined;
      let setStatus: 'Open' | 'Closed' | undefined;

      if (rule.actionType === 'send_text') {
        responseBody = rule.actionPayload;
      } else if (rule.actionType === 'send_template') {
        templateId = rule.actionPayload;
      } else if (rule.actionType === 'mark_open') {
        setStatus = 'Open';
      } else if (rule.actionType === 'mark_closed') {
        setStatus = 'Closed';
      }

      return {
        matchedRule: rule,
        responseBody,
        templateId,
        setConversationStatus: setStatus,
      };
    }
  }

  return null;
}
