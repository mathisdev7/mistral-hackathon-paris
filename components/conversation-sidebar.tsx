"use client";

import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { Brain, Check, ChevronLeft, ChevronRight, Loader2, LogOut, MessageSquare, Moon, MoreHorizontal, Pencil, Plus, Settings, Sun, Trash2, X } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { createConversation, deleteConversation, renameConversation } from "@/lib/conversation-actions";
import type { UserProfile } from "@/components/chat-interface";

type Conversation = {
  id: string;
  title: string;
  targetLanguage: string;
  updatedAt: string;
};

function groupConversations(
  convs: Conversation[],
): { label: string; items: Conversation[] }[] {
  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "This week", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conv of convs) {
    const date = new Date(conv.updatedAt);
    if (isToday(date))           groups[0].items.push(conv);
    else if (isYesterday(date))  groups[1].items.push(conv);
    else if (isThisWeek(date))   groups[2].items.push(conv);
    else                         groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  userProfile: UserProfile;
};

export function ConversationSidebar({
  conversations,
  activeId,
  userProfile,
}: Props) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setMounted(true);
    setCollapsed(localStorage.getItem("sidebarCollapsed") === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  }

  const [isCreating, startCreating] = useTransition();

  // Which item has its menu open
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // Which item is being renamed
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSelect(id: string) {
    router.push(`/chat/${id}`, { scroll: false });
  }

  function handleNew() {
    if (!userProfile.targetLanguage) return;
    startCreating(() => createConversation(userProfile.targetLanguage));
  }

  async function handleDelete(id: string) {
    await deleteConversation(id);
    if (activeId === id) {
      router.push("/chat");
    }
    router.refresh();
  }

  async function handleRename(id: string, title: string) {
    await renameConversation(id, title);
    router.refresh();
  }

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  function startEditing(conv: Conversation) {
    setMenuOpenId(null);
    setEditingId(conv.id);
    setEditValue(conv.title);
    // focus next tick after render
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    if (editingId && editValue.trim()) {
      handleRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <aside
      className={`shrink-0 flex flex-col border-r bg-muted/30 h-full transition-[width] duration-200 ease-in-out overflow-hidden ${
        collapsed ? "w-12" : "w-64"
      }`}
    >
      {collapsed ? (
        /* ── Collapsed rail ── */
        <div className="flex flex-col items-center h-full py-3 gap-2">
          {/* Expand button */}
          <button
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>

          {/* New conversation */}
          <button
            onClick={handleNew}
            disabled={isCreating}
            aria-label="New conversation"
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </button>

          {/* Active conversation dot */}
          {activeId && (
            <div className="size-1.5 rounded-full bg-primary mt-1" />
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Footer icons */}
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            {mounted ? (resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />) : <Moon className="size-4" />}
          </button>
          <button
            onClick={() => router.push("/memory")}
            aria-label="What the AI knows"
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <Brain className="size-4" />
          </button>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      ) : (
        /* ── Expanded sidebar ── */
        <>
          {/* Header */}
          <div className="px-3 border-b flex items-center justify-between shrink-0 h-[57px]">
            <span className="text-sm font-semibold">
              SpokenAI
            </span>
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" onClick={handleNew} disabled={isCreating} aria-label="New conversation">
                {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={toggleCollapsed} aria-label="Collapse sidebar">
                <ChevronLeft className="size-4" />
              </Button>
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8 px-4">
                No conversations yet. Start one!
              </p>
            )}
            {groupConversations(conversations).map(({ label, items }) => (
              <div key={label} className="mb-3">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {label}
                </p>
                <div className="space-y-0.5">
                  {items.map((conv) => (
                    <div
                      key={conv.id}
                      className={`relative flex items-center rounded-lg transition-colors group ${
                        activeId === conv.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent text-foreground"
                      }`}
                    >
                      {editingId === conv.id ? (
                        <div className="flex items-center gap-1 w-full px-2 py-1.5">
                          <input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="flex-1 min-w-0 text-xs bg-background border border-input rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                          <button onClick={commitEdit} className="shrink-0 text-green-500 hover:text-green-600" aria-label="Save">
                            <Check className="size-3.5" />
                          </button>
                          <button onClick={cancelEdit} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Cancel">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleSelect(conv.id)}
                            className="flex-1 min-w-0 text-left px-3 py-2.5"
                          >
                            <div className="flex items-start gap-2">
                              <MessageSquare className="size-3.5 shrink-0 mt-0.5 opacity-50" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate leading-snug">{conv.title}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  {conv.targetLanguage && <span className="font-medium">{conv.targetLanguage}</span>}
                                  {conv.targetLanguage && <span>·</span>}
                                  <span>{formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}</span>
                                </p>
                              </div>
                            </div>
                          </button>

                          <div className="pr-1.5 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                              }}
                              className={`p-1 rounded hover:bg-muted transition-colors ${
                                menuOpenId === conv.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              }`}
                              aria-label="Conversation options"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </button>
                          </div>

                          {menuOpenId === conv.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                              <div className="absolute right-1 top-full mt-0.5 z-20 min-w-[130px] rounded-lg border bg-popover shadow-md py-1 text-popover-foreground">
                                <button
                                  onClick={() => startEditing(conv)}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                                >
                                  <Pencil className="size-3.5 opacity-60" />
                                  Rename
                                </button>
                                <button
                                  onClick={() => { setMenuOpenId(null); handleDelete(conv.id); }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t p-3 flex items-center gap-2 shrink-0">
            {userProfile.image && (
              <Image
                src={userProfile.image}
                alt={userProfile.name}
                width={28}
                height={28}
                className="size-7 rounded-full shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{userProfile.name}</p>
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
              {mounted ? (resolvedTheme === "dark" ? <Sun /> : <Moon />) : <Moon />}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => router.push("/memory")} aria-label="What the AI knows">
              <Brain />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => router.push("/settings")} aria-label="Settings">
              <Settings />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={handleSignOut} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
