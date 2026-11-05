export type Kind = "pin" | "element" | "area";
export type Status = "open" | "sent" | "working" | "resolved";
export type Mode = Kind;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Note {
  id: string;
  n: number;
  kind: Kind;
  route: string;
  // The page's origin, so a server shared by several apps keeps their notes apart.
  origin?: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  pickedUpAt?: string;
  status: Status;
  reply?: string;
  resolvedAt?: string;
  // The agent the note went to, as the page names it.
  agent?: string;
  selector: string;
  testId?: string;
  tag: string;
  targetText: string;
  x: number;
  y: number;
  bounds: Box;
  offset?: Box;
  scroll: { x: number; y: number };
  viewport: { width: number; height: number };
  inDialog: boolean;
  context: Record<string, unknown>;
}

export interface Submission {
  id: string;
  submittedAt: string;
  route: string;
  url: string;
  title: string;
  noteIds: string[];
  count: number;
  excerpts: string[];
}

export interface FeedbackState {
  notes: Note[];
  deleted: string[];
  watching: boolean;
  agent?: string;
  // The host picks a running agent at Send, so there's no agent to attach.
  picks?: boolean;
}

// A running agent the host app can deliver notes to, offered when Send is pressed.
export interface Target {
  id: string;
  label: string;
  detail?: string;
}

export interface SubmitResult {
  submission?: Submission;
  sent: number;
  watching: boolean;
  agent?: string;
  delivery?: { to: string; ok: boolean; detail?: string };
}

export const LIFECYCLE = ["status", "sentAt", "pickedUpAt", "reply", "resolvedAt", "agent"] as const;
