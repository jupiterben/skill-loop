import type { ReactNode } from "react";

interface Props {
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function WorkspaceSection({
  title,
  icon,
  badge,
  actions,
  className,
  children,
}: Props) {
  return (
    <section
      className={`workspace-section${className ? ` ${className}` : ""}`}
    >
      <header className="workspace-section__head">
        <div className="workspace-section__title-wrap">
          {icon && (
            <span className="workspace-section__icon" aria-hidden>
              {icon}
            </span>
          )}
          <h3 className="workspace-section__title">{title}</h3>
          {badge}
        </div>
        {actions && (
          <div className="workspace-section__actions">{actions}</div>
        )}
      </header>
      <div className="workspace-section__body">{children}</div>
    </section>
  );
}
