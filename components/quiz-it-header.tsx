import { BrandLockup } from "@/components/ui/quiz-it-ui";

type QuizItHeaderProps = {
  variant?: "default" | "join" | "host";
};
// Host request: "take the circular ME logo away, just use the word block,
// same size across all screens." The circular /me-logo.jpg icon that used
// to sit next to this lockup is gone, and BrandLockup no longer renders at
// a shrunk "compact" size here - see .qi-brand--compact in globals.css,
// which now matches the full size so this reads identically wherever it
// appears rather than smaller on join/host pages specifically.
export function QuizItHeader({ variant = "default" }: QuizItHeaderProps) {
  return (
    <header className="qi-site-header">
      <div className="qi-site-header__inner">
        <BrandLockup />
      </div>
    </header>
  );
}
