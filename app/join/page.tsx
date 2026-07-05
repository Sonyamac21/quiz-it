import { QuizItHeader } from "@/components/quiz-it-header";
import { JoinForm } from "./join-form";

export default function JoinPage() {
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #2d0a5e 0%, #1a0535 60%, #0d0225 100%)", color:"#fff", display:"flex", flexDirection:"column" }}>
      <QuizItHeader variant="join" />
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 16px" }}>
        <JoinForm />
      </div>
      <div style={{ textAlign:"center", padding:"12px", fontSize:8, letterSpacing:2, color:"rgba(190,38,193,0.25)" }}>
        <span style={{ fontFamily:"'Bruno Ace SC', sans-serif" }}>Quiz-It</span><span style={{ fontFamily:"'Inter', sans-serif" }}> · Powered by Mac Entertainment · by Sonya Mac</span>
      </div>
    </div>
  );
}
