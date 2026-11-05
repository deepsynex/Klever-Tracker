/**
 * Parsers for the planning docs shown on the local /dev page: the phase table and
 * checklists in implementation-plan.md, and the request tables in backend-changes.md. Pure, so
 * Vitest can test them. They read the docs' current shapes and skip anything they don't recognise.
 */

export type Phase = { number: string; name: string; weeks: string; backend: string; current: boolean };
export type ChecklistItem = { done: boolean; text: string; note: string | null };
export type Checklist = { heading: string; items: ChecklistItem[] };
export type RequestTone = "done" | "partial" | "decision" | "pending";
export type BackendRequest = { id: string; section: string; change: string; why: string; status: string; tone: RequestTone };

/** Drops markdown emphasis and links, keeping the text (`code` stays readable without backticks). */
export function plain(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isDivider = (line: string) => /^\|?\s*:?-{3,}/.test(line.trim());

/** Lines of the section that starts at the first heading matching `title`, up to the next heading of the same or higher level. */
function section(md: string, title: RegExp): string[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && title.test(l));
  if (start < 0) return [];
  const level = /^(#+)/.exec(lines[start])![1].length;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#+)\s/.exec(lines[i]);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return out;
}

/** The "## 2. Phases" table. The bold row is the phase being worked on. */
export function parsePhases(md: string): Phase[] {
  return section(md, /Phases\s*$/)
    .filter((l) => l.trim().startsWith("|") && !isDivider(l))
    .slice(1)
    .map((l) => {
      const [number = "", name = "", weeks = "", backend = ""] = cells(l);
      return { number: plain(number), name: plain(name), weeks: plain(weeks), backend: plain(backend), current: name.includes("**") };
    })
    .filter((p) => p.number !== "");
}

/** Every heading with "- [ ]" / "- [x]" items under it, with the "_(note)_" split off. */
export function parseChecklists(md: string): Checklist[] {
  const lists: Checklist[] = [];
  let current: Checklist | null = null;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      current = { heading: plain(heading[1]), items: [] };
      lists.push(current);
      continue;
    }
    const item = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (item && current) {
      const body = item[2];
      const note = /\s*_\((.*)\)_\s*$/.exec(body);
      current.items.push({
        done: item[1].toLowerCase() === "x",
        text: plain(note ? body.slice(0, note.index) : body),
        note: note ? plain(note[1]) : null,
      });
    }
  }
  return lists.filter((l) => l.items.length > 0);
}

export function statusTone(status: string): RequestTone {
  const s = status.trim();
  if (/^✓|^done|^confirmed|^answered/i.test(s)) return "done";
  if (/^◐|partly|partial/i.test(s)) return "partial";
  if (/^⚠|decision/i.test(s)) return "decision";
  return "pending";
}

/**
 * Request rows from backend-changes.md: 4-column tables (# | Change | Why | Status), the 3-column
 * "Already done" table (# | Item | Seen in the live API) and "### B9: title (status)" headings.
 */
export function parseBackendRequests(md: string): BackendRequest[] {
  const out: BackendRequest[] = [];
  let sectionName = "";
  let inDoneTable = false;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const h2 = /^##\s+(?:\d+\.\s*)?(.*)$/.exec(line);
    if (h2) {
      sectionName = plain(h2[1]);
      inDoneTable = /already done/i.test(sectionName);
      continue;
    }
    const h3 = /^###\s+([A-Z]+\d+):\s*(.*?)\s*(?:\(([^)]*)\))?\s*$/.exec(line);
    if (h3) {
      const status = h3[3] ?? "";
      out.push({ id: h3[1], section: sectionName, change: plain(h3[2]), why: "", status, tone: statusTone(status) });
      continue;
    }
    if (!line.trim().startsWith("|") || isDivider(line)) continue;
    const c = cells(line).map(plain);
    if (!/^[A-Z]+\d+$/.test(c[0] ?? "")) continue; // header rows
    if (inDoneTable && c.length >= 3) {
      out.push({ id: c[0], section: sectionName, change: c[1], why: c[2], status: "✓ Done", tone: "done" });
    } else if (c.length >= 4) {
      out.push({ id: c[0], section: sectionName, change: c[1], why: c[2], status: c[3], tone: statusTone(c[3]) });
    }
  }
  return out;
}
