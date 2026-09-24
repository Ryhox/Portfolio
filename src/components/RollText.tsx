// Text that rolls up to a copy of itself on hover (pure CSS, see .roll in globals.css).
export default function RollText({ text }: { text: string }) {
  return (
    <span className="roll">
      <span className="sr-only">{text}</span>
      <span className="roll-inner" aria-hidden>
        <span>{text}</span>
        <span>{text}</span>
      </span>
    </span>
  );
}
