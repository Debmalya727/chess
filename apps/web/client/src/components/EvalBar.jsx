import React from 'react';

export function EvalBar({ topLine }) {
  let whitePercent = 50;
  let textDisplay = '0.0';

  if (topLine) {
    if (topLine.mate != null) {
      whitePercent = topLine.mate > 0 ? 95 : 5;
      textDisplay = `M${Math.abs(topLine.mate)}`;
    } else if (topLine.score) {
      const cp = topLine.score.value;
      const sign = cp >= 0 ? '+' : '';
      textDisplay = `${sign}${(cp / 100).toFixed(1)}`;
      const winProb = 1 / (1 + Math.pow(10, -cp / 400));
      whitePercent = Math.max(5, Math.min(95, winProb * 100));
    }
  }

  // Show text at bottom (dark on white) when white is dominant, else at top (light on dark)
  const showAtBottom = whitePercent >= 30;

  return (
    <div className="eval-bar-wrapper" title={`Evaluation: ${textDisplay}`}>
      <div className="eval-bar-black" />
      <div className="eval-bar-fill" style={{ height: `${whitePercent}%` }} />
      <div className={`eval-text-overlay ${showAtBottom ? 'on-white' : 'on-black'}`}>
        {textDisplay}
      </div>
    </div>
  );
}
