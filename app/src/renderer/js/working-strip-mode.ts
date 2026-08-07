export type ActivityStatus = "working" | "waiting";

export type ActivityEntry = {
  key: string;
  status: ActivityStatus;
  title: string;
};

export type OpenStrip = {
  mode: "open";
  label: string;
  confirmToken?: string;
};

export type CompactStrip = {
  mode: "compact";
  title: string;
  label: string;
};

export type WorkingStripState = OpenStrip | CompactStrip;

/** Pure selector for open vs compact vs hidden Working strip. */
export function resolveWorkingStrip(input: {
  openBusy: boolean;
  openLabel?: string;
  openConfirmToken?: string;
  others: { status: ActivityStatus; title: string }[];
}): WorkingStripState | null {
  if (input.openBusy) {
    return {
      mode: "open",
      label: input.openLabel || "Working…",
      ...(input.openConfirmToken ? { confirmToken: input.openConfirmToken } : {}),
    };
  }

  const others = input.others || [];
  if (!others.length) return null;

  let working = 0;
  let waiting = 0;
  const titles: string[] = [];
  for (const o of others) {
    if (o.status === "waiting") waiting += 1;
    else working += 1;
    if (o.title) titles.push(o.title);
  }

  const n = others.length;
  let title: string;
  if (working > 0 && waiting > 0) title = `${n} active`;
  else if (waiting > 0) title = `${n} Waiting`;
  else title = `${n} Working`;

  return {
    mode: "compact",
    title,
    label: titles.join(", "),
  };
}
