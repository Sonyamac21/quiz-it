type QuizItHeaderProps = {
  variant?: "default" | "join" | "host";
};

export function QuizItHeader({ variant = "default" }: QuizItHeaderProps) {
  const titleClass =
    variant === "join"
      ? "font-logo text-4xl tracking-wide text-[#BE26C1] sm:text-5xl"
      : variant === "host"
        ? "font-logo text-3xl tracking-wide text-[#BE26C1]"
        : "font-logo text-5xl tracking-wide text-[#BE26C1] sm:text-6xl";

  const taglineClass =
    variant === "join"
      ? "mt-3 text-sm text-white"
      : variant === "host"
        ? "mt-1 text-xs text-white/80"
        : "mt-4 text-sm text-white";

  return (
    <header className="flex flex-col items-center text-center">
      <h1 className={titleClass}>Quiz-It</h1>
      <p className={taglineClass}>Powered by MAC Entertainment</p>
    </header>
  );
}
