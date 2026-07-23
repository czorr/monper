import type { JSX } from 'react'

export default function TrafficLights(): JSX.Element {
  const { monper } = window
  return (
    <div id="traffic">
      <button className="light close" onClick={() => monper.winClose()}>
        <svg viewBox="0 0 10 10"><path d="M2.6 2.6l4.8 4.8M7.4 2.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
      </button>
      <button className="light min" onClick={() => monper.winMinimize()}>
        <svg viewBox="0 0 10 10"><path d="M2.3 5h5.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
      </button>
      <button className="light zoom" onClick={() => monper.winZoom()}>
        <svg viewBox="0 0 10 10"><path d="M2.3 5h5.4M5 2.3v5.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
      </button>
    </div>
  )
}
