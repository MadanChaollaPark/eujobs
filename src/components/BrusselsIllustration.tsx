export default function BrusselsIllustration() {
  return (
    <div className="brussels-art" aria-hidden="true">
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-orbit orbit-three" />
      <span className="art-coordinate">50°50′ N · 04°21′ E</span>
      <svg viewBox="0 0 420 260" fill="none">
        <path d="M25 224H396" stroke="#728b75" />
        <path
          d="M92 224V140L148 123V224M148 124L205 141V224"
          fill="#dbe5d3"
          stroke="#6e896f"
          strokeWidth="1.5"
        />
        <path
          d="M103 153L138 143M103 164L138 154M103 175L138 165M103 186L138 176M103 197L138 187M103 208L138 198M160 145L193 155M160 157L193 167M160 169L193 179M160 181L193 191M160 193L193 203M160 205L193 215"
          stroke="#6e896f"
        />
        <path
          d="M205 224V106C240 89 285 86 323 106V224"
          fill="#edf0df"
          stroke="#6e896f"
          strokeWidth="1.5"
        />
        <path
          d="M205 107C240 123 285 126 323 107M205 127C240 143 285 146 323 127M205 147C240 163 285 166 323 147M205 167C240 183 285 186 323 167M205 187C240 203 285 206 323 187M224 98V221M244 92V224M265 92V224M285 94V224M304 98V224"
          stroke="#8a9e80"
        />
        <path
          d="M49 224V185H81V224M333 224V166H359V224M362 224V186H380V224"
          fill="#c7d7c0"
          stroke="#6e896f"
        />
        <path d="M51 185L64 171L80 185M334 166L346 151L358 166" stroke="#6e896f" />
        <path
          d="M146 123V66M146 68C158 57 166 78 184 68V94C166 104 161 82 146 92"
          stroke="#526f55"
          strokeWidth="1.5"
        />
        <path d="M147 68C158 57 166 78 184 68V94C166 104 161 82 147 92Z" fill="#153e35" />
        <circle cx="166" cy="81" r="4" stroke="#d8f174" strokeDasharray="1 2" strokeWidth="2" />
        <path
          d="M32 225V207M26 208C21 190 39 190 37 208M384 224V198M377 199C371 178 397 181 391 199"
          stroke="#526f55"
          fill="#acc597"
        />
        <path
          d="M88 60C112 37 152 34 177 41M230 63C260 44 297 51 306 70"
          stroke="#bbcbb0"
          strokeDasharray="3 6"
        />
        <circle cx="318" cy="63" r="6" fill="#d8f174" />
        <circle cx="78" cy="78" r="4" fill="#93b183" />
      </svg>
      <div className="art-label">
        <span className="live-dot" />
        Brussels & beyond
      </div>
      <span className="art-note">
        A small city.
        <br />A world of possibility.
      </span>
    </div>
  );
}
