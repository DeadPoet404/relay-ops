"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="database-error">
      <span className="eyebrow">RELAY</span>
      <h1>The workspace could not be displayed.</h1>
      <p>
        An unexpected rendering error occurred. No recovery action was
        performed.
      </p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
