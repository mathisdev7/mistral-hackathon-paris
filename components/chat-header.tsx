import { HugeiconsIcon } from "@hugeicons/react";
import { BotIcon, VolumeHighIcon, VolumeMute02Icon } from "@hugeicons/core-free-icons";

type Props = {
  targetLanguage: string;
  userName: string;
  isSessionActive: boolean;
  ttsEnabled: boolean;
  onToggleTtsAction: () => void;
};

export function ChatHeader({
  targetLanguage,
  userName,
  isSessionActive,
  ttsEnabled,
  onToggleTtsAction,
}: Props) {
  return (
    <header
      className={`flex items-center justify-between border-b px-4 shrink-0 h-[57px] transition-colors ${
        isSessionActive ? "bg-emerald-500/10 border-emerald-500/30" : "bg-background"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`size-8 rounded-full flex items-center justify-center transition-colors ${
            isSessionActive ? "bg-emerald-500/20" : "bg-primary/10"
          }`}
        >
          <HugeiconsIcon
            icon={BotIcon}
            size={16}
            className={`${isSessionActive ? "text-emerald-600" : "text-primary"}`}
          />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">{targetLanguage} tutor</p>
          <p className="text-xs text-muted-foreground mt-0.5">Hi, {userName}!</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleTtsAction}
          aria-label={ttsEnabled ? "Mute tutor voice" : "Unmute tutor voice"}
          title={ttsEnabled ? "Mute tutor voice" : "Unmute tutor voice"}
          className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={ttsEnabled ? VolumeHighIcon : VolumeMute02Icon} size={14} />
        </button>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            isSessionActive
              ? "bg-emerald-600 text-white"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isSessionActive ? "Session live" : "Not in session"}
        </span>
      </div>
    </header>
  );
}
