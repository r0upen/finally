import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
  testId?: string;
}

export default function Panel({ title, right, className = "", children, testId }: Props) {
  return (
    <section
      data-testid={testId}
      className={`flex min-h-0 min-w-0 flex-col border border-line bg-panel ${className}`}
    >
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-[12px] font-medium text-muted">{title}</h2>
        {right}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
