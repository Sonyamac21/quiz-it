import { notFound } from "next/navigation";
import { FitBlockText } from "@/components/FitBlockText";
import { BrandLockup } from "@/components/ui/quiz-it-ui";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className="qi-display-shell"><div className="qi-display-celebration"><div className="qi-display-celebration-content">
    <div className="qi-display-eyebrow">FASTEST CORRECT ANSWER</div>
    <FitBlockText className="qi-display-fastest-team" maxViewportHeight={0.2} minFontSize={32}>The Extremely Enthusiastic Thursday Night Quiz Champions</FitBlockText>
    <div className="qi-display-fastest-photo"><img src="/me-logo.jpg" alt="Test winner photograph" /></div>
  </div></div><div className="qi-display-corner-mark"><img src="/me-logo.jpg" width={58} height={58} alt="Mac Entertainment" /><BrandLockup compact /></div></div>;
}
