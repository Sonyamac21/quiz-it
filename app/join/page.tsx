import { QuizItHeader } from "@/components/quiz-it-header";
import { JoinForm } from "./join-form";

export default function JoinPage() {
  return (
    <div style={{ minHeight:"100vh", background:"#080810", color:"#fff", display:"flex", flexDirection:"column" }}>
      <QuizItHeader variant="join" />
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 16px" }}>
        <JoinForm />
      </div>
      <div style={{ textAlign:"center", padding:"12px", fontFamily:"'Bruno Ace SC', sans-serif", fontSize:8, letterSpacing:2, color:"rgba(190,38,193,0.25)" }}>
        Quiz-It · Mac Entertainment · by Sonya Mac
      </div>
    </div>
  );
}
