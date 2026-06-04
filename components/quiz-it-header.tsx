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
    <header className="w-full bg-black/40 border-b border-[#BE26C1]/30 px-4 py-2">
      <div className="flex items-center justify-between max-w-screen-xl mx-auto">

        <div className="flex items-center gap-3">
          <img src="/me-logo.jpg" alt="ME Logo" className="w-10 h-10 rounded-full border border-[#BE26C1]/60 object-cover" />
          <div className="flex flex-col leading-tight">
            <span className="font-logo text-[10px] tracking-[3px] text-[#BE26C1]">Mac Entertainment</span>
            <span className="font-logo text-[7px] tracking-[2px] text-white/30">by Sonya Mac</span>
          </div>
        </div>

        <h1 className={`font-logo tracking-widest text-white ${titleSize}`}>
          Quiz<span className="text-[#BE26C1]">-It</span>
        </h1>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end leading-tight">
            <span className="font-logo text-[7px] tracking-[2px] text-white/30">Quiz-It powered by</span>
            <span className="font-logo text-[9px] tracking-[2px] text-[#BE26C1]/60">Mac Entertainment</span>
          </div>
          <img src="/me-logo.jpg" alt="ME Logo" className="w-10 h-10 rounded-full border border-[#BE26C1]/60 object-cover" />
        </div>

      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#BE26C1] to-transparent mt-2 opacity-60" />
    </header>
  );
}
