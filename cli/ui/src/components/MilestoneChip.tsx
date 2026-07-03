import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  active?: boolean;
  variant?: "default" | "add";
  children: ReactNode;
};

export function MilestoneChip({
  active = false,
  variant = "default",
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
    </button>
  );
}
