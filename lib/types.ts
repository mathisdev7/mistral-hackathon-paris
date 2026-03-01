export type TutorLanguageMode = "native" | "immersive";
export type VoiceGender = "female" | "male";

export interface UserProfile {
  name: string;
  targetLanguage: string;
  nativeLanguage: string;
  motivation: string;
  tutorLanguageMode: TutorLanguageMode;
  voiceGender: VoiceGender;
}

export const LANGUAGES = [
  { value: "English", label: "English", flag: "🇬🇧" },
  { value: "French", label: "French", flag: "🇫🇷" },
  { value: "Spanish", label: "Spanish", flag: "🇪🇸" },
  { value: "German", label: "German", flag: "🇩🇪" },
  { value: "Italian", label: "Italian", flag: "🇮🇹" },
  { value: "Portuguese", label: "Portuguese", flag: "🇧🇷" },
  { value: "Japanese", label: "Japanese", flag: "🇯🇵" },
  { value: "Mandarin Chinese", label: "Mandarin Chinese", flag: "🇨🇳" },
  { value: "Korean", label: "Korean", flag: "🇰🇷" },
  { value: "Arabic", label: "Arabic", flag: "🇸🇦" },
  { value: "Russian", label: "Russian", flag: "🇷🇺" },
  { value: "Dutch", label: "Dutch", flag: "🇳🇱" },
  { value: "Polish", label: "Polish", flag: "🇵🇱" },
];

export const LANGUAGE_LOCALE_MAP: Record<string, string> = {
  English: "en",
  French: "fr",
  Spanish: "es",
  German: "de",
  Italian: "it",
  Portuguese: "pt",
  Japanese: "ja",
  "Mandarin Chinese": "zh",
  Korean: "ko",
  Arabic: "ar",
  Russian: "ru",
  Dutch: "nl",
  Polish: "pl",
};
