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
  // Host, live: "the branding is off the join screen" - moving it to a
  // normal-flow footer (previous fix) meant it only showed if the PIN
  // card above it was short enough to leave room within min-h-dvh -
  // min-height doesn't cap anything, so once the keypad was enlarged
  // (separate fix, same night) the card grew taller than the viewport and
  // pushed the footer below the fold entirely - visible only by
  // scrolling, i.e. "off" the screen again, same complaint as the
  // original camera-cutout issue just moved to the other end. Capping the
  // shell at exactly one viewport tall and making ONLY the middle content
  // scroll internally (not the whole page) pins the branding footer at
  // its natural size at the bottom, always - the same "the fixed part
  // never moves, the content around it does" approach already used for
  // the in-quiz bottom brand bar.
  return (
    <div className="qi-app-shell qi-player-experience flex flex-col" style={{ height: "100dvh", overflow: "hidden" }}>
      <main className="qi-player-join-main flex flex-1 flex-col items-center justify-center px-4 py-6" style={{ overflowY: "auto", minHeight: 0 }}>
        <JoinForm />
        <InstallAppPrompt label="your team" />
      </main>
      <footer className="px-3 py-4 text-center" style={{ flexShrink: 0 }}>
        <BrandLockup />
      </footer>
    </div>
  );
}
