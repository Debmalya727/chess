import React from 'react';
import { BookOpen, Cpu, Globe, GitBranch } from 'lucide-react';

export function EducationalSection() {
  return (
    <section className="edu-section">
      <div className="panel-header">
        <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={20} color="#818cf8" /> Educational Computer Science & WebAssembly Engine Architecture Guide
        </h3>
      </div>

      <div className="edu-grid">
        <div className="edu-card">
          <h4><Cpu size={18} inline="true" /> Stockfish 18 WebAssembly (WASM)</h4>
          <p>
            Stockfish 18 is compiled into WebAssembly (WASM) to run natively inside your web browser at near C++ speeds.
            This enables $0-cost static deployment on Vercel with zero server overhead or external API requirements.
          </p>
        </div>

        <div className="edu-card">
          <h4>⚡ Web Workers Off-Thread Execution</h4>
          <p>
            Heavy chess engine calculations run inside a dedicated <code>Web Worker</code> off the main UI thread.
            Communication between React and the engine uses <code>postMessage</code> to prevent any UI freezing during deep searches.
          </p>
        </div>

        <div className="edu-card">
          <h4><GitBranch size={18} inline="true" /> UCI Protocol & Multi-PV Analysis</h4>
          <p>
            The Universal Chess Interface (UCI) protocol sends commands like <code>position fen &lt;fen&gt;</code> and <code>go depth 20</code>.
            Multi-PV evaluates top candidate lines simultaneously, displaying principal variations and centipawn win probabilities.
          </p>
        </div>

        <div className="edu-card">
          <h4>📜 Stockfish Open Source Attribution & GPL-3.0</h4>
          <p>
            Stockfish is an open-source, world-class chess engine licensed under the <strong>GNU General Public License v3.0 (GPL-3.0)</strong>.
            This platform uses official Stockfish 18 WebAssembly builds strictly for open-source educational research and analysis.
          </p>
        </div>
      </div>
    </section>
  );
}
