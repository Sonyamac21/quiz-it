import Image from "next/image";
import { BrandLockup } from "@/components/ui/quiz-it-ui";

type QuizItHeaderProps = {
  variant?: "default" | "join" | "host";
};
export function QuizItHeader({ variant = "default" }: QuizItHeaderProps) {
  return (
    <header className="qi-site-header">
      <div className="qi-site-header__inner">
        <Image src="/me-logo.jpg" alt="Mac Entertainment" width={42} height={42} className="qi-site-header__mark" />
        <BrandLockup compact={variant === "host" || variant === "join"} />
      </div>
    </header>
  );
}
