import { QuizItHeader } from "@/components/quiz-it-header";

export default function Home() {
  return (
    <div style={{ minHeight:"100vh", background:"#080810", display:"flex", flexDirection:"column" }}>
      <QuizItHeader />
      <main style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
        <h1 style={{ fontFamily:"'Bruno Ace SC', sans-serif", fontSize:96, color:"#fff", letterSpacing:8, margin:0, textAlign:"center", textShadow:"0 0 40px rgba(190,38,193,0.5)" }}>
          Quiz<span style={{ color:"#BE26C1" }}>-It</span>
        </h1>
        <p style={{ fontFamily:"'Inter', sans-serif", fontSize:13, color:"rgba(190,38,193,0.5)", letterSpacing:4, margin:0 }}>
          Powered by Mac Entertainment
        </p>
      </main>
    </div>
  );
}
