type QuizItHeaderProps = {
  variant?: "default" | "join" | "host";
};
export function QuizItHeader({ variant = "default" }: QuizItHeaderProps) {
  const titleSize =
    variant === "join"
      ? "text-4xl sm:text-5xl"
      : variant === "host"
        ? "text-3xl"
        : "text-5xl sm:text-6xl";
  return (
    <header className="w-full bg-[#0d0520] border-b border-[#BE26C1]/40 px-4 py-3 sticky top-0 z-50">
      <div className="flex items-center justify-center relative max-w-screen-xl mx-auto">
        <div className="absolute left-0 flex items-center gap-2">
          <img src="/me-logo.jpg" alt="ME Logo" className="w-9 h-9 rounded-full border border-[#BE26C1]/60 object-cover" />
        </div>
        <h1 className={`font-logo tracking-widest text-white ${titleSize}`}>
          Quiz<span className="text-[#BE26C1]">-It</span>
        </h1>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#BE26C1] to-transparent mt-2 opacity-60" />
    </header>
  );
}
