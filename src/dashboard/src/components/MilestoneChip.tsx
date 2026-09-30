import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  active?: boolean;
  variant?: "default" | "add";
  meta?: string | null;
  children: ReactNode;
};

export function MilestoneChip({
  active = false,
  variant = "default",
  meta = null,
  className = "",
  children,
  ...rest
}: Props) {
  const classes = [
    "mm-chip",
    active ? "mm-chip--on" : "",
    variant === "add" ? "mm-chip--add" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} aria-pressed={active} {...rest}>
      {active && variant !== "add" && (
        <span className="mm-chip__dot" aria-hidden />
      )}
      <span className="mm-chip__label">{children}</span>
      {meta ? <span className="mm-chip__meta">{meta}</span> : null}
    </button>
  );
}
