/**
 * Helpers for the agency "New demo" brief: receptionist languages, a ready greeting in the
 * main language, and the message the agency sends to the prospect.
 */

export interface LangInfo {
  name: string;
  /** "Hello, <clinic>, this is <agent>." */
  hello: (clinic: string, agent: string) => string;
  /** "How can I help you?" */
  ask: string;
  /** "I also speak <this language>." — said in this language. */
  also: string;
}

export const LANGS: Record<string, LangInfo> = {
  en: { name: 'English', hello: (c, a) => `Hello, ${c}, this is ${a}.`, ask: 'How can I help you?', also: 'And I also speak English.' },
  sl: { name: 'Slovenian', hello: (c, a) => `Dober dan, ${c}, tukaj ${a}.`, ask: 'Kako vam lahko pomagam?', also: 'Govorim tudi slovensko.' },
  hr: { name: 'Croatian', hello: (c, a) => `Dobar dan, ${c}, ovdje ${a}.`, ask: 'Kako vam mogu pomoći?', also: 'Govorim i hrvatski.' },
  it: { name: 'Italian', hello: (c, a) => `Buongiorno, ${c}, sono ${a}.`, ask: 'Come posso aiutarla?', also: 'Parlo anche italiano.' },
  de: { name: 'German', hello: (c, a) => `Guten Tag, ${c}, hier ist ${a}.`, ask: 'Wie kann ich Ihnen helfen?', also: 'Ich spreche auch Deutsch.' },
  fr: { name: 'French', hello: (c, a) => `Bonjour, ${c}, ici ${a}.`, ask: 'Comment puis-je vous aider ?', also: 'Je parle aussi français.' },
  es: { name: 'Spanish', hello: (c, a) => `Buenos días, ${c}, le atiende ${a}.`, ask: '¿En qué puedo ayudarle?', also: 'También hablo español.' },
  pt: { name: 'Portuguese', hello: (c, a) => `Bom dia, ${c}, fala ${a}.`, ask: 'Como posso ajudar?', also: 'Também falo português.' },
  nl: { name: 'Dutch', hello: (c, a) => `Goedendag, ${c}, u spreekt met ${a}.`, ask: 'Waarmee kan ik u helpen?', also: 'Ik spreek ook Nederlands.' },
  pl: { name: 'Polish', hello: (c, a) => `Dzień dobry, ${c}, mówi ${a}.`, ask: 'W czym mogę pomóc?', also: 'Mówię też po polsku.' },
  sr: { name: 'Serbian', hello: (c, a) => `Dobar dan, ${c}, ovde ${a}.`, ask: 'Kako mogu da vam pomognem?', also: 'Govorim i srpski.' },
  bs: { name: 'Bosnian', hello: (c, a) => `Dobar dan, ${c}, ovdje ${a}.`, ask: 'Kako vam mogu pomoći?', also: 'Govorim i bosanski.' },
  tr: { name: 'Turkish', hello: (c, a) => `Merhaba, ${c}, ben ${a}.`, ask: 'Size nasıl yardımcı olabilirim?', also: 'Türkçe de konuşuyorum.' },
  ar: { name: 'Arabic', hello: (c, a) => `مرحباً، ${c}، معك ${a}.`, ask: 'كيف يمكنني مساعدتك؟', also: 'وأتحدث العربية أيضاً.' },
  ur: { name: 'Urdu', hello: (c, a) => `السلام علیکم، ${c}، میں ${a} بات کر رہی ہوں۔`, ask: 'میں آپ کی کیا مدد کر سکتی ہوں؟', also: 'میں اردو بھی بولتی ہوں۔' },
  hi: { name: 'Hindi', hello: (c, a) => `नमस्ते, ${c}, मैं ${a} बोल रही हूँ।`, ask: 'मैं आपकी क्या मदद कर सकती हूँ?', also: 'मैं हिंदी भी बोलती हूँ।' },
};

export const LANG_CODES = Object.keys(LANGS);

/** Languages whose names the default Vapi voice mispronounces — ElevenLabs is suggested for these. */
const NEEDS_ELEVENLABS = ['sl', 'sr', 'bs'];
export const suggestVoice = (langs: string[]): 'vapi' | 'elevenlabs' =>
  langs.some((l) => NEEDS_ELEVENLABS.includes(l)) ? 'elevenlabs' : 'vapi';

/** Main-language hello, one "I also speak …" line per other language (in that language), then the question. */
export function buildGreeting(clinic: string, agent: string, langs: string[]): string {
  const codes = langs.filter((l) => LANGS[l]);
  const main = LANGS[codes[0] ?? 'en'];
  const others = codes.slice(1).map((l) => LANGS[l].also);
  return [main.hello(clinic, agent), ...others, main.ask].join(' ').slice(0, 300);
}

export const languageList = (langs: string[]) => {
  const names = langs.map((l) => LANGS[l]?.name ?? l);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'English';
};

/** The message the agency sends the prospect (WhatsApp / LinkedIn / email). */
export function clientMessage(o: {
  contact: string; clinic: string; url: string; number: string; dedicated: boolean;
  ownerPhone: string; agent: string; langs: string[];
}): string {
  const first = o.contact.trim().split(/\s+/)[0] || 'there';
  const callLine = o.dedicated
    ? `This number is reserved for ${o.clinic}, so you and your team can call it from any phone.`
    : `Call from ${o.ownerPhone} and ${o.agent} answers as ${o.clinic}. Want colleagues to test too? Send me their numbers and I'll add them.`;
  return [
    `Hi ${first}, your AI front desk demo for ${o.clinic} is ready!`,
    '',
    `1) Your clinic dashboard: ${o.url}`,
    'Bookings, calls and chats appear here live, within seconds.',
    '',
    `2) AI phone receptionist: ${o.number}`,
    `${callLine} ${o.agent} speaks ${languageList(o.langs)}.`,
    '',
    '3) Website chat: open the dashboard and tap "Try the website chat".',
    '',
    'Try booking an appointment, asking about prices or opening hours, or call as a nervous patient. It is still a demo, so if anything sounds off, tell me roughly when you called and I will fix it the same day.',
    '',
    'The demo is open for 7 days. Looking forward to your feedback!',
    'Fahd, Fahd AI Services',
  ].join('\n');
}
