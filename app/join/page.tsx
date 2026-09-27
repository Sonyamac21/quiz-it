import { InstallAppPrompt } from "@/components/InstallAppPrompt";
import { BrandLockup } from "@/components/ui/quiz-it-ui";
import { JoinForm } from "./join-form";

// Host, live: "top of the iphone obscures branding due to camera etc. put
// branding at the bottom instead and replace the wording already there."
// The top QuizItHeader lockup sat right under the notch/camera cutout on
// real phones and got clipped there - removed rather than shrunk, since
// the PIN card already carries its own QUIZ-IT wordmark just below where
// the header used to be. The plain-text footer line is replaced with the
// same full BrandLockup used elsewhere, so the complete brand block now
// lives at the bottom of the screen where nothing obscures it.
export default function JoinPage() {
  return (
    <div className="qi-app-shell qi-player-experience flex min-h-dvh flex-col">
      <main className="qi-player-join-main flex flex-1 flex-col items-center justify-center px-4 py-6">
        <JoinForm />
        <InstallAppPrompt label="your team" />
      </main>
      <footer className="px-3 py-4 text-center">
        <BrandLockup />
      </footer>
    </div>
  );
}
